use std::collections::HashMap;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::services::{
    AuditEvent, PermissionDecision as SecurityDecision, PermissionRequest,
    PrivilegedOperation, RiskLevel as SecurityRiskLevel, SecurityService,
};
use crate::tools::GlobalToolRegistry;
use zen_tools::registry::{ToolCall, ToolError};

mod agent_exec;
mod approval;
mod audit;
mod authorized;
mod entry;
mod mutations;
#[cfg(test)]
mod tests;

/// Parameters for recording a tool execution audit event.
pub struct AuditResultParams<'a> {
    pub caller: &'a str,
    pub resolved_name: &'a str,
    pub tool_call_id: &'a str,
    pub success: bool,
    pub duration_ms: u64,
    pub output: Option<&'a serde_json::Value>,
    pub error: Option<&'a str>,
}

/// Parameters for executing an agent tool call.
pub struct AgentToolParams {
    pub tool: Option<Arc<dyn zen_tools::AgentTool<tauri::AppHandle>>>,
    pub app: AppHandle,
    pub chat_id: String,
    pub tool_call: crate::agent::types::ToolCall,
    pub token: CancellationToken,
    pub depth: u32,
    pub allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
    pub delegation_allowed: bool,
}

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

// Moved to zen-agent in BIG_MIGRATION.md Phase 11; re-exports keep app
// call sites compiling (relocation doctrine §4.6).
pub use zen_agent::ports::{ToolApprovalExecutionContext, ToolApprovalOutcome};

struct MutationCapture {
    path: PathBuf,
    token: crate::services::checkpoint::MutationToken,
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
}

pub fn approval_args_hash(args: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(args.to_string()))
}

fn output_hash(output: &serde_json::Value) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(output.to_string()))
}

fn is_file_mutation_tool(name: &str) -> bool {
    matches!(name, "write_file" | "edit_file" | "file_write" | "apply_patch")
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

fn map_tool_risk(risk: zen_security::RiskLevel) -> SecurityRiskLevel {
    match risk {
        zen_security::RiskLevel::Low => SecurityRiskLevel::Low,
        zen_security::RiskLevel::Medium => SecurityRiskLevel::Medium,
        zen_security::RiskLevel::High => SecurityRiskLevel::High,
        zen_security::RiskLevel::Critical => SecurityRiskLevel::Critical,
    }
}
