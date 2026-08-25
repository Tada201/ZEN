//! The parallel tool-call executor with P3 lifecycle hooks, unified
//! permission checks, and tool-result caching.
//!
//! Split out of the former single `tool_dispatch.rs` during
//! BIG_MIGRATION.md Phase 11. Tool exposure decisions live in
//! `router.rs`; result collection and completion events live in
//! `completion.rs`.

use super::super::lifecycle::Runner;
use super::super::tool_actions::{
    emit_cached_tool_result_action, emit_tool_call_action, CachedResultParams, ToolActionParams,
};
use super::super::tool_pipeline::{
    cache_key_for, normalize_tool_result, preprocess_tool_calls, should_read_cache,
    should_write_cache, PipelineCall,
};
use super::completion::collect_tool_results_as_completed;
use crate::chat_status::ChatStatusPhase;
use crate::event_bus::{AgentEvent, ChatStatusPayload, ToolStartPayload};
use crate::hooks::HookDecision;
use crate::types::{ToolCall, ToolResult};
use zen_db::queries;
use crate::ports::ToolApprovalExecutionContext;
use zen_security::approval::PermissionDecision;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

impl Runner {
    /// Execute tool calls with P3 lifecycle hooks (pre/post).
    /// For high-risk tools like `run_command`, emits an authorization request
    /// and waits for user approval before executing.
    #[allow(clippy::too_many_arguments)]
    pub(in super::super) async fn execute_tools_with_hooks(
        &self,
        tool_calls: &[ToolCall],
        chat_id: &str,
        iteration: usize,
        agent_id: &str,
        agent_name: &str,
        authorized_tool_ids: &[String],
        token: CancellationToken,
        assistant_message_id: Option<String>,
    ) -> Vec<ToolResult> {
        let tools_enabled = self.config.tools_enabled;
        let delegation_allowed = self.delegation_allowed;
        let (mut ordered_results, pipeline_calls) = preprocess_tool_calls(
            &self.ctx.tool_manager,
            tool_calls,
            authorized_tool_ids,
            tools_enabled,
            delegation_allowed,
        )
        .await;
        let run_id = self.execution_run_id(chat_id);
        let trace_id = self.trace_id();
        let parent_agent_id = self.parent_agent_id();
        let tool_batch_id = self.tool_batch_id(chat_id, agent_id, iteration);

        // Process pipeline calls (non-meta-tools and transformed tool_exec)
        let mut handles = Vec::new();

        for pipeline_call in &pipeline_calls {
            let mut effective_pipeline_call: Option<PipelineCall> = None;
            if pipeline_call.original.name == "tool_exec" {
                match self.hook_registry.pre_tool_use(&pipeline_call.original) {
                    HookDecision::Deny { reason } => {
                        tracing::info!("Hook DENIED tool_exec envelope: {}", reason);
                        ordered_results[pipeline_call.index] = Some(normalize_tool_result(
                            pipeline_call.original.id.clone(),
                            "tool_exec",
                            "Tool Exec",
                            pipeline_call.original.args.clone(),
                            json!({
                                "error": format!("Tool execution denied by safety hook: {}", reason),
                                "tool": "tool_exec",
                                "hint": "The requested tool envelope was blocked before execution."
                            }),
                            true,
                            0,
                            chrono::Utc::now(),
                        ));
                        continue;
                    }
                    HookDecision::Modify { new_args } => {
                        let modified = ToolCall {
                            id: pipeline_call.original.id.clone(),
                            name: "tool_exec".to_string(),
                            args: new_args,
                        };
                        let (modified_results, modified_calls) = preprocess_tool_calls(
                            &self.ctx.tool_manager,
                            std::slice::from_ref(&modified),
                            authorized_tool_ids,
                            tools_enabled,
                            delegation_allowed,
                        )
                        .await;
                        if let Some(Some(result)) = modified_results.into_iter().next() {
                            ordered_results[pipeline_call.index] = Some(result);
                            continue;
                        }
                        if let Some(modified_call) = modified_calls.into_iter().next() {
                            effective_pipeline_call = Some(PipelineCall {
                                index: pipeline_call.index,
                                original: modified,
                                resolved: modified_call.resolved,
                            });
                        }
                    }
                    HookDecision::Allow => {}
                }
            }

            let pipeline_call = effective_pipeline_call.as_ref().unwrap_or(pipeline_call);
            let tool_call = &pipeline_call.resolved;
            self.record_child_tool_call_id(tool_call.id.clone()).await;
            self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                message: format!("Executing: {}", tool_call.name),
                chat_id: chat_id.to_string(),
                iteration: Some(iteration),
                phase: Some(ChatStatusPhase::TOOL_EXECUTING.to_string()),
                metadata: Some(json!({
                    "toolName": tool_call.name,
                    "toolCallId": tool_call.id,
                    "iteration": iteration,
                    "runId": run_id.clone(),
                    "parentAgentId": parent_agent_id.clone(),
                    "executionId": tool_call.id,
                    "batchId": tool_batch_id.clone(),
                    "toolBatchId": tool_batch_id.clone(),
                })),
            }));

            emit_tool_call_action(ToolActionParams {
                events: self.ctx.events.as_ref(),
                db_pool: self.db_pool.as_ref(),
                chat_id,
                tool_call,
                agent_id,
                agent_name,
                iteration,
                depth: self.depth,
            })
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

                emit_cached_tool_result_action(CachedResultParams {
                    events: self.ctx.events.as_ref(),
                    db_pool: self.db_pool.as_ref(),
                    chat_id,
                    tool_call,
                    cached_result: &cached_result,
                    agent_id,
                    agent_name,
                    iteration,
                    depth: self.depth,
                })
                .await;

                self.emit(AgentEvent::ToolStart(ToolStartPayload {
                    tool_name: tool_call.name.clone(),
                    tool_call_id: tc_id.clone(),
                    arguments: tool_call.args.clone(),
                    sequence: self.next_event_sequence(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    phase: "tool_running".to_string(),
                    trace_id: trace_id.clone(),
                    run_id: Some(run_id.clone()),
                    parent_agent_id: parent_agent_id.clone(),
                    parent_tool_call_id: self.parent_tool_call_id(),
                    execution_id: Some(tc_id.clone()),
                    batch_id: Some(tool_batch_id.clone()),
                    tool_batch_id: Some(tool_batch_id.clone()),
                    message_id: assistant_message_id.clone(),
                    agent_id: agent_id.to_string(),
                    agent_name: agent_name.to_string(),
                    chat_id: chat_id.to_string(),
                    iteration,
                }));

                let tc_id_inner = tc_id.clone();
                let result_tool_name = tool_call.name.clone();
                let result_args = tool_call.args.clone();
                let started_at = chrono::Utc::now();
                handles.push((
                    pipeline_call.index,
                    tc_id_inner,
                    result_tool_name.clone(),
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
                    let event_tool_name = result_tool_name.clone();
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
                    handles.push((
                        pipeline_call.index,
                        tc_id_for_handle,
                        event_tool_name,
                        handle,
                    ));
                    continue;
                }
                HookDecision::Modify { new_args } => {
                    self.emit(AgentEvent::ToolStart(ToolStartPayload {
                        tool_name: tc_name.clone(),
                        tool_call_id: tc_id.clone(),
                        arguments: tc_args.clone(),
                        sequence: self.next_event_sequence(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        phase: "tool_running".to_string(),
                        trace_id: trace_id.clone(),
                        run_id: Some(run_id.clone()),
                        parent_agent_id: parent_agent_id.clone(),
                        parent_tool_call_id: self.parent_tool_call_id(),
                        execution_id: Some(tc_id.clone()),
                        batch_id: Some(tool_batch_id.clone()),
                        tool_batch_id: Some(tool_batch_id.clone()),
                        message_id: assistant_message_id.clone(),
                        agent_id: agent_id.to_string(),
                        agent_name: agent_name.to_string(),
                        chat_id: chat_id.to_string(),
                        iteration,
                    }));
                    let tool_service = self.ctx.tool_service.clone();
                    let hook_reg = self.hook_registry.clone();

                    let chat_id_inner = chat_id.to_string();
                    let tc_id_inner = tc_id.clone();
                    let token_inner = token.clone();
                    let depth = self.depth;
                    let original_name = pipeline_call.original.name.clone();
                    let result_tool_name = tc_name.clone();
                    let event_tool_name = result_tool_name.clone();

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let started_at = chrono::Utc::now();
                        let mut result = tool_service
                            .execute_agent_tool(crate::ports::PortToolExecution {
                                chat_id: chat_id_inner,
                                tool_call: ToolCall {
                                    id: tc_id.clone(),
                                    name: tc_name.clone(),
                                    args: new_args.clone(),
                                },
                                token: token_inner,
                                depth,
                                allowed_tools: Some(allowed_tools),
                                delegation_allowed,
                            })
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
                    handles.push((pipeline_call.index, tc_id_inner, event_tool_name, handle));
                }
                HookDecision::Allow => {
                    // ── Unified Permission Check (YOLO mode, overrides, etc.) ──
                    let v2_tool_call = zen_tools::ToolCall {
                        id: tc_id.clone(),
                        name: tc_name.clone(),
                        arguments: tc_args.clone(),
                    };

                    let state = &self.ctx;
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
                                format!("{}:{:x}", tc_name, Sha256::digest(tc_args.to_string()));
                            let always_allow = {
                                let mut session_perms = state.session_permissions.lock().await;
                                if !session_perms.contains_key(chat_id) {
                                    drop(session_perms);
                                    if let Ok(db) = state.db().await {
                                        match queries::load_session_permission_map(&db, chat_id)
                                            .await
                                        {
                                            Ok(map) => {
                                                let mut session_perms =
                                                    state.session_permissions.lock().await;
                                                session_perms
                                                    .entry(chat_id.to_string())
                                                    .or_insert(map);
                                            }
                                            Err(e) => {
                                                tracing::warn!(
                                                    chat_id = %chat_id,
                                                    error = %e,
                                                    "Failed to load persisted session tool permissions"
                                                );
                                            }
                                        }
                                    }
                                    session_perms = state.session_permissions.lock().await;
                                }
                                session_perms
                                    .get(chat_id)
                                    .and_then(|chat_perms| chat_perms.get(&cache_key))
                                    .copied()
                                    .unwrap_or(false)
                            };

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
                                // Schedule the approval wait inside this tool task so
                                // one high-risk tool does not block the rest of the
                                // parallel batch from starting.
                                self.emit(AgentEvent::ChatStatus(ChatStatusPayload {
                                    message: format!("Awaiting approval: {}", v2_tool_call.name),
                                    chat_id: chat_id.to_string(),
                                    iteration: Some(iteration),
                                    phase: Some(ChatStatusPhase::APPROVAL_REQUIRED.to_string()),
                                    metadata: Some(json!({
                                        "toolName": v2_tool_call.name,
                                        "toolCallId": v2_tool_call.id,
                                        "iteration": iteration,
                                        "runId": run_id,
                                        "parentAgentId": parent_agent_id,
                                        "executionId": v2_tool_call.id,
                                        "batchId": tool_batch_id,
                                        "toolBatchId": tool_batch_id,
                                    })),
                                }));

                                let tool_service = self.ctx.tool_service.clone();
                                let events = self.ctx.events.clone();
                                let hook_reg = self.hook_registry.clone();
                                let cache = self.cache.clone();
                                let cache_key_clone = cache_key.clone();
                                let allowed_tools = self.allowed_tools.clone();
                                let chat_id_inner = chat_id.to_string();
                                let tc_id_inner = tc_id.clone();
                                let tc_args_inner = tc_args.clone();
                                let result_tool_name = tc_name.clone();
                                let event_tool_name = result_tool_name.clone();
                                let original_name = pipeline_call.original.name.clone();
                                let run_id_inner = run_id.clone();
                                let trace_id_inner = trace_id.clone();
                                let parent_agent_id_inner = parent_agent_id.clone();
                                let parent_tool_call_id_inner = self.parent_tool_call_id();
                                let tool_batch_id_inner = tool_batch_id.clone();
                                let agent_id_inner = agent_id.to_string();
                                let agent_name_inner = agent_name.to_string();
                                let token_inner = token.clone();
                                let depth = self.depth;
                                let v2_tool_call_inner = v2_tool_call.clone();
                                let assistant_message_id_for_approval =
                                    assistant_message_id.clone();
                                let event_sequence = self.next_event_sequence();

                                let handle = tokio::spawn(async move {
                                    let started_at = chrono::Utc::now();
                                    let approval_outcome = tool_service
                                        .request_approval(
                                            "agent_runner",
                                            &chat_id_inner,
                                            &v2_tool_call_inner,
                                            context,
                                            Some(ToolApprovalExecutionContext {
                                                run_id: Some(run_id_inner.clone()),
                                                parent_agent_id: parent_agent_id_inner.clone(),
                                                execution_id: Some(v2_tool_call_inner.id.clone()),
                                                batch_id: Some(tool_batch_id_inner.clone()),
                                                tool_batch_id: Some(tool_batch_id_inner.clone()),
                                                agent_id: Some(agent_id_inner.clone()),
                                                agent_name: Some(agent_name_inner.clone()),
                                                iteration: Some(iteration),
                                            }),
                                        )
                                        .await;

                                    if !approval_outcome.approved() {
                                        tracing::info!(
                                            "Tool approval did not allow '{}' (id: {}, outcome: {:?})",
                                            v2_tool_call_inner.name,
                                            v2_tool_call_inner.id,
                                            approval_outcome
                                        );
                                        let result = ToolResult {
                                            tool_call_id: tc_id.clone(),
                                            content: json!({
                                                "error": approval_outcome.error_message(),
                                                "tool": tc_name,
                                                "hint": "The tool did not receive approval. Try a safer approach or ask the user before retrying."
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
                                        return normalize_tool_result(
                                            result.tool_call_id,
                                            &result_tool_name,
                                            &result_tool_name,
                                            tc_args_inner,
                                            result.content,
                                            true,
                                            result.duration_ms,
                                            started_at,
                                        );
                                    }

                                    tracing::info!(
                                        "User APPROVED tool '{}' (id: {})",
                                        v2_tool_call_inner.name,
                                        v2_tool_call_inner.id
                                    );
                                    allowed_tools
                                        .lock()
                                        .await
                                        .insert(v2_tool_call_inner.name.clone());

                                    AgentEvent::ToolStart(ToolStartPayload {
                                        tool_name: v2_tool_call_inner.name.clone(),
                                        tool_call_id: v2_tool_call_inner.id.clone(),
                                        arguments: v2_tool_call_inner.arguments.clone(),
                                        sequence: event_sequence,
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        phase: "tool_running".to_string(),
                                        trace_id: trace_id_inner,
                                        run_id: Some(run_id_inner),
                                        parent_agent_id: parent_agent_id_inner,
                                        parent_tool_call_id: parent_tool_call_id_inner,
                                        execution_id: Some(v2_tool_call_inner.id.clone()),
                                        batch_id: Some(tool_batch_id_inner.clone()),
                                        tool_batch_id: Some(tool_batch_id_inner),
                                        message_id: assistant_message_id_for_approval.clone(),
                                        agent_id: agent_id_inner,
                                        agent_name: agent_name_inner,
                                        chat_id: chat_id_inner.clone(),
                                        iteration,
                                    })
                                    .emit_to(events.as_ref());

                                    let start = std::time::Instant::now();
                                    let mut result = tool_service
                                        .execute_agent_tool(
                                            crate::ports::PortToolExecution {
                                                chat_id: chat_id_inner,
                                                tool_call: ToolCall {
                                                    id: tc_id.clone(),
                                                    name: tc_name.clone(),
                                                    args: tc_args_inner.clone(),
                                                },
                                                token: token_inner,
                                                depth,
                                                allowed_tools: Some(allowed_tools),
                                                delegation_allowed,
                                            },
                                        )
                                        .await;
                                    result.duration_ms = start.elapsed().as_millis() as u64;

                                    if should_write_cache(&tc_name, result.is_error) {
                                        if let Some(ttl) =
                                            crate::cache::ttl_for_tool(&tc_name)
                                        {
                                            cache.lock().await.set_with_ttl(
                                                cache_key_clone,
                                                result.content.clone(),
                                                ttl,
                                            );
                                        }
                                    } else if !result.is_error {
                                        // Mutating tool completed successfully — invalidate any
                                        // cached entries since we can't track which keys it affects.
                                        cache.lock().await.clear();
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

                                handles.push((
                                    pipeline_call.index,
                                    tc_id_inner,
                                    event_tool_name,
                                    handle,
                                ));
                                continue;
                            }
                        }
                        Ok(PermissionDecision::Deny { reason }) => {
                            tracing::info!("Permission DENIED tool '{}': {}", tc_name, reason);
                            let hook_reg = self.hook_registry.clone();
                            let tc_id_for_handle = tc_id.clone();
                            let result_tool_name = tc_name.clone();
                            let result_args = tc_args.clone();
                            let event_tool_name = result_tool_name.clone();
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
                            handles.push((
                                pipeline_call.index,
                                tc_id_for_handle,
                                event_tool_name,
                                handle,
                            ));
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
                            let event_tool_name = result_tool_name.clone();
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
                            handles.push((
                                pipeline_call.index,
                                tc_id_for_handle,
                                event_tool_name,
                                handle,
                            ));
                            continue;
                        }
                    }

                    self.emit(AgentEvent::ToolStart(ToolStartPayload {
                        tool_name: tc_name.clone(),
                        tool_call_id: tc_id.clone(),
                        arguments: tc_args.clone(),
                        sequence: self.next_event_sequence(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                        phase: "tool_running".to_string(),
                        trace_id: trace_id.clone(),
                        run_id: Some(run_id.clone()),
                        parent_agent_id: parent_agent_id.clone(),
                        parent_tool_call_id: self.parent_tool_call_id(),
                        execution_id: Some(tc_id.clone()),
                        batch_id: Some(tool_batch_id.clone()),
                        tool_batch_id: Some(tool_batch_id.clone()),
                        message_id: assistant_message_id.clone(),
                        agent_id: agent_id.to_string(),
                        agent_name: agent_name.to_string(),
                        chat_id: chat_id.to_string(),
                        iteration,
                    }));

                    let tool_service = self.ctx.tool_service.clone();
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
                    let event_tool_name = result_tool_name.clone();

                    let allowed_tools = self.allowed_tools.clone();
                    let handle = tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let started_at = chrono::Utc::now();
                        let mut result = tool_service
                            .execute_agent_tool(crate::ports::PortToolExecution {
                                chat_id: chat_id_inner,
                                tool_call: ToolCall {
                                    id: tc_id.clone(),
                                    name: tc_name.clone(),
                                    args: tc_args_inner,
                                },
                                token: token_inner,
                                depth,
                                allowed_tools: Some(allowed_tools),
                                delegation_allowed,
                            })
                            .await;
                        result.duration_ms = start.elapsed().as_millis() as u64;

                        if should_write_cache(&tc_name, result.is_error) {
                            if let Some(ttl) = crate::cache::ttl_for_tool(&tc_name) {
                                cache.lock().await.set_with_ttl(
                                    cache_key_clone,
                                    result.content.clone(),
                                    ttl,
                                );
                            }
                        } else if !result.is_error {
                            // Mutating tool completed successfully — invalidate any cached
                            // entries since we can't track which keys it affects.
                            cache.lock().await.clear();
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
                    handles.push((pipeline_call.index, tc_id_inner, event_tool_name, handle));
                }
            }
        }

        // Collect pipeline results by original call index so meta tools and real
        // tools stay in the exact order the model emitted them. Completion events
        // are emitted as each task resolves so the UI can reveal fast tool output
        // without waiting for the slowest parallel call.
        let assistant_message_id_for_complete = assistant_message_id.clone();
        collect_tool_results_as_completed(
            handles,
            &mut ordered_results,
            |tool_name, result| {
                self.emit_tool_complete_for_result(
                    chat_id,
                    iteration,
                    agent_id,
                    agent_name,
                    tool_name,
                    result,
                    assistant_message_id_for_complete.clone(),
                );
            },
            token.clone(),
        )
        .await;

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
}
