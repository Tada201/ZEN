pub mod permission;
pub mod sys_metrics;
pub mod web_fetch;
pub mod fs_tools;
pub mod operational_map;
pub mod manager;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::{AppHandle, Emitter};

use self::permission::{PermissionDecision, RiskLevel, ToolPermissions};
use self::sys_metrics::SystemMetricsTool;
use self::web_fetch::WebFetchTool;
use self::operational_map::ActivateOperationalMapTool;

// ========== TOOL OUTPUT / ERROR ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolError {
    PermissionDenied { reason: String },
    InvalidArguments { details: String },
    ExecutionFailed { message: String },
    NotFound { name: String },
    AwaitingConfirmation { context: permission::PermissionContext },
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolError::PermissionDenied { reason } => write!(f, "Permission denied: {}", reason),
            ToolError::InvalidArguments { details } => write!(f, "Invalid arguments: {}", details),
            ToolError::ExecutionFailed { message } => write!(f, "Execution failed: {}", message),
            ToolError::NotFound { name } => write!(f, "Tool not found: {}", name),
            ToolError::AwaitingConfirmation { .. } => write!(f, "Awaiting user confirmation"),
        }
    }
}

impl std::error::Error for ToolError {}

// ========== TOOL DEFINITION (sent to LLM) ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<RiskLevel>,
}

// ========== TOOL INFO (backward compat with LLM providers) ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

// ========== TOOL TRAIT v2 ==========

#[async_trait]
pub trait Tool: Send + Sync {
    /// Unique tool name (used in LLM tool_call resolution)
    fn name(&self) -> &str;

    /// Human-readable description (sent to LLM)
    fn description(&self) -> &str;

    /// JSON Schema for parameters (sent to LLM)
    fn parameters_schema(&self) -> serde_json::Value;

    /// Risk classification for permission decisions
    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    /// Execute the tool
    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError>;

    /// Convenience: build ToolInfo for LLM provider
    fn info(&self) -> ToolInfo {
        ToolInfo {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters: self.parameters_schema(),
        }
    }

    /// Build ToolDefinition with risk level metadata
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters: self.parameters_schema(),
            risk_level: Some(self.risk_level()),
        }
    }
}

// ========== TOOL CALL (from LLM) ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

// ========== TOOL EXECUTION RECORD ==========

#[derive(Debug, Clone, Serialize)]
pub struct ToolExecutionRecord {
    pub tool_name: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub allowed: bool,
    pub decision: String,
}

// ========== TOOL REGISTRY v2 ==========

pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool>>,
    pub permissions: ToolPermissions,
    execution_history: Vec<ToolExecutionRecord>,
    /// Risk levels for tools that exist in the AgentTool registry but not here.
    /// Prevents unknown-tool fallback to RiskLevel::Critical.
    known_tool_risks: HashMap<String, RiskLevel>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            permissions: ToolPermissions::default(),
            execution_history: Vec::new(),
            known_tool_risks: HashMap::new(),
        }
    }

    pub fn with_permissions(permissions: ToolPermissions) -> Self {
        Self {
            tools: HashMap::new(),
            permissions,
            execution_history: Vec::new(),
            known_tool_risks: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn Tool>) {
        let name = tool.name().to_string();
        self.tools.insert(name, tool);
    }

    /// Register a known tool name with its risk level.
    /// Used for tools that exist in the AgentTool registry but not in this v2 registry,
    /// so that permission checks use the correct risk level instead of falling back to Critical.
    pub fn register_known_tool(&mut self, name: &str, risk: RiskLevel) {
        self.known_tool_risks.insert(name.to_string(), risk);
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    /// List tool definitions (for sending to LLM as available tools)
    pub fn list(&self) -> Vec<ToolInfo> {
        self.tools.values().map(|t| t.info()).collect()
    }

    /// List with risk metadata
    pub fn list_definitions(&self) -> Vec<ToolDefinition> {
        self.tools.values().map(|t| t.definition()).collect()
    }

    /// Check permission for a tool call WITHOUT executing it.
    /// Returns the decision so the caller can handle Confirm via Tauri events.
    pub fn check_permission(&self, tool_call: &ToolCall, overrides: Option<&ToolPermissions>) -> Result<PermissionDecision, ToolError> {
        // If the tool exists in our local registry, use its specific risk level.
        // Then check known_tool_risks for AgentTool-only tools.
        // Otherwise, assume Critical risk for truly unknown tools.
        let risk_level = self.get(&tool_call.name)
            .map(|t| t.risk_level())
            .or_else(|| self.known_tool_risks.get(&tool_call.name).copied())
            .unwrap_or(RiskLevel::Critical);

        let decision = PermissionDecision::from_input(
            &tool_call.name,
            &tool_call.arguments,
            risk_level,
            overrides.unwrap_or(&self.permissions),
        );

        Ok(decision)
    }

    /// Execute a tool call that has ALREADY been authorized.
    /// The caller is responsible for checking permissions first.
    pub async fn execute_authorized(
        &mut self,
        app: AppHandle,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<ToolOutput, ToolError> {
        let tool = self.get(&tool_call.name)
            .ok_or_else(|| ToolError::NotFound { name: tool_call.name.clone() })?;

        self.record_execution(&tool_call, true, "allow");
        tool.execute(app, chat_id, tool_call.arguments).await
    }

    /// Full pipeline: check permission → execute if allowed.
    /// Returns AwaitingConfirmation if user prompt needed (caller handles via Tauri events).
    pub async fn execute_with_permission(
        &mut self,
        app: AppHandle,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<ToolOutput, ToolError> {
        let decision = self.check_permission(&tool_call, None)?;

        match decision {
            PermissionDecision::Allow => {
                self.execute_authorized(app, chat_id, tool_call).await
            }
            PermissionDecision::Deny { reason } => {
                self.record_execution(&tool_call, false, "deny");
                Err(ToolError::PermissionDenied { reason })
            }
            PermissionDecision::Confirm { context } => {
                self.record_execution(&tool_call, false, "confirm_pending");
                // Emit event so frontend can show authorization modal
                let _ = app.emit("tool:authorization_request", serde_json::json!({
                    "tool_call_id": tool_call.id,
                    "tool_name": tool_call.name,
                    "arguments": tool_call.arguments,
                    "context": context,
                }));
                Err(ToolError::AwaitingConfirmation { context })
            }
        }
    }

    fn record_execution(&mut self, call: &ToolCall, allowed: bool, decision: &str) {
        self.execution_history.push(ToolExecutionRecord {
            tool_name: call.name.clone(),
            timestamp: chrono::Utc::now(),
            allowed,
            decision: decision.to_string(),
        });
    }

    pub fn update_permissions(&mut self, permissions: ToolPermissions) {
        self.permissions = permissions;
    }
}

pub type GlobalToolRegistry = Arc<RwLock<ToolRegistry>>;

pub async fn init_tool_registry(permissions: ToolPermissions) -> ToolRegistry {
    let mut registry = ToolRegistry::with_permissions(permissions);
    
    // Register built-in tools
    registry.register(Arc::new(SystemMetricsTool));
    registry.register(Arc::new(WebFetchTool));
    registry.register(Arc::new(crate::search::WebSearchTool));
    registry.register(Arc::new(ActivateOperationalMapTool));
    
    // Register File System / RAG tools
    registry.register(Arc::new(fs_tools::VectorSearchTool));
    registry.register(Arc::new(fs_tools::ListDocumentsTool));
    registry.register(Arc::new(fs_tools::ReadDocumentTool));
    registry.register(Arc::new(fs_tools::GrepDocumentsTool));
    
    // In the future, this is where we'd also wire up MCP tools.
    registry
}
