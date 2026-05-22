use crate::agent::event_bus::{
    AgentEvent, ChatStatusPayload, ToolStartPayload, ToolCompletePayload,
};
use crate::agent::types::{ToolCall, ToolResult, ToolCallMeta, ToolResultMeta, ActionMeta, MessageKind};
use crate::db::models::ChatMessage;
use crate::tools::permission::PermissionDecision;
use crate::agent::hooks::HookDecision;
use super::helpers::{execute_single_tool, parse_file_changes};
use super::actions::{persist_and_emit_action, emit_action_only};
use super::Runner;
use crate::agent::cache::ToolCache;
use tokio_util::sync::CancellationToken;
use std::sync::Arc;
use std::collections::HashSet;
use sha2::{Sha256, Digest};
use serde_json::json;
use tauri::{Emitter, Manager};

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
        // Preprocess tool calls for meta-tool dispatch
        // Meta-tools (tool_list, tool_info) are handled inline.
        // tool_exec is transformed to use the real tool name and arguments.
        let mut processed_calls: Vec<(ToolCall, Option<ToolResult>)> = Vec::new();
        for tc in tool_calls {
            match tc.name.as_str() {
                "tool_list" => {
                    let descriptors = self.tool_manager.list_allowed(authorized_tool_ids).await;
                    let result = ToolResult {
                        tool_call_id: tc.id.clone(),
                        content: serde_json::to_value(&descriptors).unwrap_or_default(),
                        is_error: false,
                        duration_ms: 0,
                    };
                    processed_calls.push((tc.clone(), Some(result)));
                }
                "tool_info" => {
                    let tool_id = tc.args.get("tool_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let schema = self.tool_manager.get_info(tool_id).await;
                    let result = match schema {
                        Some(s) => ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::to_value(&s).unwrap_or_default(),
                            is_error: false,
                            duration_ms: 0,
                        },
                        None => ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::json!({
                                "error": format!("Tool '{}' not found. Use tool_list to see available tools.", tool_id),
                                "hint": "Check the tool_id spelling or call tool_list first to see all available tools."
                            }),
                            is_error: true,
                            duration_ms: 0,
                        },
                    };
                    processed_calls.push((tc.clone(), Some(result)));
                }
                "tool_exec" => {
                    // Transform tool_exec into the real tool call
                    if let Some((real_id, real_args)) = self.tool_manager.resolve_tool_exec(&tc.args).await {
                        let real_tc = ToolCall {
                            id: tc.id.clone(),
                            name: real_id,
                            args: real_args,
                        };
                        processed_calls.push((real_tc, None));
                    } else {
                        let result = ToolResult {
                            tool_call_id: tc.id.clone(),
                            content: serde_json::json!({
                                "error": "Tool not found or invalid arguments. Use tool_list and tool_info to discover valid tools.",
                                "hint": "Call tool_list() to see available tools, then tool_info({\"tool_id\": \"name\"}) for the schema."
                            }),
                            is_error: true,
                            duration_ms: 0,
                        };
                        processed_calls.push((tc.clone(), Some(result)));
                    }
                }
                _ => {
                    processed_calls.push((tc.clone(), None));
                }
            }
        }

        // Separate inline results from calls that need the full pipeline
        let mut results: Vec<ToolResult> = Vec::new();
        let mut pipeline_calls: Vec<ToolCall> = Vec::new();
        for (tc, inline_result) in processed_calls {
            match inline_result {
                Some(r) => results.push(r),
                None => pipeline_calls.push(tc),
            }
        }

        // Process pipeline calls (non-meta-tools and transformed tool_exec)
        let mut handles = Vec::new();

        for tool_call in &pipeline_calls {
            let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                message: format!("Executing: {}", tool_call.name),
                chat_id: chat_id.to_string(),
                iteration: Some(iteration),
            }));

            // Emit structured tool_call action (Phase 1.4)
            let tool_call_meta = ToolCallMeta {
                tool_name: tool_call.name.clone(),
                args: tool_call.args.clone(),
                status: "running".to_string(),
            };

            let action_meta = ActionMeta {
                agent_id: agent_id.to_string(),
                agent_name: agent_name.to_string(),
                iteration,
                depth: self.depth,
                progress_percent: None,
                tool_call: Some(tool_call_meta),
                tool_result: None,
                handoff: None,
                spawn: None,
                approval_request: None,
                ..Default::default()
            };

            let call_content = format!("{} calling {}...", agent_name, tool_call.name);
            if let Some(ref db) = self.db_pool {
                let _ = persist_and_emit_action(
                    &self.app,
                    db,
                    chat_id,
                    None,
                    MessageKind::ToolCall,
                    call_content,
                    action_meta,
                    None,
                    None,
                    &self.on_event,
                ).await;
            } else {
                let _ = emit_action_only(
                    &self.app,
                    chat_id,
                    None,
                    MessageKind::ToolCall,
                    call_content,
                    action_meta,
                    &self.on_event,
                );
            }

            // ── Phase 3.2: Tool Cache Lookup ──
            let cache_key = ToolCache::generate_key(&tool_call.name, &tool_call.args);
            let tc_id = tool_call.id.clone();
            
            // Check cache with proper lifetime handling
            let cached_result = self.cache.lock().await.get(&cache_key).cloned();
            if let Some(cached_result) = cached_result {
                tracing::info!("Cache HIT for tool '{}'", tool_call.name);

                // Emit tool_result action for cached result
                let files = parse_file_changes(&cached_result);

                let tool_result_meta = ToolResultMeta {
                    tool_name: tool_call.name.clone(),
                    status: "ok".to_string(),
                    duration_ms: 0,
                    content_summary: cached_result.to_string().chars().take(200).collect(),
                    args: tool_call.args.clone(), // P1: Populate args for cached results
                    files,
                    raw_result: Some(cached_result.clone()),
                };
                
                let result_action_meta = ActionMeta {
                    agent_id: agent_id.to_string(),
                    agent_name: agent_name.to_string(),
                    iteration,
                    depth: self.depth,
                    progress_percent: None,
                    tool_call: Some(ToolCallMeta { // P1: Populate tool_call for correlation even in cache
                        tool_name: tool_call.name.clone(),
                        args: tool_call.args.clone(),
                        status: "completed".to_string(),
                    }),
                    tool_result: Some(tool_result_meta),
                    handoff: None,
                    spawn: None,
                    approval_request: None,
                    ..Default::default()
                };
                
                let result_content = format!("{}: Success (cached)", tool_call.name);
                if let Some(ref db) = self.db_pool {
                    let _ = persist_and_emit_action(
                        &self.app,
                        db,
                        chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        result_action_meta,
                        Some("tool"),
                        Some(tc_id.clone()),
                        &self.on_event,
                    ).await;
                } else {
                    let _ = emit_action_only(
                        &self.app,
                        chat_id,
                        None,
                        MessageKind::ToolResult,
                        result_content,
                        result_action_meta,
                        &self.on_event,
                    );
                }
                
                let tc_id_inner = tc_id.clone();
                handles.push((tc_id_inner, tokio::spawn(async move {
                    ToolResult {
                        tool_call_id: tc_id,
                        content: cached_result,
                        is_error: false,
                        duration_ms: 0,
                    }
                })));
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
                    let handle = tokio::spawn(async move {
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
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                        result
                    });
                    handles.push((tc_id_for_handle, handle));
                    continue;
                }
                HookDecision::Modify { new_args } => {
                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();

                    let chat_id_inner = chat_id.to_string();
                    let tc_id_inner = tc_id.clone();
                    let token_inner = token.clone();
                    let agent_id_str = agent_id.to_string();
                    let agent_name_str = agent_name.to_string();
                    let depth = self.depth;

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let mut result = execute_single_tool(
                            tool, app, chat_id_inner, tc_id.clone(), tc_name.clone(), new_args.clone(), token_inner,
                            agent_id_str, agent_name_str, depth, Some(allowed_tools)
                        ).await;
                        result.duration_ms = start.elapsed().as_millis() as u64;
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: new_args }, &result);
                        result
                    });
                    handles.push((tc_id_inner, handle));
                }
                HookDecision::Allow => {
                    // ── Unified Permission Check (YOLO mode, overrides, etc.) ──
                    let registry = self.permissions.clone();
                    let v2_tool_call = crate::tools::ToolCall {
                        id: tc_id.clone(),
                        name: tc_name.clone(),
                        arguments: tc_args.clone(),
                    };

                    let permission_result = {
                        let reg = registry.read().await;
                        reg.check_permission(&v2_tool_call, None)
                    };

                    match permission_result {
                        Ok(PermissionDecision::Allow) => {
                            // Proceed to execution
                        }
                        Ok(PermissionDecision::Confirm { context }) => {
                            // Check inherited/tree permissions first (Comment 12)
                            let is_inherited = self.allowed_tools.lock().await.contains(&tc_name);

                            // Phase 3.3: Check session-scoped permission memory first
                            let cache_key = format!("{}:{:x}", tc_name, Sha256::digest(&tc_args.to_string()));
                            let state = self.app.state::<crate::commands::AppState>();
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
                                    tracing::info!("Session memory: ALWAYS ALLOW tool '{}'", tc_name);
                                }
                            } else {
                                // User confirmation required
                                let approved = self.request_user_confirmation(
                                    &tc_id, &tc_name, &tc_args, chat_id, context,
                                    agent_id, agent_name, iteration
                                ).await;

                                if !approved {
                                    tracing::info!("User DENIED tool '{}' (id: {})", tc_name, tc_id);
                                    let hook_reg = self.hook_registry.clone();
                                    let tc_id_for_handle = tc_id.clone();
                                    let handle = tokio::spawn(async move {
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
                                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                        result
                                    });
                                    handles.push((tc_id_for_handle, handle));
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
                            let handle = tokio::spawn(async move {
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
                                hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                result
                            });
                            handles.push((tc_id_for_handle, handle));
                            continue;
                        }
                        Err(e) => {
                            tracing::error!("Permission check failed for tool '{}': {}", tc_name, e);
                            // Fallback to safe denial if permission check itself errors out
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let handle = tokio::spawn(async move {
                                let result = ToolResult {
                                    tool_call_id: tc_id.clone(),
                                    content: json!({
                                        "error": format!("Internal security check failed: {}", e),
                                        "tool": tc_name
                                    }),
                                    is_error: true,
                                    duration_ms: 0,
                                };
                                hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                                result
                            });
                            handles.push((tc_id_for_handle, handle));
                            continue;
                        }
                    }

                    let tool = self.tool_registry.read().await.get(&tc_name);
                    let app = self.app.clone();
                    let hook_reg = self.hook_registry.clone();
                    let cache = self.cache.clone();
                    let cache_key_clone = cache_key.clone();

                    let chat_id_inner = chat_id.to_string();
                    let token_inner = token.clone();
                    let tc_args_inner = tc_args.clone();
                    let tc_id_inner = tc_id.clone();
                    let agent_id_str = agent_id.to_string();
                    let agent_name_str = agent_name.to_string();
                    let depth = self.depth;

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let mut result = execute_single_tool(
                            tool, app, chat_id_inner, tc_id.clone(), tc_name.clone(), tc_args_inner, token_inner,
                            agent_id_str, agent_name_str, depth, Some(allowed_tools)
                        ).await;
                        result.duration_ms = start.elapsed().as_millis() as u64;
                        
                        // Cache successful results (not errors)
                        if !result.is_error {
                            cache.lock().await.set(cache_key_clone, result.content.clone());
                        }
                        
                        hook_reg.post_tool_use(&ToolCall { id: tc_id, name: tc_name, args: tc_args }, &result);
                        result
                    });
                    handles.push((tc_id_inner, handle));
                }
            }
        }

        // Collect pipeline results into the existing results vec (which already has inline meta-tool results)
        for (tc_id, handle) in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    tracing::error!("Tool task panicked for {}: {}", tc_id, e);
                    results.push(ToolResult {
                        tool_call_id: tc_id,
                        content: json!({ 
                            "error": format!("Internal execution panic: {}", e),
                            "hint": "The tool thread crashed unexpectedly. Please report this if it persists."
                        }),
                        is_error: true,
                        duration_ms: 0,
                    })
                }
            }
        }
        results
    }

    /// Emit a `tool:authorization_request` event and wait for user response.
    /// Returns `true` if approved, `false` if denied or timed out.
    async fn request_user_confirmation(
        &self,
        tool_call_id: &str,
        tool_name: &str,
        args: &serde_json::Value,
        chat_id: &str,
        context: crate::tools::permission::PermissionContext,
        _agent_id: &str,
        _agent_name: &str,
        iteration: usize,
    ) -> bool {
        use tauri::Manager;

        // Create oneshot channel for the response
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();

        // Store the sender in AppState
        {
            let state = self.app.state::<crate::commands::AppState>();
            let mut approvals = state.pending_tool_approvals.lock().await;
            approvals.insert(tool_call_id.to_string(), tx);
        }

        // Update status to show we're waiting
        let _ = self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
            message: format!("⚠ Awaiting approval: {}", tool_name),
            chat_id: chat_id.to_string(),
            iteration: Some(iteration),
        }));

        // Emit authorization request to frontend (direct app.emit for legacy behavior)
        let _ = self.app.emit("tool:authorization_request", json!({
            "chat_id": chat_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "arguments": args,
            "model": "default",
            "context": context
        }));

        // Emit structured chat:message for inline approval card (direct app.emit)
        let _ = self.app.emit("chat:message", json!({
            "chat_id": chat_id,
            "id": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "role": "assistant",
            "content": "",
            "kind": "approval_request",
            "metadata": {
                "kind": "approval_request",
                "approval_request": {
                    "tool_call_id": tool_call_id,
                    "tool_name": tool_name,
                    "arguments": args,
                    "chat_id": chat_id,
                    "context": context
                }
            }
        }));

        // Wait for user response with 120s timeout
        match tokio::time::timeout(
            tokio::time::Duration::from_secs(120),
            rx,
        ).await {
            Ok(Ok(approved)) => approved,
            Ok(Err(_)) => {
                tracing::warn!("Tool approval channel closed for '{}'", tool_call_id);
                // Clean up the pending entry so it doesn't leak
                let state = self.app.state::<crate::commands::AppState>();
                let mut approvals = state.pending_tool_approvals.lock().await;
                approvals.remove(tool_call_id);
                false
            }
            Err(_) => {
                tracing::warn!("Tool approval timed out for '{}'", tool_call_id);
                // Clean up the pending entry
                let state = self.app.state::<crate::commands::AppState>();
                let mut approvals = state.pending_tool_approvals.lock().await;
                approvals.remove(tool_call_id);
                false
            }
        }
    }
}
