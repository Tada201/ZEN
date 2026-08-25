// Interactive approval request/response plus its two emitted events.
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
    pub async fn request_interactive_approval(
        &self,
        app: AppHandle,
        caller: &str,
        chat_id: &str,
        tool_call: &ToolCall,
        context: crate::tools::permission::PermissionContext,
        execution_context: Option<ToolApprovalExecutionContext>,
    ) -> ToolApprovalOutcome {
        self.audit(
            SecurityDecision::Ask,
            caller,
            &tool_call.name,
            "user confirmation requested",
        )
        .await;

        let (tx, rx) = tokio::sync::oneshot::channel::<ToolApprovalDecision>();
        let args_hash = approval_args_hash(&tool_call.arguments);
        {
            let mut approvals = self.pending_approvals.lock().await;
            approvals.insert(
                tool_call.id.clone(),
                PendingToolApproval {
                    sender: tx,
                    chat_id: chat_id.to_string(),
                    tool_name: tool_call.name.clone(),
                    args_hash: args_hash.clone(),
                    args_snapshot: tool_call.arguments.clone(),
                },
            );
        }

        self.emit_approval_request(
            &app,
            chat_id,
            tool_call,
            context,
            execution_context.as_ref(),
            &args_hash,
        );

        let outcome = match tokio::time::timeout(tokio::time::Duration::from_secs(120), rx).await {
            Ok(Ok(decision)) => {
                if !decision.approved {
                    ToolApprovalOutcome::Denied
                } else if decision.args_hash == args_hash {
                    ToolApprovalOutcome::Approved
                } else {
                    ToolApprovalOutcome::ArgumentMismatch
                }
            }
            Ok(Err(_)) => {
                let mut approvals = self.pending_approvals.lock().await;
                approvals.remove(&tool_call.id);
                ToolApprovalOutcome::Cancelled
            }
            Err(_) => {
                let mut approvals = self.pending_approvals.lock().await;
                approvals.remove(&tool_call.id);
                self.emit_approval_timeout(&app, chat_id, tool_call, execution_context.as_ref());
                ToolApprovalOutcome::TimedOut
            }
        };

        if outcome.approved() {
            self.audit(
                SecurityDecision::Allow,
                caller,
                &tool_call.name,
                "user approved tool execution",
            )
            .await;
        } else {
            self.audit(
                SecurityDecision::Deny,
                caller,
                &tool_call.name,
                match outcome {
                    ToolApprovalOutcome::Denied => "user denied tool execution",
                    ToolApprovalOutcome::TimedOut => "tool approval timed out",
                    ToolApprovalOutcome::Cancelled => "tool approval channel closed",
                    ToolApprovalOutcome::ArgumentMismatch => {
                        "tool approval rejected because arguments changed"
                    }
                    ToolApprovalOutcome::Approved => "user approved tool execution",
                },
            )
            .await;
        }

        outcome
    }

    pub(super) fn emit_approval_request(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
        context: crate::tools::permission::PermissionContext,
        execution_context: Option<&ToolApprovalExecutionContext>,
        args_hash: &str,
    ) {
        let run_id = execution_context.and_then(|ctx| ctx.run_id.as_deref());
        let parent_agent_id = execution_context.and_then(|ctx| ctx.parent_agent_id.as_deref());
        let execution_id = execution_context.and_then(|ctx| ctx.execution_id.as_deref());
        let batch_id = execution_context.and_then(|ctx| ctx.batch_id.as_deref());
        let tool_batch_id = execution_context.and_then(|ctx| ctx.tool_batch_id.as_deref());
        let agent_id = execution_context.and_then(|ctx| ctx.agent_id.as_deref());
        let agent_name = execution_context.and_then(|ctx| ctx.agent_name.as_deref());
        let iteration = execution_context.and_then(|ctx| ctx.iteration);
        let display_arguments =
            crate::tools::permission::redacted_arguments_for_display(&tool_call.arguments);
        let _ = app.emit(
            "tool:authorization_request",
            serde_json::json!({
                "chat_id": chat_id,
                "tool_call_id": tool_call.id,
                "tool_name": tool_call.name,
                "arguments": display_arguments,
                "run_id": run_id,
                "parent_agent_id": parent_agent_id,
                "execution_id": execution_id,
                "batch_id": batch_id,
                "tool_batch_id": tool_batch_id,
                "agent_id": agent_id,
                "agent_name": agent_name,
                "iteration": iteration,
                "model": "default",
                "args_hash": args_hash,
                "context": context
            }),
        );

        let _ = app.emit(
            "chat:message",
            serde_json::json!({
                "chat_id": chat_id,
                "id": uuid::Uuid::new_v4().to_string(),
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "role": "assistant",
                "content": "",
                "kind": "approval_request",
                "metadata": {
                    "kind": "approval_request",
                        "approval_request": {
                            "tool_call_id": tool_call.id,
                            "tool_name": tool_call.name,
                            "arguments": display_arguments,
                            "chat_id": chat_id,
                            "args_hash": args_hash,
                            "context": context
                    },
                    "runId": run_id,
                    "parentAgentId": parent_agent_id,
                    "executionId": execution_id,
                    "batchId": batch_id,
                    "toolBatchId": tool_batch_id,
                    "agentId": agent_id,
                    "agentName": agent_name,
                    "iteration": iteration
                }
            }),
        );
    }

    pub(super) fn emit_approval_timeout(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
        execution_context: Option<&ToolApprovalExecutionContext>,
    ) {
        let display_arguments =
            crate::tools::permission::redacted_arguments_for_display(&tool_call.arguments);
        let _ = app.emit(
            "tool:authorization_timeout",
            serde_json::json!({
                "chat_id": chat_id,
                "tool_call_id": tool_call.id,
                "tool_name": tool_call.name,
                "arguments": display_arguments,
                "run_id": execution_context.and_then(|ctx| ctx.run_id.as_deref()),
                "parent_agent_id": execution_context.and_then(|ctx| ctx.parent_agent_id.as_deref()),
                "execution_id": execution_context.and_then(|ctx| ctx.execution_id.as_deref()),
                "batch_id": execution_context.and_then(|ctx| ctx.batch_id.as_deref()),
                "tool_batch_id": execution_context.and_then(|ctx| ctx.tool_batch_id.as_deref()),
                "agent_id": execution_context.and_then(|ctx| ctx.agent_id.as_deref()),
                "agent_name": execution_context.and_then(|ctx| ctx.agent_name.as_deref()),
                "iteration": execution_context.and_then(|ctx| ctx.iteration),
            }),
        );
    }
}
