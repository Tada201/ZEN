//! The `AgentTool` surface: input schema and the parallel-wave `run` path.

use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;

use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::deps::{substitute_dependency_placeholders, AgentRequest, DependencyGraph};
use super::failure::{classify_spawn_error, spawn_failure_status};
use super::messaging::handoff_fields_from_input;
use super::params::SpawnParams;
use super::{SpawnAgentTool, MAX_PARALLEL_SUBAGENTS};

#[async_trait]
impl zen_tools::AgentTool<tauri::AppHandle> for SpawnAgentTool {
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
