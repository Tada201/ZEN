//! Tool-result collection and completion-event emission.
//!
//! Split out of the former single `tool_dispatch.rs` during
//! BIG_MIGRATION.md Phase 11.

use super::super::lifecycle::Runner;
use super::super::tool_pipeline::normalize_tool_result;
use crate::event_bus::{AgentEvent, ToolCompletePayload};
use crate::types::ToolResult;
use serde_json::json;
use tokio_util::sync::CancellationToken;

impl Runner {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn emit_tool_complete_for_result(
        &self,
        chat_id: &str,
        iteration: usize,
        agent_id: &str,
        agent_name: &str,
        tool_name: &str,
        result: &ToolResult,
        assistant_message_id: Option<String>,
    ) {
        let output = format_tool_result_output(result);

        self.emit(AgentEvent::ToolComplete(ToolCompletePayload {
            tool_name: tool_name.to_string(),
            tool_call_id: result.tool_call_id.clone(),
            sequence: self.next_event_sequence(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            phase: if result.is_error {
                "errored".to_string()
            } else {
                "completed".to_string()
            },
            trace_id: self.trace_id(),
            run_id: Some(self.execution_run_id(chat_id)),
            parent_agent_id: self.parent_agent_id(),
            parent_tool_call_id: self.parent_tool_call_id(),
            execution_id: Some(result.tool_call_id.clone()),
            batch_id: Some(self.tool_batch_id(chat_id, agent_id, iteration)),
            tool_batch_id: Some(self.tool_batch_id(chat_id, agent_id, iteration)),
            message_id: assistant_message_id,
            agent_id: agent_id.to_string(),
            agent_name: agent_name.to_string(),
            chat_id: chat_id.to_string(),
            duration_ms: result.duration_ms,
            status: if result.is_error {
                "error".to_string()
            } else {
                "success".to_string()
            },
            iteration,
            output: Some(output),
        }));
    }
}

pub(super) async fn collect_tool_results_as_completed<F>(
    handles: Vec<(usize, String, String, tokio::task::JoinHandle<ToolResult>)>,
    ordered_results: &mut [Option<ToolResult>],
    mut on_complete: F,
    token: CancellationToken,
) where
    F: FnMut(&str, &ToolResult),
{
    let mut join_set = tokio::task::JoinSet::new();
    let mut abort_handles = Vec::new();
    for (index, tc_id, tool_name, handle) in handles {
        abort_handles.push(handle.abort_handle());
        join_set.spawn(async move {
            let joined = handle.await;
            (index, tc_id, tool_name, joined)
        });
    }

    loop {
        let joined = tokio::select! {
            joined = join_set.join_next() => joined,
            _ = token.cancelled() => {
                for abort_handle in abort_handles {
                    abort_handle.abort();
                }
                join_set.abort_all();
                break;
            }
        };

        let Some(joined) = joined else {
            break;
        };

        match joined {
            Ok((index, _tc_id, tool_name, Ok(result))) => {
                on_complete(&tool_name, &result);
                ordered_results[index] = Some(result);
            }
            Ok((index, tc_id, tool_name, Err(e))) => {
                tracing::error!("Tool task panicked for {}: {}", tc_id, e);
                let started_at = chrono::Utc::now();
                let result = normalize_tool_result(
                    tc_id,
                    &tool_name,
                    &tool_name,
                    json!({}),
                    json!({
                        "error": format!("Internal execution panic: {}", e),
                        "hint": "The tool thread crashed unexpectedly. Please report this if it persists."
                    }),
                    true,
                    0,
                    started_at,
                );
                on_complete(&tool_name, &result);
                ordered_results[index] = Some(result);
            }
            Err(e) => {
                tracing::error!("Tool completion collector panicked: {}", e);
            }
        }
    }
}

fn format_tool_result_output(result: &ToolResult) -> String {
    match &result.content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Object(obj) => {
            if let Some(formatted_result) = obj.get("result") {
                match formatted_result {
                    serde_json::Value::String(s) => s.clone(),
                    _ => formatted_result.to_string(),
                }
            } else if let Some(error) = obj.get("error") {
                format!("Error: {error}")
            } else {
                result.content.to_string()
            }
        }
        _ => result.content.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn emits_tool_completions_as_each_parallel_task_finishes() {
        let mut ordered_results = vec![None, None];
        let completion_order = Arc::new(Mutex::new(Vec::new()));
        let completion_order_for_callback = Arc::clone(&completion_order);

        let slow = tokio::spawn(async {
            sleep(Duration::from_millis(50)).await;
            ToolResult {
                tool_call_id: "slow-id".to_string(),
                content: json!({ "result": "slow result" }),
                is_error: false,
                duration_ms: 50,
            }
        });
        let fast = tokio::spawn(async {
            sleep(Duration::from_millis(5)).await;
            ToolResult {
                tool_call_id: "fast-id".to_string(),
                content: json!({ "result": "fast result" }),
                is_error: false,
                duration_ms: 5,
            }
        });

        collect_tool_results_as_completed(
            vec![
                (0, "slow-id".to_string(), "slow_tool".to_string(), slow),
                (1, "fast-id".to_string(), "fast_tool".to_string(), fast),
            ],
            &mut ordered_results,
            |tool_name, _result| {
                completion_order_for_callback
                    .lock()
                    .unwrap()
                    .push(tool_name.to_string());
            },
            CancellationToken::new(),
        )
        .await;

        assert_eq!(
            completion_order.lock().unwrap().as_slice(),
            ["fast_tool", "slow_tool"]
        );
        assert_eq!(ordered_results[0].as_ref().unwrap().tool_call_id, "slow-id");
        assert_eq!(ordered_results[1].as_ref().unwrap().tool_call_id, "fast-id");
    }

    #[test]
    fn formats_tool_result_output_for_preview() {
        let result = ToolResult {
            tool_call_id: "tool-id".to_string(),
            content: json!({ "result": { "summary": "done" } }),
            is_error: false,
            duration_ms: 0,
        };

        assert_eq!(format_tool_result_output(&result), "{\"summary\":\"done\"}");
    }
}
