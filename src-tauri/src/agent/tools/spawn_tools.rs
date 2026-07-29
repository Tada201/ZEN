use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::tools::child_runner;
use crate::agent::tools::AgentTool;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::{ActionMeta, AgentRegistry, MessageKind, SpawnMeta};
use crate::commands::AppState;
use anyhow::Result;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const MAX_PARALLEL_SUBAGENTS: usize = 8;

/// A single agent request inside a parallel spawn batch, with optional
/// dependency declarations.
#[derive(Debug, Clone)]
struct AgentRequest {
    /// Optional user-supplied identifier. If omitted, a synthetic id is
    /// generated from the array index.
    id: String,
    /// IDs of other agents in the same batch that must complete first.
    depends_on: Vec<String>,
    /// The raw JSON request as received from the tool call.
    request: Value,
}

/// Parsed and validated dependency graph for a parallel spawn batch.
#[derive(Debug)]
struct DependencyGraph {
    nodes: Vec<AgentRequest>,
    /// Execution waves: each inner vector holds indices of agents whose
    /// dependencies are all satisfied at that wave.
    waves: Vec<Vec<usize>>,
}

impl DependencyGraph {
    fn new(nodes: Vec<AgentRequest>) -> Result<Self> {
        let index_by_id: HashMap<String, usize> = nodes
            .iter()
            .enumerate()
            .map(|(idx, node)| (node.id.clone(), idx))
            .collect();

        // Validate that every id is unique.
        if index_by_id.len() != nodes.len() {
            return Err(anyhow::anyhow!(
                "Duplicate agent ids in parallel spawn batch"
            ));
        }

        // Validate that every dependency refers to an existing node.
        for node in &nodes {
            for dep in &node.depends_on {
                if !index_by_id.contains_key(dep) {
                    return Err(anyhow::anyhow!(
                        "Agent '{}' depends on unknown agent '{}'",
                        node.id, dep
                    ));
                }
            }
        }

        // Detect cycles using Kahn's algorithm.
        let mut in_degree = vec![0usize; nodes.len()];
        let mut adjacency: Vec<Vec<usize>> = vec![vec![]; nodes.len()];
        for (idx, node) in nodes.iter().enumerate() {
            for dep in &node.depends_on {
                let dep_idx = index_by_id[dep];
                adjacency[dep_idx].push(idx);
                in_degree[idx] += 1;
            }
        }

        let mut queue: VecDeque<usize> = in_degree
            .iter()
            .enumerate()
            .filter(|(_, d)| **d == 0)
            .map(|(idx, _)| idx)
            .collect();
        let mut topo_order = Vec::new();
        while let Some(idx) = queue.pop_front() {
            topo_order.push(idx);
            for next in &adjacency[idx] {
                in_degree[*next] -= 1;
                if in_degree[*next] == 0 {
                    queue.push_back(*next);
                }
            }
        }

        if topo_order.len() != nodes.len() {
            return Err(anyhow::anyhow!(
                "Circular dependency detected in parallel spawn agents"
            ));
        }

        // Build waves: group agents by the longest dependency chain length.
        let mut wave_by_idx = vec![0usize; nodes.len()];
        for idx in topo_order {
            let max_dep_wave = nodes[idx]
                .depends_on
                .iter()
                .map(|dep| wave_by_idx[index_by_id[dep]])
                .max()
                .unwrap_or(0);
            wave_by_idx[idx] = max_dep_wave + 1;
        }

        let wave_count = wave_by_idx.iter().max().copied().unwrap_or(0);
        let mut waves: Vec<Vec<usize>> = vec![vec![]; wave_count];
        for (idx, wave) in wave_by_idx.into_iter().enumerate() {
            if wave > 0 {
                waves[wave - 1].push(idx);
            }
        }

        Ok(Self {
            nodes,
            waves,
        })
    }
}

/// Skip emitting a `chat:message` event for the spawn announcement.
/// The dedicated `agent:spawn` lifecycle event is the source of
/// truth and reaches the agents panel; a redundant `chat:message`
/// would trigger the frontend's full `setSessionMessages` reducer
/// and stutter the main chat.
fn should_emit_inline_chat_message_for_spawn() -> bool {
    false
}

/// Skip emitting a `chat:message` event for the completion announcement.
/// Same reason as above; the agents panel consumes `agent:complete`.
fn should_emit_inline_chat_message_for_complete() -> bool {
    false
}

/// Parameters for spawning a child agent.
pub(crate) struct SpawnParams<'a> {
    pub app: AppHandle,
    pub chat_id: String,
    pub agent_id: &'a str,
    pub task: &'a str,
    pub context: &'a str,
    pub explicit_model: Option<&'a str>,
    pub explicit_max_steps: Option<u64>,
    pub depth: u32,
    pub allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
    pub token: CancellationToken,
    pub label: &'a str,
    /// When set, spawn an LLM-defined ad-hoc agent with these instructions
    /// instead of looking up `agent_id` in the registry.
    pub adhoc_instructions: Option<&'a str>,
    /// Optional tool subset for an ad-hoc agent (intersected with the ceiling).
    pub adhoc_tools: Vec<String>,
    pub success_criteria: Option<&'a str>,
    pub constraints: Vec<String>,
    pub relevant_files: Vec<String>,
}

/// Parameters for emitting spawn completion events.
struct CompletionParams<'a> {
    app: &'a AppHandle,
    chat_id: &'a str,
    agent_id: &'a str,
    agent_name: &'a str,
    task: &'a str,
    spawn_id: &'a str,
    label: &'a str,
    status: &'a str,
    error: Option<&'a str>,
    result_summary: Option<&'a str>,
    duration_ms: u64,
}

/// Classification for sub-agent execution outcomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubagentStatus {
    Completed,
    Failed,
    Incomplete,
    Uncertain,
}

impl SubagentStatus {
    fn as_str(&self) -> &'static str {
        match self {
            SubagentStatus::Completed => "completed",
            SubagentStatus::Failed => "failed",
            SubagentStatus::Incomplete => "incomplete",
            SubagentStatus::Uncertain => "uncertain",
        }
    }
}

/// Validation result for a sub-agent's output.
#[derive(Debug, Clone)]
struct ValidatedOutput {
    status: SubagentStatus,
    summary: String,
    full_content: String,
    notes: Vec<String>,
}

/// Validate and normalize the raw output from a child agent.
///
/// - Empty/whitespace-only output is marked as `Incomplete`.
/// - Output containing explicit error/failure markers is marked as `Failed`.
/// - Otherwise the output is treated as `Completed`.
fn validate_subagent_output(content: &str) -> ValidatedOutput {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return ValidatedOutput {
            status: SubagentStatus::Incomplete,
            summary: "Sub-agent completed with no output.".to_string(),
            full_content: content.to_string(),
            notes: vec!["Output was empty or whitespace-only.".to_string()],
        };
    }

    let lower = trimmed.to_lowercase();
    let failure_markers = [
        "error:",
        "failed to",
        "unable to",
        "could not",
        "cannot complete",
        "task failed",
        "i failed",
        "execution failed",
        "exception occurred",
    ];

    let mut notes = Vec::new();
    let mut failed = false;
    for marker in failure_markers {
        if lower.contains(marker) {
            notes.push(format!("Output contains failure marker: '{}'", marker));
            failed = true;
        }
    }

    if failed {
        return ValidatedOutput {
            status: SubagentStatus::Failed,
            summary: trimmed.chars().take(500).collect::<String>(),
            full_content: content.to_string(),
            notes,
        };
    }

    // Heuristic: very short outputs are uncertain.
    if trimmed.len() < 30 {
        notes.push("Output was very short; verify it satisfies the success criteria.".to_string());
        return ValidatedOutput {
            status: SubagentStatus::Uncertain,
            summary: trimmed.to_string(),
            full_content: content.to_string(),
            notes,
        };
    }

    ValidatedOutput {
        status: SubagentStatus::Completed,
        summary: trimmed.chars().take(500).collect::<String>(),
        full_content: content.to_string(),
        notes: Vec::new(),
    }
}

/// Classification for errors returned by a sub-agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ErrorClass {
    Transient,
    Permanent,
    Retryable,
}

impl ErrorClass {
    fn as_str(&self) -> &'static str {
        match self {
            ErrorClass::Transient => "transient",
            ErrorClass::Permanent => "permanent",
            ErrorClass::Retryable => "retryable",
        }
    }
}

/// Classify an error message into a structured error class.
fn classify_spawn_error(error: &str) -> ErrorClass {
    let lower = error.to_lowercase();
    if lower.contains("cancelled")
        || lower.contains("timeout")
        || lower.contains("timed out")
        || lower.contains("connection")
        || lower.contains("rate limit")
        || lower.contains("503")
        || lower.contains("502")
        || lower.contains("504")
    {
        ErrorClass::Transient
    } else if lower.contains("permission")
        || lower.contains("not authorized")
        || lower.contains("forbidden")
        || lower.contains("invalid")
        || lower.contains("not found")
    {
        ErrorClass::Permanent
    } else {
        ErrorClass::Retryable
    }
}

fn optional_string(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str).filter(|text| !text.trim().is_empty())
}

fn optional_string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Compiled regex for dependency placeholders of the form `{{agent_id}}`,
/// `{{results.agent_id}}`, `{{agent_id.full_content}}`, or
/// `{{results.agent_id.result}}`.
fn dependency_placeholder_regex() -> &'static regex::Regex {
    use std::sync::OnceLock;
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"\{\{\s*([a-zA-Z0-9_\-]+)(?:\.([a-zA-Z0-9_\-]+))?(?:\.([a-zA-Z0-9_\-]+))?\s*\}\}")
            .expect("valid dependency placeholder regex")
    })
}

/// Resolve a dependency placeholder into an agent id and a field selector.
/// Supports `{{id}}`, `{{results.id}}`, `{{id.field}}`, and
/// `{{results.id.field}}`. The default field is `summary`.
fn parse_dependency_placeholder<'a>(caps: &'a regex::Captures<'a>) -> (&'a str, &'a str) {
    let first = caps.get(1).map(|m| m.as_str()).unwrap_or("");
    let second = caps.get(2).map(|m| m.as_str());
    let third = caps.get(3).map(|m| m.as_str());

    if first == "results" {
        // {{results.id}} or {{results.id.field}}
        let id = second.unwrap_or("");
        let field = third.unwrap_or("summary");
        (id, field)
    } else {
        // {{id}} or {{id.field}}
        let id = first;
        let field = second.unwrap_or("summary");
        (id, field)
    }
}

/// Substitute placeholders of the form `{{agent_id}}` or `{{results.agent_id}}`
/// inside a task/context string with the referenced agent's result.
/// Supported fields: `summary` (default), `full_content`, `result` (full JSON).
fn substitute_dependency_placeholders(template: &str, results: &HashMap<String, Value>) -> String {
    let re = dependency_placeholder_regex();
    re.replace_all(template, |caps: &regex::Captures<'_>| {
        let (id, field) = parse_dependency_placeholder(caps);
        match results.get(id) {
            Some(result) => match field {
                "summary" => result
                    .get("summary")
                    .and_then(Value::as_str)
                    .or_else(|| result.get("result").and_then(|r| r.get("summary")).and_then(Value::as_str))
                    .unwrap_or("")
                    .to_string(),
                "full_content" => result
                    .get("full_content")
                    .and_then(Value::as_str)
                    .or_else(|| result.get("result").and_then(|r| r.get("full_content")).and_then(Value::as_str))
                    .unwrap_or("")
                    .to_string(),
                "result" => result.to_string(),
                _ => result
                    .get("summary")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            },
            None => format!("{{{{{}.{}}}}}", id, field),
        }
    })
    .into_owned()
}

/// Send a message to a running sub-agent identified by its `spawn_id`.
/// The message is appended to the sub-agent's inbox and will be drained
/// into its conversation at the start of the next iteration.
/// Returns an error if no sub-agent with that `spawn_id` is running.
pub async fn send_message_to_subagent(
    app: &tauri::AppHandle,
    spawn_id: &str,
    message: crate::db::models::ChatMessage,
) -> Result<()> {
    let state = app.state::<AppState>();
    let queues = state.subagent_message_queues.lock().await;
    if let Some(queue) = queues.get(spawn_id) {
        let mut q = queue.lock().await;
        q.push_back(message);
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "No running sub-agent with spawn_id {}",
            spawn_id
        ))
    }
}

fn handoff_fields_from_input(input: &Value) -> (Option<String>, Vec<String>, Vec<String>) {
    (
        optional_string(input.get("success_criteria")).map(str::to_string),
        optional_string_list(input.get("constraints")),
        optional_string_list(input.get("relevant_files")),
    )
}

/// Tool that spawns a child agent runner for parallel sub-tasks.
/// The child agent runs with its own conversation context and bounded iterations,
/// then returns its final response as a tool result.
pub struct SpawnAgentTool {
    tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    agent_registry: Arc<AgentRegistry>,
    hook_registry: Arc<HookRegistry>,
    permissions: crate::tools::GlobalToolRegistry,
}

impl SpawnAgentTool {
    pub fn new(
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        permissions: crate::tools::GlobalToolRegistry,
    ) -> Self {
        Self {
            tool_registry,
            agent_registry,
            hook_registry,
            permissions,
        }
    }

    /// Core child-agent execution logic. The deprecated delegate alias also
    /// calls this implementation for compatibility with persisted references.
    pub(crate) async fn do_spawn(&self, params: SpawnParams<'_>) -> Result<Value> {
        let SpawnParams {
            app,
            chat_id,
            agent_id,
            task,
            context,
            explicit_model,
            explicit_max_steps,
            depth,
            allowed_tools,
            token,
            label,
            adhoc_instructions,
            adhoc_tools,
            success_criteria,
            constraints,
            relevant_files,
        } = params;
        child_runner::check_depth(depth)?;

        if agent_id == "voice_display" {
            anyhow::bail!(
                "voice_display is an internal render-only agent started automatically after a voice response; do not spawn it manually"
            );
        }

        // Determine the caller's tool ceiling so ad-hoc agents inherit the
        // same authority (minus delegation tools) instead of the hardcoded
        // generalist set.
        let caller_tool_ids: Vec<String> = if let Some(ref allowed) = allowed_tools {
            let guard = allowed.lock().await;
            guard.iter().cloned().collect()
        } else {
            Vec::new()
        };

        let resolved = if let Some(instructions) = adhoc_instructions {
            child_runner::resolve_adhoc_agent(
                &self.agent_registry,
                if agent_id.is_empty() { None } else { Some(agent_id) },
                instructions,
                &adhoc_tools,
                &caller_tool_ids,
                explicit_model,
                explicit_max_steps,
            )?
        } else {
            child_runner::resolve_agent(
                &self.agent_registry,
                agent_id,
                explicit_model,
                explicit_max_steps,
            )?
        };

        let handoff = child_runner::build_subagent_handoff(
            &resolved,
            task,
            context,
            success_criteria.as_deref(),
            &constraints,
            &relevant_files,
            depth,
        );
        let child_messages = child_runner::build_child_messages_from_handoff(&handoff);
        let memory_scope = child_runner::subagent_memory_scope(agent_id, task);

        let spawn_id = Uuid::new_v4().to_string();

        // Create a shared inbox so the parent/orchestrator can inject messages
        // into this sub-agent while it is running.
        let message_inbox: Arc<tokio::sync::Mutex<VecDeque<crate::db::models::ChatMessage>>> =
            Arc::new(tokio::sync::Mutex::new(VecDeque::new()));
        {
            let state = app.state::<AppState>();
            let mut queues = state.subagent_message_queues.lock().await;
            queues.insert(spawn_id.clone(), message_inbox.clone());
        }

        let mut child_runner_instance =
            child_runner::build_child_runner(child_runner::ChildRunnerParams {
                app: &app,
                tool_registry: self.tool_registry.clone(),
                agent_registry: self.agent_registry.clone(),
                hook_registry: self.hook_registry.clone(),
                permissions: self.permissions.clone(),
                parent_depth: depth,
                resolved: &resolved,
                allowed_tools,
            })?;
        // Use the stable spawn_id as the child runner's trace_id so every tool
        // event emitted by the sub-agent is correlated with this subagent step.
        child_runner_instance = child_runner_instance
            .with_trace_id(spawn_id.clone())
            .with_memory_scope(memory_scope)
            .with_message_inbox(message_inbox);

        let state = app.state::<AppState>();
        let provider = state.provider().await?;

        // Register this sub-agent instance with the SwarmCoordinator so the
        // swarm view stays consistent with actual running sub-agents.
        let swarm_agent = crate::agent::types::Agent {
            id: spawn_id.clone(),
            name: resolved.agent.name.clone(),
            instructions: resolved.agent.instructions.clone(),
            tool_ids: resolved.agent.tool_ids.clone(),
            model_override: resolved.model.clone().into(),
            max_iterations: Some(resolved.effective_max_steps),
            context_window: resolved.effective_context_window,
            max_messages_in_memory: resolved.effective_max_messages,
            description: resolved.agent.description.clone(),
            model_tier: resolved.agent.model_tier,
        };
        let _ = state.swarm.spawn_agent(swarm_agent).await;

        // Emit spawn start
        let spawn_meta = ActionMeta {
            agent_id: agent_id.to_string(),
            agent_name: resolved.agent.name.clone(),
            iteration: 0,
            depth: 0,
            progress_percent: None,
            tool_call: None,
            tool_result: None,
            handoff: None,
            spawn: Some(SpawnMeta {
                parent_agent: label.to_string(),
                child_agent: resolved.agent.name.clone(),
                task: task.to_string(),
                status: "spawned".to_string(),
                duration_ms: None,
                spawn_id: Some(spawn_id.clone()),
            }),
            approval_request: None,
            ..Default::default()
        };

        if should_emit_inline_chat_message_for_spawn() {
            let _ = app.emit(
                "chat:message",
                json!({
                    "chat_id": chat_id,
                    "kind": MessageKind::AgentSpawn.to_string(),
                    "content": format!("{} to {} for: {}", label, resolved.agent.name, task.chars().take(80).collect::<String>()),
                    "metadata": spawn_meta,
                }),
            );
        }

        let subagent_token = CancellationToken::new();
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), subagent_token.clone());
        }

        let _ = app.emit(
            "agent:spawn",
            json!({
                "spawn_id": spawn_id,
                "parent_agent": label,
                "child_agent_id": resolved.agent.id,
                "child_agent_name": resolved.agent.name,
                "task": task,
                "chat_id": chat_id,
            }),
        );

        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::AgentSpawned {
                agent_id: resolved.agent.id.clone(),
                agent_type: resolved.agent.name.clone(),
            });

        // Emit a chat-visible sub-agent step so the inline timeline can render
        // the delegated task from start through completion.
        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                crate::agent::event_bus::SubagentStepPayload {
                    chat_id: chat_id.clone(),
                    spawn_id: spawn_id.clone(),
                    parent_tool_call_id: None,
                    agent_id: agent_id.to_string(),
                    agent_name: resolved.agent.name.clone(),
                    task: task.to_string(),
                    status: "running".to_string(),
                    result_summary: None,
                    error: None,
                    duration_ms: 0,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    child_tool_call_ids: None,
                },
            ));

        // Run child agent with cancellation support
        let spawn_start = std::time::Instant::now();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::anyhow!("Parent cancelled — sub-agent aborted"))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::anyhow!("Sub-agent task cancelled by user"))
            }
            res = child_runner_instance.run(
                provider.as_ref(),
                chat_id.clone(),
                resolved.model,
                child_messages,
                resolved.agent.clone(),
                crate::llm::ChatRequestConfig::default(),
                CancellationToken::child_token(&token),
            ) => res
        };

        // Cleanup token and message inbox
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.remove(&spawn_id);
        }
        {
            let mut queues = state.subagent_message_queues.lock().await;
            queues.remove(&spawn_id);
        }
        let spawn_duration_ms = spawn_start.elapsed().as_millis() as u64;

        match result {
            Ok(response) => {
                let content = response
                    .content
                    .unwrap_or_else(|| "Sub-agent completed with no output.".to_string());

                let validated = validate_subagent_output(&content);
                let status_str = validated.status.as_str();
                let summary = validated.summary.clone();

                // Try to preserve any structured JSON the child returned, but wrap it
                // with validation metadata so callers can tell whether the result is
                // trustworthy.
                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&content);
                let structured_result = match parsed {
                    Ok(json) => {
                        let mut wrapper = json;
                        if let Some(obj) = wrapper.as_object_mut() {
                            obj.insert("__validated_status".to_string(), json!(status_str));
                            obj.insert("__validation_notes".to_string(), json!(validated.notes));
                        }
                        wrapper
                    }
                    Err(_) => {
                        json!({
                            "status": status_str,
                            "summary": summary,
                            "full_content": validated.full_content,
                            "validation_notes": validated.notes,
                        })
                    }
                };

                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: status_str,
                    error: None,
                    result_summary: Some(&summary),
                    duration_ms: spawn_duration_ms,
                });

                // Update the chat-visible sub-agent step with the final result.
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: None,
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: status_str.to_string(),
                            result_summary: Some(summary.clone()),
                            error: None,
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            child_tool_call_ids: None,
                        },
                    ));

                let _ = state.swarm.terminate_agent(&spawn_id).await;

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": status_str,
                    "result": structured_result,
                    "summary": summary,
                    "validation_notes": validated.notes,
                    "duration_ms": spawn_duration_ms,
                }))
            }
            Err(e) => {
                let error_text = e.to_string();
                let error_class = classify_spawn_error(&error_text);
                let retry_hint = match error_class {
                    ErrorClass::Transient => "This looks like a transient error (network, timeout, rate limit). You may retry the same task.",
                    ErrorClass::Permanent => "This looks like a permanent error (permission, invalid input, not found). Review the task before retrying.",
                    ErrorClass::Retryable => "This error may be retryable with a different approach or smaller task.",
                };

                let _ = emit_completion_events(CompletionParams {
                    app: &app,
                    chat_id: &chat_id,
                    agent_id,
                    agent_name: &resolved.agent.name,
                    task,
                    spawn_id: &spawn_id,
                    label,
                    status: "failed",
                    error: Some(&error_text),
                    result_summary: None,
                    duration_ms: spawn_duration_ms,
                });

                // Mark the chat-visible sub-agent step as failed.
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: None,
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: "failed".to_string(),
                            result_summary: None,
                            error: Some(error_text.clone()),
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            child_tool_call_ids: None,
                        },
                    ));

                let _ = state.swarm.terminate_agent(&spawn_id).await;

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": "error",
                    "error": error_text,
                    "error_class": error_class.as_str(),
                    "retry_hint": retry_hint,
                    "duration_ms": spawn_duration_ms,
                }))
            }
        }
    }
}

#[async_trait]
impl AgentTool for SpawnAgentTool {
    fn id(&self) -> &str {
        "spawn_agent"
    }

    fn description(&self) -> &str {
        "Spawn one or more sub-agents for specialized tasks. Either name a built-in specialist \
         via 'agent_id' (e.g. 'researcher', 'operational_expert') or define an ad-hoc agent inline \
         with 'instructions' (and optionally a 'tools' subset). A batch runs in dependency-aware \
         waves: agents without dependencies run in parallel, and agents that declare 'depends_on' \
         wait for their prerequisites. Use '{{agent_id}}' placeholders in task/context to inject \
         a previous agent's summary. Results include all sub-agent outputs, including failures, \
         so successful siblings are not discarded."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "ID of a built-in specialist (e.g. 'researcher', 'operational_expert'). Omit to define an ad-hoc agent via 'instructions'."
                },
                "instructions": {
                    "type": "string",
                    "description": "Ad-hoc agent role/system prompt. When set, an LLM-defined agent is spawned instead of a built-in one; it inherits the coordinator's tools unless narrowed by 'tools'."
                },
                "tools": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional tool_id subset for an ad-hoc agent. Intersected with the coordinator's tools — can narrow, never widen."
                },
                "task": {
                    "type": "string",
                    "description": "The task/question to give the sub-agent as a user message."
                },
                "context": {
                    "type": "string",
                    "description": "Optional additional context from the parent for the sub-agent handoff summary."
                },
                "success_criteria": {
                    "type": "string",
                    "description": "Optional explicit success criteria for the delegated task."
                },
                "constraints": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional constraints the sub-agent must respect."
                },
                "relevant_files": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional file paths the sub-agent should focus on."
                },
                "max_steps": {
                    "type": "integer",
                    "description": "Maximum iterations for the sub-agent (default: 10).",
                    "default": 10
                },
                "model": {
                    "type": "string",
                    "description": "Optional model override for the sub-agent."
                },
                "agents": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_PARALLEL_SUBAGENTS,
                    "description": "Sub-agents to run in dependency-aware waves. Each needs 'task' plus either 'agent_id' or 'instructions'. Use 'depends_on' to wait for other agents and '{{agent_id}}' placeholders to reference their results.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "agent_id": { "type": "string" },
                            "instructions": { "type": "string" },
                            "tools": { "type": "array", "items": { "type": "string" } },
                            "task": { "type": "string" },
                            "context": { "type": "string" },
                            "success_criteria": { "type": "string" },
                            "constraints": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "relevant_files": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "id": {
                                "type": "string",
                                "description": "Optional identifier for this agent within the batch. Used by other agents' depends_on. Defaults to agent_<index>."
                            },
                            "depends_on": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "IDs of agents that must complete before this agent runs."
                            },
                            "max_steps": { "type": "integer", "minimum": 1 },
                            "model": { "type": "string" }
                        },
                        "required": ["task"]
                    }
                }
            },
            "oneOf": [
                { "required": ["agent_id", "task"] },
                { "required": ["instructions", "task"] },
                { "required": ["agents"] }
            ]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: CancellationToken,
    ) -> Result<Value> {
        if let Some(agents) = input.get("agents").and_then(Value::as_array) {
            if agents.is_empty() || agents.len() > MAX_PARALLEL_SUBAGENTS {
                return Err(anyhow::anyhow!(
                    "agents must contain between 1 and {} entries",
                    MAX_PARALLEL_SUBAGENTS
                ));
            }

            // Parse each agent request, assigning synthetic ids when needed.
            let mut parsed_nodes = Vec::with_capacity(agents.len());
            for (idx, request) in agents.iter().enumerate() {
                let id = request
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("agent_{}", idx));
                let depends_on: Vec<String> = request
                    .get("depends_on")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                parsed_nodes.push(AgentRequest {
                    id,
                    depends_on,
                    request: request.clone(),
                });
            }

            let graph = DependencyGraph::new(parsed_nodes)?;

            // Execute waves sequentially. Agents within a wave run in parallel,
            // and their results become available to subsequent waves.
            let mut results: HashMap<String, Value> = HashMap::new();
            let mut indexed_results: Vec<(usize, Value)> = Vec::with_capacity(graph.nodes.len());
            let mut wave_summaries: Vec<Vec<Value>> = Vec::new();

            for wave in &graph.waves {
                let mut wave_futures: Vec<(usize, String, _)> = Vec::new();

                for &idx in wave {
                    let node = &graph.nodes[idx];
                    let mut request = node.request.clone();

                    // Substitute dependency results into task and context.
                    if let Some(task) = request.get("task").and_then(Value::as_str) {
                        let substituted = substitute_dependency_placeholders(task, &results);
                        request["task"] = json!(substituted);
                    }
                    if let Some(context) = request.get("context").and_then(Value::as_str) {
                        let substituted = substitute_dependency_placeholders(context, &results);
                        request["context"] = json!(substituted);
                    }

                    let app = app.clone();
                    let chat_id = chat_id.clone();
                    let allowed_tools = allowed_tools.clone();
                    let token = token.clone();
                    let id = node.id.clone();
                    let original_idx = idx;
                    let fut = async move {
                        let instructions = request.get("instructions").and_then(Value::as_str);
                        let agent_id = match request.get("agent_id").and_then(Value::as_str) {
                            Some(id_val) => id_val,
                            None if instructions.is_some() => "",
                            None => {
                                return Err(anyhow::anyhow!(
                                    "Each agent needs either 'agent_id' (named specialist) or 'instructions' (ad-hoc agent)"
                                ))
                            }
                        };
                        let task = request
                            .get("task")
                            .and_then(Value::as_str)
                            .ok_or_else(|| anyhow::anyhow!("Missing required field: agents[].task"))?;
                        let context = request.get("context").and_then(Value::as_str).unwrap_or("");
                        let (success_criteria, constraints, relevant_files) =
                            handoff_fields_from_input(&request);
                        let max_steps = request.get("max_steps").and_then(Value::as_u64);
                        let model = request.get("model").and_then(Value::as_str);
                        let tools = request
                            .get("tools")
                            .and_then(Value::as_array)
                            .map(|a| {
                                a.iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_string)
                                    .collect()
                            })
                            .unwrap_or_default();
                        let result = self
                            .do_spawn(SpawnParams {
                                app,
                                chat_id,
                                agent_id,
                                task,
                                context,
                                explicit_model: model,
                                explicit_max_steps: max_steps,
                                depth,
                                allowed_tools,
                                token,
                                label: "Spawning",
                                adhoc_instructions: instructions,
                                adhoc_tools: tools,
                                success_criteria: success_criteria.as_deref(),
                                constraints,
                                relevant_files,
                            })
                            .await?;
                        Ok::<(usize, String, Value), anyhow::Error>((original_idx, id, result))
                    };

                    wave_futures.push((original_idx, node.id.clone(), fut));
                }

                // Run each sub-agent with its own timeout so one slow agent does
                // not block the whole batch indefinitely.
                const SUBAGENT_TIMEOUT_SECONDS: u64 = 600;
                let timeout = std::time::Duration::from_secs(SUBAGENT_TIMEOUT_SECONDS);
                let wave_results: Vec<(usize, String, Value)> =
                    futures::future::join_all(wave_futures.into_iter().map(|(idx, id, fut)| async move {
                        match tokio::time::timeout(timeout, fut).await {
                            Ok(Ok((original_idx, id, result))) => (original_idx, id, result),
                            Ok(Err(error)) => {
                                let text = error.to_string();
                                let class = classify_spawn_error(&text);
                                (
                                    idx,
                                    id,
                                    json!({
                                        "status": "error",
                                        "error": text,
                                        "error_class": class.as_str(),
                                        "retry_hint": "This sub-agent failed. Consider retrying with a narrower task.",
                                    }),
                                )
                            }
                            Err(_) => {
                                let text = format!("Sub-agent timed out after {} seconds", SUBAGENT_TIMEOUT_SECONDS);
                                let class = classify_spawn_error(&text);
                                (
                                    idx,
                                    id,
                                    json!({
                                        "status": "error",
                                        "error": text,
                                        "error_class": class.as_str(),
                                        "retry_hint": "This sub-agent timed out. Consider retrying with a narrower task.",
                                    }),
                                )
                            }
                        }
                    }))
                    .await;

                let mut wave_summary: Vec<Value> = Vec::new();
                for (idx, id, result) in wave_results {
                    wave_summary.push(json!({
                        "id": id,
                        "status": result.get("status").and_then(Value::as_str).unwrap_or("unknown")
                    }));
                    results.insert(id.clone(), result.clone());
                    indexed_results.push((idx, result));
                }
                wave_summaries.push(wave_summary);
            }

            // Preserve original array ordering in the final results list.
            indexed_results.sort_by_key(|(idx, _)| *idx);
            let results_in_order: Vec<Value> = indexed_results.into_iter().map(|(_, r)| r).collect();

            let completed = results_in_order
                .iter()
                .filter(|result| result.get("status").and_then(Value::as_str) == Some("completed"))
                .count();
            let failed = results_in_order.len() - completed;

            // Build a merged summary of all sub-agent results for easy consumption
            // by the parent LLM.
            let merged_summary: Vec<String> = results_in_order
                .iter()
                .enumerate()
                .map(|(index, result)| {
                    let status = result.get("status").and_then(Value::as_str).unwrap_or("unknown");
                    let summary = result
                        .get("summary")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .chars()
                        .take(200)
                        .collect::<String>();
                    format!("[{}] {}: {}", index + 1, status, summary)
                })
                .collect();

            return Ok(json!({
                "status": if completed == results_in_order.len() { "completed" } else if completed == 0 { "error" } else { "partial" },
                "parallel": true,
                "completed": completed,
                "failed": failed,
                "results": results_in_order,
                "merged_summary": merged_summary,
                "waves": wave_summaries,
            }));
        }

        let instructions = input.get("instructions").and_then(|v| v.as_str());
        let agent_id = match input.get("agent_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None if instructions.is_some() => "",
            None => {
                return Err(anyhow::anyhow!(
                    "Provide either 'agent_id' (named specialist) or 'instructions' (ad-hoc agent)"
                ))
            }
        };

        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: task"))?;

        let max_steps = input.get("max_steps").and_then(|v| v.as_u64());
        let model = input.get("model").and_then(|v| v.as_str());
        let tools = input
            .get("tools")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();

        let (success_criteria, constraints, relevant_files) = handoff_fields_from_input(&input);
        let context = input.get("context").and_then(Value::as_str).unwrap_or("");

        self.do_spawn(SpawnParams {
            app,
            chat_id,
            agent_id,
            task,
            context,
            explicit_model: model,
            explicit_max_steps: max_steps,
            depth,
            allowed_tools,
            token,
            label: "Spawning",
            adhoc_instructions: instructions,
            adhoc_tools: tools,
            success_criteria: success_criteria.as_deref(),
            constraints,
            relevant_files,
        })
        .await
    }
}

/// Shared helper to emit completion events for spawn/delegate tools.
fn emit_completion_events(params: CompletionParams<'_>) -> Result<()> {
    let CompletionParams {
        app,
        chat_id,
        agent_id,
        agent_name,
        task,
        spawn_id,
        label,
        status,
        error,
        result_summary,
        duration_ms,
    } = params;
    let state = app.state::<AppState>();

    // Emit chat:message completion
    let complete_meta = ActionMeta {
        agent_id: agent_id.to_string(),
        agent_name: agent_name.to_string(),
        iteration: 0,
        depth: 0,
        progress_percent: None,
        tool_call: None,
        tool_result: None,
        handoff: None,
        spawn: Some(SpawnMeta {
            parent_agent: label.to_string(),
            child_agent: agent_name.to_string(),
            task: task.to_string(),
            status: status.to_string(),
            duration_ms: Some(duration_ms),
            spawn_id: Some(spawn_id.to_string()),
        }),
        approval_request: None,
        ..Default::default()
    };

    let content = if status == "completed" {
        format!("{} completed in {}ms", agent_name, duration_ms)
    } else {
        format!(
            "✗ {} session failed: {}",
            agent_name,
            error.unwrap_or("unknown")
        )
    };

    if should_emit_inline_chat_message_for_complete() {
        let _ = app.emit(
            "chat:message",
            json!({
                "chat_id": chat_id,
                "kind": MessageKind::AgentSpawn.to_string(),
                "content": content,
                "metadata": complete_meta,
            }),
        );
    }

    state
        .agent
        .event_bus
        .emit(crate::agent::event_bus::AgentEvent::AgentTerminated {
            agent_id: agent_id.to_string(),
        });

    let _ = app.emit(
        "agent:complete",
        json!({
            "spawn_id": spawn_id,
            "agent_id": agent_id,
            "chat_id": chat_id,
            "parent_agent": label,
            "child_agent_id": agent_id,
            "child_agent_name": agent_name,
            "task": task,
            "status": status,
            "error": error,
            "result": result_summary.map(|summary| json!({ "summary": summary })),
            "duration_ms": duration_ms,
        }),
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_completion_skips_chat_message_kind() {
        assert!(!should_emit_inline_chat_message_for_spawn());
        assert!(!should_emit_inline_chat_message_for_complete());
    }

    fn make_agent_request(id: &str, depends_on: &[&str]) -> AgentRequest {
        AgentRequest {
            id: id.to_string(),
            depends_on: depends_on.iter().map(|s| s.to_string()).collect(),
            request: json!({"task": "test"}),
        }
    }

    #[test]
    fn dependency_graph_no_dependencies_single_wave() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &[]),
            make_agent_request("c", &[]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 1);
        assert_eq!(graph.waves[0].len(), 3);
    }

    #[test]
    fn dependency_graph_linear_chain_waves() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["b"]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 3);
        assert!(graph.waves[0].contains(&0));
        assert!(graph.waves[1].contains(&1));
        assert!(graph.waves[2].contains(&2));
    }

    #[test]
    fn dependency_graph_diamond_shape() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["a"]),
            make_agent_request("d", &["b", "c"]),
        ];
        let graph = DependencyGraph::new(nodes).unwrap();
        assert_eq!(graph.waves.len(), 3);
        assert!(graph.waves[0].contains(&0));
        assert!(graph.waves[1].contains(&1));
        assert!(graph.waves[1].contains(&2));
        assert!(graph.waves[2].contains(&3));
    }

    #[test]
    fn dependency_graph_detects_cycle() {
        let nodes = vec![
            make_agent_request("a", &["c"]),
            make_agent_request("b", &["a"]),
            make_agent_request("c", &["b"]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("Circular dependency"));
    }

    #[test]
    fn dependency_graph_detects_missing_dependency() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("b", &["z"]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("unknown agent"));
    }

    #[test]
    fn dependency_graph_detects_duplicate_ids() {
        let nodes = vec![
            make_agent_request("a", &[]),
            make_agent_request("a", &[]),
        ];
        let err = DependencyGraph::new(nodes).unwrap_err();
        assert!(err.to_string().contains("Duplicate"));
    }

    #[test]
    fn substitute_dependency_placeholders_default_summary() {
        let mut results = HashMap::new();
        results.insert(
            "agent_1".to_string(),
            json!({"summary": "the summary", "full_content": "the full content"}),
        );
        assert_eq!(
            substitute_dependency_placeholders("{{agent_1}}", &results),
            "the summary"
        );
        assert_eq!(
            substitute_dependency_placeholders("{{results.agent_1}}", &results),
            "the summary"
        );
    }

    #[test]
    fn substitute_dependency_placeholders_full_content() {
        let mut results = HashMap::new();
        results.insert(
            "agent_1".to_string(),
            json!({"summary": "the summary", "full_content": "the full content"}),
        );
        assert_eq!(
            substitute_dependency_placeholders("{{agent_1.full_content}}", &results),
            "the full content"
        );
        assert_eq!(
            substitute_dependency_placeholders("{{results.agent_1.full_content}}", &results),
            "the full content"
        );
    }

    #[test]
    fn substitute_dependency_placeholders_unknown_id_preserved() {
        let results = HashMap::new();
        assert_eq!(
            substitute_dependency_placeholders("{{missing.summary}}", &results),
            "{{missing.summary}}"
        );
    }
}
