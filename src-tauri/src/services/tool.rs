use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::services::{
    AuditEvent, PermissionDecision as SecurityDecision, PermissionRequest, PrivilegedOperation,
    RiskLevel as SecurityRiskLevel, SecurityService,
};
use crate::tools::{GlobalToolRegistry, ToolCall, ToolError};

pub struct ToolService {
    registry: GlobalToolRegistry,
    security: Arc<SecurityService>,
    pending_approvals: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
}

impl ToolService {
    pub fn new(
        registry: GlobalToolRegistry,
        security: Arc<SecurityService>,
        pending_approvals: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    ) -> Self {
        Self {
            registry,
            security,
            pending_approvals,
        }
    }

    pub async fn execute_interactive(
        &self,
        app: AppHandle,
        caller: &str,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<serde_json::Value, String> {
        let tool_risk = {
            let registry = self.registry.read().await;
            registry
                .get(&tool_call.name)
                .map(|tool| map_tool_risk(tool.risk_level()))
                .unwrap_or(SecurityRiskLevel::Critical)
        };

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
            let mut registry = self.registry.write().await;
            registry
                .execute_with_permission(app.clone(), chat_id.clone(), tool_call.clone())
                .await
        };

        match permission_result {
            Ok(output) => Ok(output.content),
            Err(ToolError::AwaitingConfirmation { context }) => {
                let approved = self
                    .request_interactive_approval(
                        app.clone(),
                        caller,
                        &chat_id,
                        &tool_call,
                        context,
                    )
                    .await;
                if approved {
                    let mut registry = self.registry.write().await;
                    match registry.execute_authorized(app, chat_id, tool_call).await {
                        Ok(output) => Ok(output.content),
                        Err(e) => Err(e.to_string()),
                    }
                } else {
                    Err("Tool execution denied by user".to_string())
                }
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
    ) -> bool {
        self.audit(
            SecurityDecision::Ask,
            caller,
            &tool_call.name,
            "user confirmation requested",
        )
        .await;

        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        {
            let mut approvals = self.pending_approvals.lock().await;
            approvals.insert(tool_call.id.clone(), tx);
        }

        self.emit_approval_request(&app, chat_id, tool_call, context);

        let approved = match tokio::time::timeout(tokio::time::Duration::from_secs(120), rx).await {
            Ok(Ok(approved)) => approved,
            Ok(Err(_)) => {
                let mut approvals = self.pending_approvals.lock().await;
                approvals.remove(&tool_call.id);
                false
            }
            Err(_) => {
                let mut approvals = self.pending_approvals.lock().await;
                approvals.remove(&tool_call.id);
                false
            }
        };

        if approved {
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
                "user denied or timed out tool execution",
            )
            .await;
        }

        approved
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
                let mut registry = self.registry.write().await;
                match registry.execute_authorized(app, chat_id, tool_call).await {
                    Ok(output) => Ok(output.content),
                    Err(e) => Err(e.to_string()),
                }
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
        if let Some(tool) = tool {
            let timeout_seconds = tool.timeout_seconds();
            let tool_run_future = tool.run(
                app.clone(),
                chat_id,
                tool_call.args.clone(),
                depth,
                allowed_tools,
                token.clone(),
            );

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

            match result_outcome {
                Ok(val) => crate::agent::types::ToolResult {
                    tool_call_id: tool_call.id,
                    content: val,
                    is_error: false,
                    duration_ms: 0,
                },
                Err(e) => crate::agent::types::ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::json!({
                        "error": e,
                        "tool": tool_call.name,
                        "hint": "This tool call failed or was interrupted. You may retry with different arguments or approach."
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

    async fn audit(&self, decision: SecurityDecision, caller: &str, target: &str, reason: &str) {
        self.security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::McpToolCall,
                decision,
                caller: caller.to_string(),
                target: Some(target.to_string()),
                reason: Some(reason.to_string()),
            })
            .await;
    }

    async fn evaluate_security(
        &self,
        caller: &str,
        tool_call: &ToolCall,
        reason: &str,
    ) -> SecurityDecision {
        let tool_risk = {
            let registry = self.registry.read().await;
            registry
                .get(&tool_call.name)
                .map(|tool| map_tool_risk(tool.risk_level()))
                .unwrap_or(SecurityRiskLevel::Critical)
        };

        let decision = self.security.evaluate(&PermissionRequest {
            operation: PrivilegedOperation::McpToolCall,
            risk: tool_risk,
            caller: caller.to_string(),
            target: Some(tool_call.name.clone()),
            workspace: None,
            reason: Some(reason.to_string()),
        });

        self.audit(decision, caller, &tool_call.name, reason).await;
        decision
    }

    fn emit_approval_request(
        &self,
        app: &AppHandle,
        chat_id: &str,
        tool_call: &ToolCall,
        context: crate::tools::permission::PermissionContext,
    ) {
        let _ = app.emit(
            "tool:authorization_request",
            serde_json::json!({
                "chat_id": chat_id,
                "tool_call_id": tool_call.id,
                "tool_name": tool_call.name,
                "arguments": tool_call.arguments,
                "model": "default",
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
                        "arguments": tool_call.arguments,
                        "chat_id": chat_id,
                        "context": context
                    }
                }
            }),
        );
    }
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
