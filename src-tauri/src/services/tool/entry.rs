// Public entry points: interactive, non-interactive, and permission-only.
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
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
                Err(format!("Permission denied: {reason}"))
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
                "Tool execution requires {security_decision:?}; caller is non-interactive"
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
                Err(format!("Permission denied: {reason}"))
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
            Err(e) => Err(format!("Security check failed: {e}")),
        }
    }
}
