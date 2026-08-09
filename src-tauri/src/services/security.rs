use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Central policy entry point for privileged operations.
///
/// Phase 1 starts with this service as an explicit home for security decisions.
/// Existing call sites will be migrated incrementally so shell, file, network,
/// MCP, and secret access stop carrying separate ad hoc policies.
#[derive(Debug, Clone)]
pub struct SecurityService {
    default_decision: PermissionDecision,
    db_pool: Arc<RwLock<Option<sqlx::SqlitePool>>>,
}

impl SecurityService {
    pub fn new() -> Self {
        Self {
            default_decision: PermissionDecision::Ask,
            db_pool: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_db_pool(&self, pool: sqlx::SqlitePool) {
        let mut db = self.db_pool.write().await;
        *db = Some(pool);
    }

    pub fn default_decision(&self) -> PermissionDecision {
        self.default_decision
    }

    pub fn evaluate(&self, request: &PermissionRequest) -> PermissionDecision {
        match request.risk {
            RiskLevel::Low => PermissionDecision::Allow,
            RiskLevel::Medium | RiskLevel::High | RiskLevel::Critical => self.default_decision,
        }
    }

    pub async fn record_audit(&self, event: AuditEvent) {
        tracing::info!(
            operation = ?event.operation,
            decision = ?event.decision,
            caller = %event.caller,
            target = ?event.target,
            reason = ?event.reason,
            "Security audit event"
        );

        let db = self.db_pool.read().await;
        let Some(pool) = db.as_ref() else {
            tracing::debug!("Audit event skipped because database is not initialized");
            return;
        };

        let entry = crate::db::models::AuditLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            operation: event.operation.as_str().to_string(),
            decision: event.decision.as_str().to_string(),
            caller: event.caller,
            target: event.target,
            reason: event.reason,
        };

        if let Err(e) = crate::db::queries::add_audit_event(pool, &entry).await {
            tracing::warn!(error = %e, "Failed to persist security audit event");
        }
    }
}

impl SecurityService {
    /// Records that the user opened an interactive terminal session.
    /// This is the canonical audit event for interactive shells. The current
    /// workbench security posture treats opening a terminal tab as the user's
    /// explicit action: it automatically mints a short-lived approval token
    /// without showing a second consent dialog. `terminal_spawn` consumes that
    /// single-use token, and both operations remain session-scoped and audited.
    pub async fn grant_interactive_terminal_approval(
        &self,
        caller: impl Into<String>,
        target: Option<String>,
        reason: Option<String>,
    ) {
        self.record_audit(AuditEvent {
            operation: PrivilegedOperation::InteractiveTerminal,
            decision: PermissionDecision::Allow,
            caller: caller.into(),
            target,
            reason,
        })
        .await;
    }
}

impl Default for SecurityService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

impl PermissionDecision {
    pub fn as_str(self) -> &'static str {
        match self {
            PermissionDecision::Allow => "allow",
            PermissionDecision::Ask => "ask",
            PermissionDecision::Deny => "deny",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrivilegedOperation {
    ShellCommand,
    InteractiveTerminal,
    FileRead,
    FileWrite,
    NetworkFetch,
    McpToolCall,
    SecretRead,
    SecretWrite,
    UntrustedRender,
}

impl PrivilegedOperation {
    pub fn as_str(&self) -> &'static str {
        match self {
            PrivilegedOperation::ShellCommand => "shell_command",
            PrivilegedOperation::InteractiveTerminal => "interactive_terminal",
            PrivilegedOperation::FileRead => "file_read",
            PrivilegedOperation::FileWrite => "file_write",
            PrivilegedOperation::NetworkFetch => "network_fetch",
            PrivilegedOperation::McpToolCall => "mcp_tool_call",
            PrivilegedOperation::SecretRead => "secret_read",
            PrivilegedOperation::SecretWrite => "secret_write",
            PrivilegedOperation::UntrustedRender => "untrusted_render",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub operation: PrivilegedOperation,
    pub risk: RiskLevel,
    pub caller: String,
    pub target: Option<String>,
    pub workspace: Option<PathBuf>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub operation: PrivilegedOperation,
    pub decision: PermissionDecision,
    pub caller: String,
    pub target: Option<String>,
    pub reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    #[test]
    fn evaluate_allows_low_risk_and_asks_for_higher_risk_by_default() {
        let security = SecurityService::new();

        assert_eq!(
            security.evaluate(&PermissionRequest {
                operation: PrivilegedOperation::McpToolCall,
                risk: RiskLevel::Low,
                caller: "test".to_string(),
                target: Some("safe_tool".to_string()),
                workspace: None,
                reason: None,
            }),
            PermissionDecision::Allow
        );

        assert_eq!(
            security.evaluate(&PermissionRequest {
                operation: PrivilegedOperation::ShellCommand,
                risk: RiskLevel::Critical,
                caller: "test".to_string(),
                target: Some("terminal".to_string()),
                workspace: None,
                reason: None,
            }),
            PermissionDecision::Ask
        );
    }

    #[tokio::test]
    async fn record_audit_persists_event_when_database_is_configured() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::queries::init_audit_events(&pool).await.unwrap();

        let security = SecurityService::new();
        security.set_db_pool(pool.clone()).await;

        security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::McpToolCall,
                decision: PermissionDecision::Deny,
                caller: "unit-test".to_string(),
                target: Some("dangerous_tool".to_string()),
                reason: Some("denied by test".to_string()),
            })
            .await;

        let events = crate::db::queries::list_audit_events(&pool, 10)
            .await
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].operation, "mcp_tool_call");
        assert_eq!(events[0].decision, "deny");
        assert_eq!(events[0].caller, "unit-test");
        assert_eq!(events[0].target.as_deref(), Some("dangerous_tool"));
        assert_eq!(events[0].reason.as_deref(), Some("denied by test"));
    }
}
