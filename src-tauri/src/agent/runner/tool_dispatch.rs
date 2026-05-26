use super::tool_actions::{emit_cached_tool_result_action, emit_tool_call_action};
use super::tool_pipeline::{
    cache_key_for, normalize_tool_result, preprocess_tool_calls, should_read_cache,
    should_write_cache,
};
use super::Runner;
use crate::agent::event_bus::{AgentEvent, ChatStatusPayload, ToolStartPayload};
use crate::agent::hooks::HookDecision;
use crate::agent::types::{ToolCall, ToolResult};
use crate::tools::permission::PermissionDecision;
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

impl Runner {
    /// Execute tool calls with P3 lifecycle hooks (pre/post).
    /// For high-risk tools like `run_command`, emits an authorization request
    /// and waits for user approval before executing.
    pub(super) async fn execute_tools_with_hooks(
        &self,
        tool_calls: &[ToolCall],
        chat_id: &str,
        iteration: usize,
        agent_id: &str,
        agent_name: &str,
        authorized_tool_ids: &[String],
        token: CancellationToken,
    ) -> Vec<ToolResult> {
        let (mut ordered_results, pipeline_calls) =
            preprocess_tool_calls(&self.tool_manager, tool_calls, authorized_tool_ids).await;

        // Process pipeline calls (non-meta-tools and transformed tool_exec)
        let mut handles = Vec::new();

        for pipeline_call in &pipeline_calls {
            let tool_call = &pipeline_call.resolved;
            let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                message: format!("Executing: {}", tool_call.name),
                chat_id: chat_id.to_string(),
                iteration: Some(iteration),
            }));

            emit_tool_call_action(
                &self.app,
                self.db_pool.as_ref(),
                &self.on_event,
                chat_id,
                tool_call,
                agent_id,
                agent_name,
                iteration,
                self.depth,
            )
            .await;

            // ── Phase 3.2: Tool Cache Lookup ──
            let cache_key = cache_key_for(tool_call);
            let tc_id = tool_call.id.clone();

            // Check cache with proper lifetime handling
            let cached_result = if should_read_cache(&tool_call.name) {
                self.cache.lock().await.get(&cache_key).cloned()
            } else {
                None
            };
            if let Some(cached_result) = cached_result {
                tracing::info!("Cache HIT for tool '{}'", tool_call.name);

                emit_cached_tool_result_action(
                    &self.app,
                    self.db_pool.as_ref(),
                    &self.on_event,
                    chat_id,
                    tool_call,
                    &cached_result,
                    agent_id,
                    agent_name,
                    iteration,
                    self.depth,
                )
                .await;

                let tc_id_inner = tc_id.clone();
                let result_tool_name = tool_call.name.clone();
                let result_args = tool_call.args.clone();
                let started_at = chrono::Utc::now();
                handles.push((
                    pipeline_call.index,
                    tc_id_inner,
                    tokio::spawn(async move {
                        normalize_tool_result(
                            tc_id,
                            &result_tool_name,
                            &result_tool_name,
                            result_args,
                            cached_result,
                            false,
                            0,
                            started_at,
                        )
                    }),
                ));
                continue;
            }

            // ── P3: PreToolUse hook ──
            let hook_decision = self.hook_registry.pre_tool_use(tool_call);
            let tc_id = tool_call.id.clone();
            let tc_name = tool_call.name.clone();
            let tc_args = tool_call.args.clone();

            match hook_decision {
                HookDecision::Deny { reason } => {
                    tracing::info!("Hook DENIED tool '{}': {}", tc_name, reason);
                    let hook_reg = self.hook_registry.clone();
                    let tc_id_for_handle = tc_id.clone();
                    let result_tool_name = tc_name.clone();
                    let result_args = tc_args.clone();
                    let handle = tokio::spawn(async move {
                        let started_at = chrono::Utc::now();
                        let result = ToolResult {
                            tool_call_id: tc_id.clone(),
                            content: json!({
                                "error": format!("Tool call denied by safety hook: {}", reason),
                                "tool": tc_name,
                                "hint": "This tool call was blocked. Try a different approach."
                            }),
                            is_error: true,
                            duration_ms: 0,
                        };
                        hook_reg.post_tool_use(
                            &ToolCall {
                                id: tc_id,
                                name: tc_name,
                                args: tc_args,
                            },
                            &result,
                        );
                        normalize_tool_result(
                            result.tool_call_id,
                            &result_tool_name,
                            &result_tool_name,
                            result_args,
                            result.content,
                            true,
                            result.duration_ms,
                            started_at,
                        )
                    });
                    handles.push((pipeline_call.index, tc_id_for_handle, handle));
                    continue;
                }
                HookDecision::Modify { new_args } => {
                    self.emit(AgentEvent::ToolStart(ToolStartPayload {
                        tool_name: tc_name.clone(),
                        tool_call_id: tc_id.clone(),
                        arguments: tc_args.clone(),
                        agent_id: agent_id.to_string(),
                        agent_name: agent_name.to_string(),
                        chat_id: chat_id.to_string(),
                        iteration,
                    }));
                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let tool_service = self
                        .app
                        .state::<crate::commands::AppState>()
                        .tool_service
                        .clone();
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();

                    let chat_id_inner = chat_id.to_string();
                    let tc_id_inner = tc_id.clone();
                    let token_inner = token.clone();
                    let depth = self.depth;
                    let original_name = pipeline_call.original.name.clone();
                    let result_tool_name = tc_name.clone();

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let started_at = chrono::Utc::now();
                        let mut result = tool_service
                            .execute_agent_tool(
                                tool,
                                app,
                                chat_id_inner,
                                ToolCall {
                                    id: tc_id.clone(),
                                    name: tc_name.clone(),
                                    args: new_args.clone(),
                                },
                                token_inner,
                                depth,
                                Some(allowed_tools),
                            )
                            .await;
                        result.duration_ms = start.elapsed().as_millis() as u64;
                        hook_reg.post_tool_use(
                            &ToolCall {
                                id: tc_id,
                                name: tc_name,
                                args: new_args,
                            },
                            &result,
                        );
                        normalize_tool_result(
                            result.tool_call_id,
                            &result_tool_name,
                            &result_tool_name,
                            json!({ "via": original_name }),
                            result.content,
                            result.is_error,
                            result.duration_ms,
                            started_at,
                        )
                    });
                    handles.push((pipeline_call.index, tc_id_inner, handle));
                }
                HookDecision::Allow => {
                    // ── Unified Permission Check (YOLO mode, overrides, etc.) ──
                    let v2_tool_call = crate::tools::ToolCall {
                        id: tc_id.clone(),
                        name: tc_name.clone(),
                        arguments: tc_args.clone(),
                    };

                    let state = self.app.state::<crate::commands::AppState>();
                    let permission_result = state
                        .tool_service
                        .check_permission("agent_runner", &v2_tool_call)
                        .await;

                    match permission_result {
                        Ok(PermissionDecision::Allow) => {
                            // Proceed to execution
                        }
                        Ok(PermissionDecision::Confirm { context }) => {
                            // Check inherited/tree permissions first (Comment 12)
                            let is_inherited = self.allowed_tools.lock().await.contains(&tc_name);

                            // Phase 3.3: Check session-scoped permission memory first
                            let cache_key =
                                format!("{}:{:x}", tc_name, Sha256::digest(&tc_args.to_string()));
                            let session_perms = state.session_permissions.lock().await;
                            let always_allow = session_perms
                                .get(chat_id)
                                .and_then(|chat_perms| chat_perms.get(&cache_key))
                                .copied()
                                .unwrap_or(false);
                            drop(session_perms);

                            if is_inherited || always_allow {
                                // Proceed without asking
                                if is_inherited {
                                    tracing::info!("Inheriting permission for tool '{}' (approved earlier in this session tree)", tc_name);
                                } else {
                                    tracing::info!(
                                        "Session memory: ALWAYS ALLOW tool '{}'",
                                        tc_name
                                    );
                                }
                            } else {
                                // User confirmation required
                                let approved = self
                                    .request_user_confirmation(
                                        &v2_tool_call,
                                        chat_id,
                                        context,
                                        agent_id,
                                        agent_name,
                                        iteration,
                                    )
                                    .await;

                                if !approved {
                                    tracing::info!(
                                        "User DENIED tool '{}' (id: {})",
                                        tc_name,
                                        tc_id
                                    );
                                    let hook_reg = self.hook_registry.clone();
                                    let tc_id_for_handle = tc_id.clone();
                                    let result_tool_name = tc_name.clone();
                                    let result_args = tc_args.clone();
                                    let handle = tokio::spawn(async move {
                                        let started_at = chrono::Utc::now();
                                        let result = ToolResult {
                                            tool_call_id: tc_id.clone(),
                                            content: json!({
                                                "error": "Tool execution denied by user.",
                                                "tool": tc_name,
                                                "hint": "The user chose not to allow this command. Try a different approach or ask the user for guidance."
                                            }),
                                            is_error: true,
                                            duration_ms: 0,
                                        };
                                        hook_reg.post_tool_use(
                                            &ToolCall {
                                                id: tc_id,
                                                name: tc_name,
                                                args: tc_args,
                                            },
                                            &result,
                                        );
                                        normalize_tool_result(
                                            result.tool_call_id,
                                            &result_tool_name,
                                            &result_tool_name,
                                            result_args,
                                            result.content,
                                            true,
                                            result.duration_ms,
                                            started_at,
                                        )
                                    });
                                    handles.push((pipeline_call.index, tc_id_for_handle, handle));
                                    continue;
                                }
                                tracing::info!("User APPROVED tool '{}' (id: {})", tc_name, tc_id);
                                // Capture approval for inheritance (Comment 12)
                                self.allowed_tools.lock().await.insert(tc_name.clone());
                            }
                        }
                        Ok(PermissionDecision::Deny { reason }) => {
                            tracing::info!("Permission DENIED tool '{}': {}", tc_name, reason);
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let result_tool_name = tc_name.clone();
                            let result_args = tc_args.clone();
                            let handle = tokio::spawn(async move {
                                let started_at = chrono::Utc::now();
                                let result = ToolResult {
                                    tool_call_id: tc_id.clone(),
                                    content: json!({
                                        "error": format!("Tool call denied by security policy: {}", reason),
                                        "tool": tc_name,
                                        "hint": "This tool call was blocked for safety. Try a different approach."
                                    }),
                                    is_error: true,
                                    duration_ms: 0,
                                };
                                hook_reg.post_tool_use(
                                    &ToolCall {
                                        id: tc_id,
                                        name: tc_name,
                                        args: tc_args,
                                    },
                                    &result,
                                );
                                normalize_tool_result(
                                    result.tool_call_id,
                                    &result_tool_name,
                                    &result_tool_name,
                                    result_args,
                                    result.content,
                                    true,
                                    result.duration_ms,
                                    started_at,
                                )
                            });
                            handles.push((pipeline_call.index, tc_id_for_handle, handle));
                            continue;
                        }
                        Err(e) => {
                            tracing::error!(
                                "Permission check failed for tool '{}': {}",
                                tc_name,
                                e
                            );
                            // Fallback to safe denial if permission check itself errors out
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let result_tool_name = tc_name.clone();
                            let result_args = tc_args.clone();
                            let handle = tokio::spawn(async move {
                                let started_at = chrono::Utc::now();
                                let result = ToolResult {
                                    tool_call_id: tc_id.clone(),
                                    content: json!({
                                        "error": format!("Internal security check failed: {}", e),
                                        "tool": tc_name
                                    }),
                                    is_error: true,
                                    duration_ms: 0,
                                };
                                hook_reg.post_tool_use(
                                    &ToolCall {
                                        id: tc_id,
                                        name: tc_name,
                                        args: tc_args,
                                    },
                                    &result,
                                );
                                normalize_tool_result(
                                    result.tool_call_id,
                                    &result_tool_name,
                                    &result_tool_name,
                                    result_args,
                                    result.content,
                                    true,
                                    result.duration_ms,
                                    started_at,
                                )
                            });
                            handles.push((pipeline_call.index, tc_id_for_handle, handle));
                            continue;
                        }
                    }

                    self.emit(AgentEvent::ToolStart(ToolStartPayload {
                        tool_name: tc_name.clone(),
                        tool_call_id: tc_id.clone(),
                        arguments: tc_args.clone(),
                        agent_id: agent_id.to_string(),
                        agent_name: agent_name.to_string(),
                        chat_id: chat_id.to_string(),
                        iteration,
                    }));

                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let tool_service = self
                        .app
                        .state::<crate::commands::AppState>()
                        .tool_service
                        .clone();
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();
                    let cache = self.cache.clone();
                    let cache_key_clone = cache_key.clone();

                    let chat_id_inner = chat_id.to_string();
                    let token_inner = token.clone();
                    let tc_args_inner = tc_args.clone();
                    let tc_id_inner = tc_id.clone();
                    let depth = self.depth;
                    let result_tool_name = tc_name.clone();
                    let original_name = pipeline_call.original.name.clone();

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let started_at = chrono::Utc::now();
                        let mut result = tool_service
                            .execute_agent_tool(
                                tool,
                                app,
                                chat_id_inner,
                                ToolCall {
                                    id: tc_id.clone(),
                                    name: tc_name.clone(),
                                    args: tc_args_inner,
                                },
                                token_inner,
                                depth,
                                Some(allowed_tools),
                            )
                            .await;
                        result.duration_ms = start.elapsed().as_millis() as u64;

                        if should_write_cache(&tc_name, result.is_error) {
                            cache
                                .lock()
                                .await
                                .set(cache_key_clone, result.content.clone());
                        }

                        hook_reg.post_tool_use(
                            &ToolCall {
                                id: tc_id,
                                name: tc_name,
                                args: tc_args,
                            },
                            &result,
                        );
                        normalize_tool_result(
                            result.tool_call_id,
                            &result_tool_name,
                            &result_tool_name,
                            json!({ "via": original_name }),
                            result.content,
                            result.is_error,
                            result.duration_ms,
                            started_at,
                        )
                    });
                    handles.push((pipeline_call.index, tc_id_inner, handle));
                }
            }
        }

        // Collect pipeline results by original call index so meta tools and real
        // tools stay in the exact order the model emitted them.
        for (index, tc_id, handle) in handles {
            match handle.await {
                Ok(result) => ordered_results[index] = Some(result),
                Err(e) => {
                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);
                    let started_at = chrono::Utc::now();
                    ordered_results[index] = Some(normalize_tool_result(
                        tc_id,
                        "unknown",
                        "Unknown Tool",
                        json!({}),
                        json!({
                            "error": format!("Internal execution panic: {}", e),
                            "hint": "The tool thread crashed unexpectedly. Please report this if it persists."
                        }),
                        true,
                        0,
                        started_at,
                    ))
                }
            }
        }

        ordered_results
            .into_iter()
            .enumerate()
            .map(|(index, maybe_result)| {
                maybe_result.unwrap_or_else(|| {
                    let tc = &tool_calls[index];
                    normalize_tool_result(
                        tc.id.clone(),
                        &tc.name,
                        &tc.name,
                        tc.args.clone(),
                        json!({
                            "error": "Tool call did not produce a result.",
                            "hint": "Retry the request or call tool_list/tool_info before executing."
                        }),
                        true,
                        0,
                        chrono::Utc::now(),
                    )
                })
            })
            .collect()
    }

    /// Emit a `tool:authorization_request` event and wait for user response.
    /// Returns `true` if approved, `false` if denied or timed out.
    async fn request_user_confirmation(
        &self,
        tool_call: &crate::tools::ToolCall,
        chat_id: &str,
        context: crate::tools::permission::PermissionContext,
        _agent_id: &str,
        _agent_name: &str,
        iteration: usize,
    ) -> bool {
        let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
            message: format!("Awaiting approval: {}", tool_call.name),
            chat_id: chat_id.to_string(),
            iteration: Some(iteration),
        }));

        let state = self.app.state::<crate::commands::AppState>();
        state
            .tool_service
            .request_interactive_approval(
                self.app.clone(),
                "agent_runner",
                chat_id,
                tool_call,
                context,
            )
            .await
    }
}
