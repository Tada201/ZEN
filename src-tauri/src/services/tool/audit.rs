// Security evaluation, audit records, and the concurrency permit.
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
    pub(super) async fn audit(&self, decision: SecurityDecision, caller: &str, target: &str, reason: &str) {
        self.audit_operation(decision, map_tool_operation(target), caller, target, reason)
            .await;
    }

    pub(super) async fn audit_operation(
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

    pub(super) async fn audit_execution_result(&self, params: AuditResultParams<'_>) {
        let AuditResultParams {
            caller,
            resolved_name,
            tool_call_id,
            success,
            duration_ms,
            output,
            error,
        } = params;
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

    pub(super) async fn evaluate_security(
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

    pub(super) async fn security_risk_for_tool(&self, tool_name: &str) -> SecurityRiskLevel {
        let registry = self.registry.read().await;
        registry
            .get(tool_name)
            .map(|tool| tool.risk_level())
            .or_else(|| registry.known_tool_risk(tool_name))
            .map(map_tool_risk)
            .unwrap_or(SecurityRiskLevel::Critical)
    }

    pub(super) async fn acquire_execution_permit(
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
}
