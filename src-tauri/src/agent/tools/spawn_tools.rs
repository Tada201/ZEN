use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::tools::child_runner;
use crate::agent::tools::AgentTool;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::AgentRegistry;
use crate::commands::AppState;
use crate::error::ZenError;
use anyhow::Result;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const MAX_PARALLEL_SUBAGENTS: usize = 8;

/// Ceiling on sub-agent runs executing concurrently across the whole process.
/// The per-call wave path already caps one batch at `MAX_PARALLEL_SUBAGENTS`,
/// but nested delegation and multiple concurrent parent turns are otherwise
/// unbounded and can exhaust provider rate limits. Every `do_spawn` acquires a
/// permit before running its child and releases it on completion.
const MAX_GLOBAL_CONCURRENT_SUBAGENTS: usize = 16;

static SUBAGENT_CONCURRENCY: std::sync::LazyLock<Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(MAX_GLOBAL_CONCURRENT_SUBAGENTS)));

/// Wall-clock ceiling for a single sub-agent run. Bounds the direct spawn path
/// (and the parallel-wave path) so a child whose provider/tool hangs without
/// observing cancellation cannot leave the parent tool call and the Agents
/// panel stuck at "Working" indefinitely.
const SUBAGENT_TIMEOUT_SECONDS: u64 = 600;

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

/// Parameters for spawning a child agent.
pub(crate) struct SpawnParams<'a> {
    pub app: AppHandle,
    pub chat_id: String,
    /// The parent spawn/delegation tool call that owns this child run.
    pub parent_tool_call_id: Option<String>,
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

/// Classification for sub-agent output validation.
///
/// Only `Completed` and `Incomplete` are produced: a run that returns `Ok` with
/// non-empty text is `Completed` (failure-marker heuristics attach advisory
/// notes rather than downgrading it), and empty output is `Incomplete`. Genuine
/// run failures are reported separately as the terminal `"failed"`/`"cancelled"`
/// status on the spawn result, not through this enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubagentStatus {
    Completed,
    Incomplete,
}

impl SubagentStatus {
    fn as_str(&self) -> &'static str {
        match self {
            SubagentStatus::Completed => "completed",
            SubagentStatus::Incomplete => "incomplete",
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
/// This runs only after the child runner returned `Ok` — the run's terminal
/// status is the primary success signal. Text heuristics are advisory: a phrase
/// like "unable to reproduce" or "error:" in a legitimate answer must not flip a
/// successful run to `Failed`, so failure markers only attach notes. Genuinely
/// empty output is still `Incomplete` because there is nothing to return.
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
    for marker in failure_markers {
        if lower.contains(marker) {
            notes.push(format!(
                "Output mentions '{}' — verify the result actually satisfies the task.",
                marker
            ));
        }
    }

    // Advisory only: a short answer may be perfectly valid, so note it without
    // downgrading the runner's successful terminal status.
    if trimmed.len() < 30 {
        notes.push("Output was very short; verify it satisfies the success criteria.".to_string());
    }

    ValidatedOutput {
        status: SubagentStatus::Completed,
        summary: trimmed.chars().take(500).collect::<String>(),
        full_content: content.to_string(),
        notes,
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

/// Typed failure cause for a sub-agent run, constructed at the known failure
/// sites inside `do_spawn`. Carrying the cause structurally means downstream
/// classification (cancelled-vs-failed terminal status, retry hints) reads
/// the marker instead of re-matching our own error wording, which silently
/// broke whenever a message changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpawnFailure {
    /// The user stopped this sub-agent explicitly.
    UserCancelled,
    /// The parent run was cancelled or aborted, taking the child with it.
    ParentCancelled,
    /// The child exceeded `SUBAGENT_TIMEOUT_SECONDS`.
    Timeout,
}

#[derive(Debug)]
struct SpawnFailureError {
    kind: SpawnFailure,
    message: String,
}

impl SpawnFailureError {
    fn new(kind: SpawnFailure, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl std::fmt::Display for SpawnFailureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for SpawnFailureError {}

/// Structurally classify a sub-agent failure.
///
/// Known spawn failures (cancellation, timeout) map directly from their typed
/// marker; provider errors classify from their `ZenError` shape — HTTP status
/// class, reqwest failure kind, or explicit variants like `NoModelSelected`.
/// Anything opaque falls into the generic `Retryable` bucket instead of
/// guessing from message wording.
fn classify_spawn_error(error: &anyhow::Error) -> ErrorClass {
    for cause in error.chain() {
        if let Some(failure) = cause.downcast_ref::<SpawnFailureError>() {
            return match failure.kind {
                SpawnFailure::UserCancelled
                | SpawnFailure::ParentCancelled
                | SpawnFailure::Timeout => ErrorClass::Transient,
            };
        }
        if let Some(zen) = cause.downcast_ref::<ZenError>() {
            match zen {
                ZenError::Aborted => return ErrorClass::Transient,
                ZenError::NoModelSelected | ZenError::ContextTooLarge(..) => {
                    return ErrorClass::Permanent;
                }
                ZenError::Http(http) => {
                    if let Some(status) = http.status {
                        if status == 429 || (500..=599).contains(&status) {
                            return ErrorClass::Transient;
                        }
                        // Other 4xx (401/403/404/400…): the request itself is
                        // wrong; retrying unchanged cannot help.
                        return ErrorClass::Permanent;
                    }
                    if http.timeout || http.connect {
                        return ErrorClass::Transient;
                    }
                    return ErrorClass::Retryable;
                }
                // Other variants carry no class signal — keep walking the
                // chain so a wrapped provider error deeper in still counts.
                _ => continue,
            };
        }
    }
    ErrorClass::Retryable
}

/// Terminal status for a failed sub-agent run: cancellation is surfaced as
/// `cancelled` (not `failed`) only when the typed marker says so.
fn spawn_failure_status(error: &anyhow::Error) -> &'static str {
    let cancelled = error.chain().any(|cause| {
        cause.downcast_ref::<SpawnFailureError>().is_some_and(|failure| {
            matches!(failure.kind, SpawnFailure::UserCancelled | SpawnFailure::ParentCancelled)
        })
    });
    if cancelled { "cancelled" } else { "failed" }
}

fn optional_string(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str).filter(|text| !text.trim().is_empty())
}

/// The model a child should inherit when neither the spawn request nor the
/// agent profile names one. Built-in profiles ship with `model_override: null`,
/// so this is the normal path rather than an edge case. Prefers the chat's own
/// model over the globally selected one so a child matches the turn that
/// spawned it.
async fn inherited_model_for_child(app: &AppHandle, chat_id: &str) -> Option<String> {
    let state = app.state::<AppState>();
    let db = state.db().await.ok()?;
    let chat_model = crate::db::queries::get_chat(&db, chat_id)
        .await
        .ok()
        .and_then(|chat| chat.model)
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty());
    if chat_model.is_some() {
        return chat_model;
    }
    crate::db::queries::get_setting(&db, "active_model")
        .await
        .ok()
        .flatten()
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
}

/// Split a `provider::model` selection (the canonical form the settings UI
/// stores). Returns `(provider, model)` where a bare model id yields `None` for
/// the provider (meaning "use the active provider"). Returns `None` when there
/// is no usable model id.
pub(crate) fn parse_provider_model(raw: &str) -> Option<(Option<String>, String)> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    match raw.split_once("::") {
        Some((provider, model)) => {
            let model = model.trim();
            if model.is_empty() {
                return None;
            }
            let provider = provider.trim();
            Some((
                (!provider.is_empty()).then(|| provider.to_string()),
                model.to_string(),
            ))
        }
        None => Some((None, raw.to_string())),
    }
}

/// The user-selected model for a specific registered agent, stored by the
/// Subagents settings page under `agent_model.<id>` as a canonical
/// `provider::model` string. Built-in profiles reject edits, so this per-agent
/// setting is how a built-in (generalist / explore) gets a persisted model
/// without mutating its fixed profile. `None` when unset or blank.
async fn configured_agent_model(app: &AppHandle, agent_id: &str) -> Option<(Option<String>, String)> {
    if agent_id.trim().is_empty() {
        return None;
    }
    let state = app.state::<AppState>();
    let raw = state
        .settings_manager
        .get(&format!("agent_model.{agent_id}"))
        .await
        .ok()
        .flatten()?;
    parse_provider_model(&raw)
}

/// The user-selected reasoning effort for a specific registered agent, stored by
/// the Subagents settings page under `agent_reasoning.<id>` as a canonical effort
/// level. `None` when unset or blank, meaning the child inherits (no reasoning
/// override is applied).
async fn configured_agent_reasoning(app: &AppHandle, agent_id: &str) -> Option<String> {
    if agent_id.trim().is_empty() {
        return None;
    }
    let state = app.state::<AppState>();
    state
        .settings_manager
        .get(&format!("agent_reasoning.{agent_id}"))
        .await
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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

/// Drain the child's recorded commentary into bounded, sequence-ordered
/// segments for the completion event. Returns None when the child produced no
/// interleaved text so the payload field stays absent.
async fn collect_intermediate_segments(
    commentary: &Arc<tokio::sync::Mutex<Vec<(u64, String)>>>,
) -> Option<Vec<crate::agent::event_bus::SubagentCommentarySegment>> {
    let raw = commentary.lock().await;
    crate::agent::event_bus::SubagentCommentarySegment::snapshot(&raw)
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
            parent_tool_call_id,
        } = params;
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

        // Built-in profiles ship without a model override, so a child must be
        // able to inherit the model the parent turn is running on. Prefer the
        // chat's own model, then the globally selected one. Resolving this
        // before `resolve_agent` keeps the "no model anywhere" case a single
        // actionable error instead of an opaque provider rejection.
        let inherited_model = inherited_model_for_child(&app, &chat_id).await;

        // A per-agent model chosen in the Subagents settings page (stored under
        // `agent_model.<id>`) lets a built-in like generalist/explore run on a
        // specific model without editing its fixed profile. An explicit `model`
        // in the spawn call still wins for that one run; otherwise the
        // configured selection takes priority over the inherited parent model
        // and carries its own provider.
        let configured_model = if explicit_model.is_some() || adhoc_instructions.is_some() {
            None
        } else {
            configured_agent_model(&app, agent_id).await
        };
        let effective_explicit: Option<String> = explicit_model
            .map(str::to_string)
            .or_else(|| configured_model.as_ref().map(|(_, model)| model.clone()));

        let mut resolved = if let Some(instructions) = adhoc_instructions {
            child_runner::resolve_adhoc_agent(
                &self.agent_registry,
                if agent_id.is_empty() { None } else { Some(agent_id) },
                instructions,
                &adhoc_tools,
                &caller_tool_ids,
                explicit_model,
                inherited_model.as_deref(),
                explicit_max_steps,
            )?
        } else {
            child_runner::resolve_agent(
                &self.agent_registry,
                agent_id,
                effective_explicit.as_deref(),
                inherited_model.as_deref(),
                explicit_max_steps,
            )?
        };
        // Pin the provider paired with a configured per-agent model. resolve_agent
        // clears model_provider whenever an explicit model is supplied (so it
        // falls back to the active provider); the configured selection may name a
        // provider other than the active one, so restore it here.
        if let Some((Some(provider), _)) = configured_model.as_ref() {
            resolved.model_provider = Some(provider.clone());
        }
        child_runner::inject_workspace_agents_md(&app, &mut resolved).await;

        let handoff = child_runner::build_subagent_handoff(
            &resolved,
            task,
            context,
            success_criteria,
            &constraints,
            &relevant_files,
        );
        let child_messages = child_runner::build_child_messages_from_handoff(&handoff);
        let memory_scope = child_runner::subagent_memory_scope(agent_id, task);

        let spawn_id = Uuid::new_v4().to_string();
        let parent_tool_call_id = parent_tool_call_id.clone();

        // Create a shared inbox so the parent/orchestrator can inject messages
        // into this sub-agent while it is running.
        let message_inbox: Arc<tokio::sync::Mutex<VecDeque<crate::db::models::ChatMessage>>> =
            Arc::new(tokio::sync::Mutex::new(VecDeque::new()));
        let child_tool_call_ids = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let intermediate_commentary: Arc<tokio::sync::Mutex<Vec<(u64, String)>>> =
            Arc::new(tokio::sync::Mutex::new(Vec::new()));

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
            .with_parent_tool_call_id(parent_tool_call_id.clone())
            .with_child_tool_call_ids(child_tool_call_ids.clone())
            .with_intermediate_commentary(intermediate_commentary.clone())
            .with_memory_scope(memory_scope)
            .with_message_inbox(message_inbox.clone());

        let state = app.state::<AppState>();
        let provider = if let Some(provider_name) = resolved.model_provider.as_deref() {
            let db = state.db().await?;
            state.provider_by_name(provider_name, &db).await?
        } else {
            state.provider().await?
        };

        // Apply the per-agent reasoning effort chosen in the Subagents page (when
        // an explicit/ad-hoc run hasn't overridden the agent). Normalized through
        // the model's resolved capability so an unsupported level is clamped or
        // dropped rather than sent raw. Empty means inherit → no override.
        let child_config = {
            let mut cfg = crate::llm::ChatRequestConfig::default();
            let configured_effort = if explicit_model.is_some() || adhoc_instructions.is_some() {
                None
            } else {
                configured_agent_reasoning(&app, agent_id).await
            };
            if let Some(effort) = configured_effort {
                let capability = provider.reasoning_capability(&resolved.model);
                let intent = crate::llm::ReasoningIntent {
                    enabled: true,
                    effort: Some(effort),
                    budget_tokens: None,
                };
                cfg.resolved_reasoning = Some(capability.normalize_request(&intent));
            }
            cfg
        };
        tracing::info!(
            spawn_id = %spawn_id,
            agent_id = %agent_id,
            model = %resolved.model,
            model_provider = resolved.model_provider.as_deref().unwrap_or("<active>"),
            "Spawning sub-agent"
        );

        // Register the inbox only after all fallible setup (runner build,
        // provider resolution) has succeeded. Registering earlier leaked an
        // orphaned queue whenever an early `?` return skipped the cleanup path.
        {
            let mut queues = state.subagent_message_queues.lock().await;
            queues.insert(spawn_id.clone(), message_inbox);
        }

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
        if let Err(e) = state.swarm.spawn_agent(swarm_agent).await {
            tracing::warn!(spawn_id = %spawn_id, "Swarm registration failed: {}", e);
        }

        let subagent_token = CancellationToken::new();
        {
            let mut tokens = state.subagent_cancellation_tokens.lock().await;
            tokens.insert(spawn_id.clone(), (chat_id.clone(), subagent_token.clone()));
        }

        // Single typed spawn emission on the event bus: the bridge flattens
        // `AgentSpawn` to the exact `agent:spawn` payload shape the frontend
        // listens for (card creation, agents-panel focus, voice activity).
        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::AgentSpawn(
                crate::agent::event_bus::AgentSpawnPayload {
                    spawn_id: spawn_id.clone(),
                    parent_agent: label.to_string(),
                    child_agent_id: resolved.agent.id.clone(),
                    child_agent_name: resolved.agent.name.clone(),
                    task: task.to_string(),
                    chat_id: chat_id.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                },
            ));

        // Emit a chat-visible sub-agent step so the inline timeline can render
        // the delegated task from start through completion.
        state
            .agent
            .event_bus
            .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                crate::agent::event_bus::SubagentStepPayload {
                    chat_id: chat_id.clone(),
                    spawn_id: spawn_id.clone(),
                    parent_tool_call_id: parent_tool_call_id.clone(),
                    agent_id: agent_id.to_string(),
                    agent_name: resolved.agent.name.clone(),
                    task: task.to_string(),
                    status: "running".to_string(),
                    result_summary: None,
                    result_content: None,
                    intermediate_content: None,
                    error: None,
                    duration_ms: 0,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    // Child tool ids are linked authoritatively by each child
                    // tool event's parent_tool_call_id and trace_id.
                    child_tool_call_ids: Some(Vec::new()),
                },
            ));

        // Run child agent with cancellation support
        let spawn_start = std::time::Instant::now();
        // Bound global concurrent child runs. Acquired here (not at registration)
        // so queued children still show as running in the panel while waiting for
        // a slot, and the permit is released the moment this run finishes.
        let _permit = SUBAGENT_CONCURRENCY.clone().acquire_owned().await.ok();
        let result = tokio::select! {
            biased;
            _ = token.cancelled() => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::ParentCancelled,
                    "Parent cancelled — sub-agent aborted",
                )))
            }
            _ = subagent_token.cancelled() => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::UserCancelled,
                    "Sub-agent task cancelled by user",
                )))
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(SUBAGENT_TIMEOUT_SECONDS)) => {
                Err(anyhow::Error::new(SpawnFailureError::new(
                    SpawnFailure::Timeout,
                    format!("Sub-agent timed out after {} seconds", SUBAGENT_TIMEOUT_SECONDS),
                )))
            }
            res = child_runner_instance.run(
                provider.as_ref(),
                chat_id.clone(),
                resolved.model,
                child_messages,
                resolved.agent.clone(),
                child_config,
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
                let final_answer = response.final_answer.clone();
                let content = response
                    .content
                    .unwrap_or_else(|| "Sub-agent completed with no output.".to_string());

                let validated = validate_subagent_output(&content);
                let status_str = validated.status.as_str();
                let summary = validated.summary.clone();
                // The panel's final reply must be only the child's terminal-turn
                // answer, not the accumulated per-iteration commentary — the
                // interleaved segments already render those. Prefer final_answer;
                // fall back to full_content for adapters that don't set it.
                // Bound it so a runaway child cannot bloat the parent event/DB.
                const MAX_RESULT_CONTENT: usize = 16_000;
                let result_content = {
                    let source = final_answer
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| validated.full_content.trim());
                    if source.is_empty() {
                        None
                    } else {
                        Some(source.chars().take(MAX_RESULT_CONTENT).collect::<String>())
                    }
                };
                // Interleaved commentary the child produced between tool calls.
                // Bound the total so a chatty child can't bloat the event/DB.
                let intermediate_content = collect_intermediate_segments(&intermediate_commentary).await;

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
                let completed_child_tool_call_ids = child_tool_call_ids.lock().await.clone();
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: parent_tool_call_id.clone(),
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: status_str.to_string(),
                            result_summary: Some(summary.clone()),
                            result_content: result_content.clone(),
                            intermediate_content: intermediate_content.clone(),
                            error: None,
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            // Child tool ids are linked authoritatively by each child
                            // tool event's parent_tool_call_id and trace_id.
                            child_tool_call_ids: Some(completed_child_tool_call_ids),
                        },
                    ));

                if let Err(e) = state.swarm.terminate_agent(&spawn_id).await {
                    tracing::warn!(spawn_id = %spawn_id, "Swarm termination failed: {}", e);
                }

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
                let terminal_status = spawn_failure_status(&e);
                let error_class = classify_spawn_error(&e);
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
                    status: terminal_status,
                    error: Some(&error_text),
                    result_summary: None,
                    duration_ms: spawn_duration_ms,
                });

                // Mark the chat-visible sub-agent step as failed.
                let failed_child_tool_call_ids = child_tool_call_ids.lock().await.clone();
                state
                    .agent
                    .event_bus
                    .emit(crate::agent::event_bus::AgentEvent::SubagentStep(
                        crate::agent::event_bus::SubagentStepPayload {
                            chat_id: chat_id.clone(),
                            spawn_id: spawn_id.clone(),
                            parent_tool_call_id: parent_tool_call_id.clone(),
                            agent_id: agent_id.to_string(),
                            agent_name: resolved.agent.name.clone(),
                            task: task.to_string(),
                            status: terminal_status.to_string(),
                            result_summary: None,
                            result_content: None,
                            intermediate_content: collect_intermediate_segments(&intermediate_commentary).await,
                            error: Some(error_text.clone()),
                            duration_ms: spawn_duration_ms,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            // Child tool ids are linked authoritatively by each child
                            // tool event's parent_tool_call_id and trace_id.
                            child_tool_call_ids: Some(failed_child_tool_call_ids),
                        },
                    ));

                if let Err(e) = state.swarm.terminate_agent(&spawn_id).await {
                    tracing::warn!(spawn_id = %spawn_id, "Swarm termination failed: {}", e);
                }

                Ok(json!({
                    "spawn_id": spawn_id,
                    "agent_id": agent_id,
                    "agent_name": resolved.agent.name,
                    "status": terminal_status,
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
         via 'agent_id' ('explore' for read-only search and research) or define an ad-hoc agent \
         inline with 'instructions' (and optionally a 'tools' subset). A batch runs in \
         dependency-aware waves: agents without dependencies run in parallel, and agents that \
         declare 'depends_on' wait for their prerequisites. Use '{{agent_id}}' placeholders in \
         task/context to inject a previous agent's summary. Results include all sub-agent \
         outputs, including failures, so successful siblings are not discarded."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "ID of a built-in specialist ('explore' for read-only search, discovery, and research). Omit to define an ad-hoc agent via 'instructions'."
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
            let parent_tool_call_id = input
                .get("_parent_tool_call_id")
                .and_then(Value::as_str)
                .map(str::to_string);
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
                    let parent_tool_call_id = parent_tool_call_id.clone();
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
                                parent_tool_call_id,
                            })
                            .await?;
                        Ok::<(usize, String, Value), anyhow::Error>((original_idx, id, result))
                    };

                    wave_futures.push((original_idx, node.id.clone(), fut));
                }

                // `do_spawn` already races SUBAGENT_TIMEOUT_SECONDS against
                // the child run internally (alongside both cancellation
                // tokens), and an outer timeout would abort the future before
                // its cleanup path removes the token/inbox registrations — so
                // the inner bound is the single timeout for the batch too.
                let wave_results: Vec<(usize, String, Value)> =
                    futures::future::join_all(wave_futures.into_iter().map(|(idx, id, fut)| async move {
                        match fut.await {
                            Ok((original_idx, id, result)) => (original_idx, id, result),
                            Err(error) => {
                                let class = classify_spawn_error(&error);
                                let text = error.to_string();
                                (
                                    idx,
                                    id,
                                    json!({
                                        "status": spawn_failure_status(&error),
                                        "error": text,
                                        "error_class": class.as_str(),
                                        "retry_hint": "This sub-agent failed. Consider retrying with a narrower task.",
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
            // by the parent LLM. Failed children carry no `summary`, so fall back
            // to a bounded slice of their error text — otherwise the parent sees
            // an empty line and re-derives the raw failure from `results`.
            let merged_summary: Vec<String> = results_in_order
                .iter()
                .enumerate()
                .map(|(index, result)| {
                    let status = result.get("status").and_then(Value::as_str).unwrap_or("unknown");
                    let detail = result
                        .get("summary")
                        .and_then(Value::as_str)
                        .filter(|s| !s.trim().is_empty())
                        .or_else(|| result.get("error").and_then(Value::as_str))
                        .unwrap_or("")
                        .chars()
                        .take(200)
                        .collect::<String>();
                    format!("[{}] {}: {}", index + 1, status, detail)
                })
                .collect();

            // Lead with a single clean `result` string. `runner/loop.rs` unwraps
            // this field for the parent's tool context; without it the parent is
            // handed the whole JSON blob (raw child errors included) and tends to
            // echo it verbatim into its visible reply as a fenced text dump.
            let overall = if completed == results_in_order.len() {
                format!("All {} sub-agents completed.", results_in_order.len())
            } else if completed == 0 {
                format!("All {} sub-agents failed.", results_in_order.len())
            } else {
                format!("{} of {} sub-agents completed; {} failed.", completed, results_in_order.len(), failed)
            };
            let result_text = format!("{}\n{}", overall, merged_summary.join("\n"));

            return Ok(json!({
                "status": if completed == results_in_order.len() { "completed" } else if completed == 0 { "error" } else { "partial" },
                "parallel": true,
                "completed": completed,
                "failed": failed,
                "result": result_text,
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
        let parent_tool_call_id = input
            .get("_parent_tool_call_id")
            .and_then(Value::as_str)
            .map(str::to_string);

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
            parent_tool_call_id,
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

    // `agent:complete` stays a raw app emit: its payload is richer than the
    // typed `AgentCompletePayload` (spawn_id, parent/child identity, task,
    // result summary) and the frontend's `appendAgentActionStep` reads those
    // fields directly. Migrating it requires extending the typed payload
    // first; the spawn side already went through the event bus.
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
    fn user_cancelled_spawn_maps_to_cancelled_status_and_transient_class() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::UserCancelled,
            "Sub-agent task cancelled by user",
        ));
        assert_eq!(spawn_failure_status(&error), "cancelled");
        assert_eq!(classify_spawn_error(&error), ErrorClass::Transient);
    }

    #[test]
    fn parent_cancelled_spawn_maps_to_cancelled_status() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::ParentCancelled,
            "Parent cancelled — sub-agent aborted",
        ));
        assert_eq!(spawn_failure_status(&error), "cancelled");
    }

    #[test]
    fn timeout_spawn_maps_to_failed_status_and_transient_class() {
        let error = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::Timeout,
            "Sub-agent timed out after 300 seconds",
        ));
        assert_eq!(spawn_failure_status(&error), "failed");
        assert_eq!(classify_spawn_error(&error), ErrorClass::Transient);
    }

    #[test]
    fn provider_shape_classifies_without_matching_wording() {
        // NoModelSelected is permanent regardless of its message text.
        let no_model = anyhow::Error::new(ZenError::NoModelSelected);
        assert_eq!(classify_spawn_error(&no_model), ErrorClass::Permanent);
        // Aborted (user stop) is transient.
        let aborted = anyhow::Error::new(ZenError::Aborted);
        assert_eq!(classify_spawn_error(&aborted), ErrorClass::Transient);
    }

    #[test]
    fn opaque_error_falls_back_to_retryable_and_failed_status() {
        let opaque = anyhow::anyhow!("provider exploded in a novel way");
        assert_eq!(classify_spawn_error(&opaque), ErrorClass::Retryable);
        assert_eq!(spawn_failure_status(&opaque), "failed");
    }

    #[test]
    fn typed_marker_survives_anyhow_context_wrapping() {
        let inner = anyhow::Error::new(SpawnFailureError::new(
            SpawnFailure::UserCancelled,
            "Sub-agent task cancelled by user",
        ));
        let wrapped = inner.context("while running child agent");
        assert_eq!(spawn_failure_status(&wrapped), "cancelled");
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
