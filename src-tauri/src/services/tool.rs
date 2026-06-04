use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::services::{
    AuditEvent, PermissionDecision as SecurityDecision, PermissionRequest, PrivilegedOperation,
    RiskLevel as SecurityRiskLevel, SecurityService,
};
use crate::tools::{GlobalToolRegistry, ToolCall, ToolError};

pub struct ToolService {
    registry: GlobalToolRegistry,
    security: Arc<SecurityService>,
    pending_approvals: Arc<Mutex<HashMap<String, PendingToolApproval>>>,
    execution_limit: Arc<Semaphore>,
}

pub struct PendingToolApproval {
    pub sender: tokio::sync::oneshot::Sender<ToolApprovalDecision>,
    pub chat_id: String,
    pub tool_name: String,
    pub args_hash: String,
    pub args_snapshot: serde_json::Value,
}

pub struct ToolApprovalDecision {
    pub approved: bool,
    pub args_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolApprovalOutcome {
    Approved,
    Denied,
    TimedOut,
    Cancelled,
    ArgumentMismatch,
}

impl ToolApprovalOutcome {
    pub fn approved(&self) -> bool {
        matches!(self, Self::Approved)
    }

    pub fn error_message(&self) -> &'static str {
        match self {
            Self::Approved => "",
            Self::Denied => "Tool execution denied by user.",
            Self::TimedOut => "Tool approval timed out.",
            Self::Cancelled => "Tool approval was cancelled before the user responded.",
            Self::ArgumentMismatch => "Tool approval rejected because arguments changed after approval was requested.",
        }
    }
}

pub struct ToolApprovalExecutionContext {
    pub run_id: Option<String>,
    pub parent_agent_id: Option<String>,
    pub execution_id: Option<String>,
    pub batch_id: Option<String>,
    pub tool_batch_id: Option<String>,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub iteration: Option<usize>,
}

impl ToolService {
    pub fn new(
        registry: GlobalToolRegistry,
        security: Arc<SecurityService>,
        pending_approvals: Arc<Mutex<HashMap<String, PendingToolApproval>>>,
    ) -> Self {
        Self {
            registry,
            security,
            pending_approvals,
            execution_limit: Arc::new(Semaphore::new(16)),
        }
    }

    pub async fn execute_interactive(
        &self,
        app: AppHandle,
        caller: &str,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<serde_json::Value, String> {
        let tool_risk = self.security_risk_for_tool(&tool_call.name).await;

        let security_decision = self.security.evaluate(&PermissionRequest {
            operation: PrivilegedOperation::McpToolCall,
            risk: tool_risk,
            caller: caller.to_string(),
            target: Some(tool_call.name.clone()),
            workspace: None,
            reason: Some("tool execution requested".to_string()),
        });

        self.audit(
            security_decision,
            caller,
            &tool_call.name,
            "tool execution requested",
        )
        .await;

        if security_decision == SecurityDecision::Deny {
            return Err("Tool execution denied by security policy".to_string());
        }

        let permission_result = {
            let registry = self.registry.read().await;
            registry.check_permission(&tool_call, None)
        };

        match permission_result {
            Ok(crate::tools::permission::PermissionDecision::Allow) => {
                self.execute_v2_authorized(app, chat_id, tool_call, "allow")
                    .await
            }
            Ok(crate::tools::permission::PermissionDecision::Confirm { context }) => {
                let approval_outcome = self
                    .request_interactive_approval(
                        app.clone(),
                        caller,
                        &chat_id,
                        &tool_call,
                        context,
                        None,
                    )
                    .await;
                if approval_outcome.approved() {
                    self.execute_v2_authorized(app, chat_id, tool_call, "allow")
                        .await
                } else {
                    Err(approval_outcome.error_message().to_string())
                }
            }
            Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                {
                    let mut registry = self.registry.write().await;
                    registry.record_execution(&tool_call, false, "deny");
                }
                Err(format!("Permission denied: {}", reason))
            }
            Err(e) => Err(e.to_string()),
        }
    }

    pub async fn check_permission(
        &self,
        caller: &str,
        tool_call: &ToolCall,
    ) -> Result<crate::tools::permission::PermissionDecision, ToolError> {
        let security_decision = self
            .evaluate_security(caller, tool_call, "tool permission check requested")
            .await;

        if security_decision == SecurityDecision::Deny {
            self.audit(
                SecurityDecision::Deny,
                caller,
                &tool_call.name,
                "tool denied by security service",
            )
            .await;
            return Ok(crate::tools::permission::PermissionDecision::Deny {
                reason: "Tool execution denied by security policy".to_string(),
            });
        }

        let registry_decision = {
            let registry = self.registry.read().await;
            registry.check_permission(tool_call, None)
        }?;

        let (decision, reason) = match &registry_decision {
            crate::tools::permission::PermissionDecision::Allow => {
                (SecurityDecision::Allow, "tool registry allowed execution")
            }
            crate::tools::permission::PermissionDecision::Confirm { .. } => {
                (SecurityDecision::Ask, "tool registry requires confirmation")
            }
            crate::tools::permission::PermissionDecision::Deny { .. } => {
                (SecurityDecision::Deny, "tool registry denied execution")
            }
        };

        self.audit(decision, caller, &tool_call.name, reason).await;

        Ok(registry_decision)
    }

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

    pub async fn execute_non_interactive(
        &self,
        app: AppHandle,
        caller: &str,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<serde_json::Value, String> {
        let security_decision = self
            .evaluate_security(
                caller,
                &tool_call,
                "non-interactive tool execution requested",
            )
            .await;

        let tool_risk = {
            let registry = self.registry.read().await;
            registry
                .get(&tool_call.name)
                .map(|tool| tool.risk_level())
                .or_else(|| registry.known_tool_risk(&tool_call.name))
                .unwrap_or(crate::tools::permission::RiskLevel::Critical)
        };

        if matches!(tool_risk, crate::tools::permission::RiskLevel::Critical) {
            self.audit(
                SecurityDecision::Ask,
                caller,
                &tool_call.name,
                "critical tool requires interactive approval",
            )
            .await;
            return Err("Critical tools require interactive approval and cannot run through non-interactive MCP.".to_string());
        }

        if security_decision != SecurityDecision::Allow {
            return Err(format!(
                "Tool execution requires {:?}; caller is non-interactive",
                security_decision
            ));
        }

        let permission_result = {
            let registry = self.registry.read().await;
            registry.check_permission(&tool_call, None)
        };

        match permission_result {
            Ok(crate::tools::permission::PermissionDecision::Allow) => {
                self.audit(
                    SecurityDecision::Allow,
                    caller,
                    &tool_call.name,
                    "tool registry allowed execution",
                )
                .await;
                self.execute_v2_authorized(app, chat_id, tool_call, "allow")
                    .await
            }
            Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                self.audit(
                    SecurityDecision::Deny,
                    caller,
                    &tool_call.name,
                    "tool registry denied execution",
                )
                .await;
                Err(format!("Permission denied: {}", reason))
            }
            Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                self.audit(
                    SecurityDecision::Ask,
                    caller,
                    &tool_call.name,
                    "tool registry requires confirmation",
                )
                .await;
                Err("User confirmation required for this tool call. Non-interactive callers cannot approve it.".to_string())
            }
            Err(e) => Err(format!("Security check failed: {}", e)),
        }
    }

    pub async fn execute_agent_tool(
        &self,
        tool: Option<Arc<dyn crate::agent::tools::AgentTool>>,
        app: AppHandle,
        chat_id: String,
        tool_call: crate::agent::types::ToolCall,
        token: CancellationToken,
        depth: u32,
        allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
    ) -> crate::agent::types::ToolResult {
        let tool = if tool.is_some() {
            tool
        } else {
            let registry = self.registry.read().await;
            registry.get_legacy(&tool_call.name)
        };

        if let Some(tool) = tool {
            let v2_tool_call = ToolCall {
                id: tool_call.id.clone(),
                name: tool_call.name.clone(),
                arguments: tool_call.args.clone(),
            };

            let permission_decision = self.check_permission("agent_tool", &v2_tool_call).await;
            match permission_decision {
                Ok(crate::tools::permission::PermissionDecision::Allow) => {}
                Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                    let already_allowed = if let Some(allowed_tools) = &allowed_tools {
                        allowed_tools.lock().await.contains(&tool_call.name)
                    } else {
                        false
                    };

                    if !already_allowed {
                        return crate::agent::types::ToolResult {
                            tool_call_id: tool_call.id.clone(),
                            content: serde_json::json!({
                                "error": "Tool execution requires user confirmation.",
                                "tool": tool_call.name,
                                "hint": "Execution was blocked because this code path cannot approve confirmation prompts."
                            }),
                            is_error: true,
                            duration_ms: 0,
                        };
                    }
                }
                Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": format!("Tool execution denied by security policy: {}", reason),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
                Err(e) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": format!("Tool permission check failed: {}", e),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
            }

            let timeout_seconds = tool.timeout_seconds();
            let permit = match self.acquire_execution_permit("agent_tool", &tool_call.name).await {
                Ok(permit) => permit,
                Err(e) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": e,
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
            };
            let tool_run_future = tool.run(
                app.clone(),
                chat_id,
                tool_call.args.clone(),
                depth,
                allowed_tools,
                token.clone(),
            );

            let start = std::time::Instant::now();
            let result_outcome = tokio::select! {
                res = tokio::time::timeout(std::time::Duration::from_secs(timeout_seconds), tool_run_future) => {
                    match res {
                        Ok(Ok(mut val)) => {
                            let s = val.to_string();
                            if s.len() > 200 * 1024 {
                                tracing::warn!("Tool output too large ({} bytes), truncating to 200KB", s.len());
                                let suffix = format!("... [TRUNCATED DUE TO SIZE ({} bytes)]", s.len());
                                let max_bytes: usize = 200 * 1024;
                                let max_content_bytes = max_bytes.saturating_sub(suffix.len());
                                let mut truncated = String::new();
                                let mut byte_count = 0;
                                for c in s.chars() {
                                    let char_len = c.len_utf8();
                                    if byte_count + char_len > max_content_bytes {
                                        break;
                                    }
                                    truncated.push(c);
                                    byte_count += char_len;
                                }
                                val = serde_json::json!(format!("{}{}", truncated, suffix));
                            }
                            Ok(val)
                        },
                        Ok(Err(e)) => Err(format!("Tool error: {}", e)),
                        Err(_) => Err(format!("Tool execution timed out after {}s", timeout_seconds)),
                    }
                },
                _ = token.cancelled() => {
                    Err("Tool execution cancelled by user".to_string())
                }
            };
            drop(permit);
            let duration_ms = start.elapsed().as_millis() as u64;

            match result_outcome {
                Ok(val) => {
                    self.audit_execution_result(
                        "agent_tool",
                        &tool_call.name,
                        &tool_call.id,
                        true,
                        duration_ms,
                        Some(&val),
                        None,
                    )
                    .await;
                    crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id,
                        content: val,
                        is_error: false,
                        duration_ms,
                    }
                }
                Err(e) => {
                    let content = serde_json::json!({
                        "error": e,
                        "tool": tool_call.name,
                        "hint": "This tool call failed or was interrupted. You may retry with different arguments or approach."
                    });
                    self.audit_execution_result(
                        "agent_tool",
                        &tool_call.name,
                        &tool_call.id,
                        false,
                        duration_ms,
                        Some(&content),
                        content.get("error").and_then(|v| v.as_str()),
                    )
                    .await;
                    crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content,
                        is_error: true,
                        duration_ms,
                    }
                }
            }
        } else {
            let v2_tool_call = ToolCall {
                id: tool_call.id.clone(),
                name: tool_call.name.clone(),
                arguments: tool_call.args.clone(),
            };
            let v2_exists = {
                let registry = self.registry.read().await;
                registry.get(&v2_tool_call.name).is_some()
            };

            if v2_exists {
                let permission_decision = self.check_permission("agent_tool", &v2_tool_call).await;
                match permission_decision {
                    Ok(crate::tools::permission::PermissionDecision::Allow) => {
                        let start = std::time::Instant::now();
                        match self
                            .execute_v2_authorized(app, chat_id, v2_tool_call, "agent_tool")
                            .await
                        {
                            Ok(content) => crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content,
                                is_error: false,
                                duration_ms: start.elapsed().as_millis() as u64,
                            },
                            Err(e) => crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content: serde_json::json!({
                                    "error": e,
                                    "tool": tool_call.name,
                                    "hint": "This v2 tool failed during execution."
                                }),
                                is_error: true,
                                duration_ms: start.elapsed().as_millis() as u64,
                            },
                        }
                    }
                    Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                        let already_allowed = if let Some(allowed_tools) = &allowed_tools {
                            allowed_tools.lock().await.contains(&tool_call.name)
                        } else {
                            false
                        };

                        if already_allowed {
                            let start = std::time::Instant::now();
                            match self
                                .execute_v2_authorized(app, chat_id, v2_tool_call, "agent_tool")
                                .await
                            {
                                Ok(content) => crate::agent::types::ToolResult {
                                    tool_call_id: tool_call.id,
                                    content,
                                    is_error: false,
                                    duration_ms: start.elapsed().as_millis() as u64,
                                },
                                Err(e) => crate::agent::types::ToolResult {
                                    tool_call_id: tool_call.id,
                                    content: serde_json::json!({
                                        "error": e,
                                        "tool": tool_call.name,
                                        "hint": "This v2 tool failed during execution."
                                    }),
                                    is_error: true,
                                    duration_ms: start.elapsed().as_millis() as u64,
                                },
                            }
                        } else {
                            crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content: serde_json::json!({
                                    "error": "Tool execution requires user confirmation.",
                                    "tool": tool_call.name,
                                    "hint": "Execution was blocked because this code path cannot approve confirmation prompts."
                                }),
                                is_error: true,
                                duration_ms: 0,
                            }
                        }
                    }
                    Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                        crate::agent::types::ToolResult {
                            tool_call_id: tool_call.id,
                            content: serde_json::json!({
                                "error": format!("Tool execution denied by security policy: {}", reason),
                                "tool": tool_call.name,
                            }),
                            is_error: true,
                            duration_ms: 0,
                        }
                    }
                    Err(e) => crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id,
                        content: serde_json::json!({
                            "error": format!("Tool permission check failed: {}", e),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    },
                }
            } else {
                crate::agent::types::ToolResult {
                    tool_call_id: tool_call.id,
                    content: serde_json::json!({
                        "error": format!("Tool '{}' not found", tool_call.name),
                        "available_tools": "Use handoff_to_agent if you need a specialized expert."
                    }),
                    is_error: true,
                    duration_ms: 0,
                }
            }
        }
    }

    async fn execute_v2_authorized(
        &self,
        app: AppHandle,
        chat_id: String,
        tool_call: ToolCall,
        decision: &str,
    ) -> Result<serde_json::Value, String> {
        let tool = {
            let registry = self.registry.read().await;
            registry.get(&tool_call.name)
        }
        .ok_or_else(|| format!("Tool not found: {}", tool_call.name))?;

        {
            let mut registry = self.registry.write().await;
            registry.record_execution(&tool_call, true, decision);
        }

        self.audit(
            SecurityDecision::Allow,
            "tool_service",
            &tool_call.name,
            "tool execution started",
        )
        .await;

        let tool_name = tool_call.name.clone();
        let tool_call_id = tool_call.id.clone();
        let _permit = self
            .acquire_execution_permit("tool_service", &tool_name)
            .await?;
        let start = std::time::Instant::now();
        let result = tool
            .execute(app, chat_id, tool_call.arguments)
            .await
            .map(|output| output.content)
            .map_err(|e| e.to_string());
        let duration_ms = start.elapsed().as_millis() as u64;

        self.audit(
            if result.is_ok() {
                SecurityDecision::Allow
            } else {
                SecurityDecision::Deny
            },
            "tool_service",
            &tool_name,
            if result.is_ok() {
                "tool execution succeeded"
            } else {
                "tool execution failed"
            },
        )
        .await;
        self.audit_execution_result(
            "tool_service",
            &tool_name,
            &tool_call_id,
            result.is_ok(),
            duration_ms,
            result.as_ref().ok(),
            result.as_ref().err().map(String::as_str),
        )
        .await;

        result
    }

    async fn audit(&self, decision: SecurityDecision, caller: &str, target: &str, reason: &str) {
        self.audit_operation(decision, map_tool_operation(target), caller, target, reason)
            .await;
    }

    async fn audit_operation(
        &self,
        decision: SecurityDecision,
        operation: PrivilegedOperation,
        caller: &str,
        target: &str,
        reason: &str,
    ) {
        self.security
            .record_audit(AuditEvent {
                operation,
                decision,
                caller: caller.to_string(),
                target: Some(target.to_string()),
                reason: Some(reason.to_string()),
            })
            .await;
    }

    async fn audit_execution_result(
        &self,
        caller: &str,
        resolved_name: &str,
        tool_call_id: &str,
        success: bool,
        duration_ms: u64,
        output: Option<&serde_json::Value>,
        error: Option<&str>,
    ) {
        let reason = serde_json::json!({
            "event": "tool_execution_result",
            "resolved_name": resolved_name,
            "tool_call_id": tool_call_id,
            "outcome": if success { "success" } else { "failure" },
            "duration_ms": duration_ms,
            "output_hash": output.map(output_hash),
            "error": error,
        })
        .to_string();

        self.audit_operation(
            if success {
                SecurityDecision::Allow
            } else {
                SecurityDecision::Deny
            },
            map_tool_operation(resolved_name),
            caller,
            resolved_name,
            &reason,
        )
        .await;
    }

    async fn evaluate_security(
        &self,
        caller: &str,
        tool_call: &ToolCall,
        reason: &str,
    ) -> SecurityDecision {
        let tool_risk = self.security_risk_for_tool(&tool_call.name).await;

        let decision = self.security.evaluate(&PermissionRequest {
            operation: map_tool_operation(&tool_call.name),
            risk: tool_risk,
            caller: caller.to_string(),
            target: Some(tool_call.name.clone()),
            workspace: None,
            reason: Some(reason.to_string()),
        });

        self.audit(decision, caller, &tool_call.name, reason).await;
        decision
    }

    async fn security_risk_for_tool(&self, tool_name: &str) -> SecurityRiskLevel {
        let registry = self.registry.read().await;
        registry
            .get(tool_name)
            .map(|tool| tool.risk_level())
            .or_else(|| registry.known_tool_risk(tool_name))
            .map(map_tool_risk)
            .unwrap_or(SecurityRiskLevel::Critical)
    }

    async fn acquire_execution_permit(
        &self,
        caller: &str,
        tool_name: &str,
    ) -> Result<OwnedSemaphorePermit, String> {
        match self.execution_limit.clone().acquire_owned().await {
            Ok(permit) => Ok(permit),
            Err(_) => {
                self.audit(
                    SecurityDecision::Deny,
                    caller,
                    tool_name,
                    "tool execution rejected because concurrency limiter is closed",
                )
                .await;
                Err("Tool execution is temporarily unavailable because the concurrency limiter is closed.".to_string())
            }
        }
    }

    fn emit_approval_request(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
        context: crate::tools::permission::PermissionContext,
        execution_context: Option<&ToolApprovalExecutionContext>,
        args_hash: &str,
    ) {
        let run_id = execution_context.and_then(|ctx| ctx.run_id.as_deref());
        let parent_agent_id = execution_context
            .and_then(|ctx| ctx.parent_agent_id.as_deref());
        let execution_id = execution_context
            .and_then(|ctx| ctx.execution_id.as_deref());
        let batch_id = execution_context.and_then(|ctx| ctx.batch_id.as_deref());
        let tool_batch_id = execution_context
            .and_then(|ctx| ctx.tool_batch_id.as_deref());
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

    fn emit_approval_timeout(
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

pub fn approval_args_hash(args: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(args.to_string()))
}

fn output_hash(output: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(output.to_string()))
}

fn map_tool_operation(name: &str) -> PrivilegedOperation {
    let normalized = name.to_ascii_lowercase();
    if normalized.contains("command")
        || normalized.contains("terminal")
        || normalized.contains("shell")
        || normalized.contains("bash")
    {
        return PrivilegedOperation::ShellCommand;
    }
    if normalized.contains("write") || normalized.contains("edit") || normalized.contains("patch") {
        return PrivilegedOperation::FileWrite;
    }
    if normalized.contains("read")
        || normalized.contains("grep")
        || normalized.contains("list_document")
        || normalized.contains("vector_search")
    {
        return PrivilegedOperation::FileRead;
    }
    if normalized.contains("web")
        || normalized.contains("fetch")
        || normalized.contains("search")
        || normalized.contains("geocode")
        || normalized.contains("route")
        || normalized.contains("weather")
        || normalized.contains("earthquake")
    {
        return PrivilegedOperation::NetworkFetch;
    }
    PrivilegedOperation::McpToolCall
}

fn map_tool_risk(risk: crate::tools::permission::RiskLevel) -> SecurityRiskLevel {
    match risk {
        crate::tools::permission::RiskLevel::Low => SecurityRiskLevel::Low,
        crate::tools::permission::RiskLevel::Medium => SecurityRiskLevel::Medium,
        crate::tools::permission::RiskLevel::High => SecurityRiskLevel::High,
        crate::tools::permission::RiskLevel::Critical => SecurityRiskLevel::Critical,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::permission::{PermissionDefault, RiskLevel, ToolPermissions};
    use sqlx::SqlitePool;

    async fn service_with_audit(permissions: ToolPermissions) -> (ToolService, SqlitePool) {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::queries::init_audit_events(&pool).await.unwrap();

        let security = Arc::new(SecurityService::new());
        security.set_db_pool(pool.clone()).await;

        let mut registry = crate::tools::ToolRegistry::with_permissions(permissions);
        registry.register_known_tool("safe_tool", RiskLevel::Low);
        registry.register_known_tool("web_fetch", RiskLevel::High);

        let service = ToolService::new(
            Arc::new(tokio::sync::RwLock::new(registry)),
            security,
            Arc::new(Mutex::new(HashMap::new())),
        );

        (service, pool)
    }

    #[tokio::test]
    async fn check_permission_allows_low_risk_tool_and_records_audit() {
        let permissions = ToolPermissions {
            auto_approve_low_risk: true,
            ..ToolPermissions::default()
        };
        let (service, pool) = service_with_audit(permissions).await;

        let decision = service
            .check_permission(
                "unit-test",
                &ToolCall {
                    id: "call-1".to_string(),
                    name: "safe_tool".to_string(),
                    arguments: serde_json::json!({}),
                },
            )
            .await
            .unwrap();

        assert!(matches!(
            decision,
            crate::tools::permission::PermissionDecision::Allow
        ));

        let events = crate::db::queries::list_audit_events(&pool, 10)
            .await
            .unwrap();
        assert_eq!(events.len(), 2);
        assert!(
            events
                .iter()
                .any(|event| event.decision == "allow"
                    && event.target.as_deref() == Some("safe_tool"))
        );
    }

    #[tokio::test]
    async fn check_permission_denies_hardcoded_blocked_web_fetch_and_records_audit() {
        let permissions = ToolPermissions {
            global_default: PermissionDefault::AlwaysAllow,
            ..ToolPermissions::default()
        };
        let (service, pool) = service_with_audit(permissions).await;

        let decision = service
            .check_permission(
                "unit-test",
                &ToolCall {
                    id: "call-2".to_string(),
                    name: "web_fetch".to_string(),
                    arguments: serde_json::json!({
                        "url": "http://127.0.0.1:8989/secrets"
                    }),
                },
            )
            .await
            .unwrap();

        assert!(matches!(
            decision,
            crate::tools::permission::PermissionDecision::Deny { .. }
        ));

        let events = crate::db::queries::list_audit_events(&pool, 10)
            .await
            .unwrap();
        assert!(events
            .iter()
            .any(|event| event.decision == "deny" && event.target.as_deref() == Some("web_fetch")));
    }
}
