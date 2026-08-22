pub mod calculator;
pub mod capability;
pub mod fs_tools;
pub mod image_tool;
pub mod manager;
pub mod operational_map;
pub mod patch_parser;
pub mod permission;
pub mod sys_metrics;
pub mod terminal_tools;
pub mod url_safety;
pub mod web_fetch;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

// `operational_map` remains source-only until the unified world-map feature is ready.
use self::permission::{PermissionDecision, RiskLevel, ToolPermissions};
use self::sys_metrics::SystemMetricsTool;
use self::terminal_tools::RunCommandTool;
use self::web_fetch::WebFetchTool;

// ========== TOOL OUTPUT / ERROR ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolError {
    PermissionDenied {
        reason: String,
    },
    InvalidArguments {
        details: String,
    },
    ExecutionFailed {
        message: String,
    },
    NotFound {
        name: String,
    },
    AwaitingConfirmation {
        context: permission::PermissionContext,
    },
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

/// MCP 2025-06-18 tool annotations. Hints only — clients use them for UI,
/// not for authorization decisions.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolAnnotations {
    /// Human-readable display name for the tool.
    #[serde(skip_serializing_if = "Option::is_none", rename = "title")]
    pub title: Option<String>,
    /// If true, the tool does not modify its environment.
    #[serde(skip_serializing_if = "Option::is_none", rename = "readOnlyHint")]
    pub read_only_hint: Option<bool>,
    /// If true, the tool may perform destructive updates (only meaningful when readOnlyHint is false).
    #[serde(skip_serializing_if = "Option::is_none", rename = "destructiveHint")]
    pub destructive_hint: Option<bool>,
    /// If true, calling with the same arguments yields the same observable result.
    #[serde(skip_serializing_if = "Option::is_none", rename = "idempotentHint")]
    pub idempotent_hint: Option<bool>,
    /// If true, the tool interacts with an open-world domain (web, filesystem).
    #[serde(skip_serializing_if = "Option::is_none", rename = "openWorldHint")]
    pub open_world_hint: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<RiskLevel>,
    /// JSON Schema describing the structured `structuredContent` returned by the tool.
    /// None means the tool returns only unstructured content blocks.
    #[serde(skip_serializing_if = "Option::is_none", rename = "outputSchema")]
    pub output_schema: Option<serde_json::Value>,
    /// Optional MCP tool annotations. Skipped when empty to keep payloads small.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<ToolAnnotations>,
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

    /// Optional JSON Schema describing the tool's structured return value.
    /// Defaults to None (unstructured content blocks only).
    fn output_schema(&self) -> Option<serde_json::Value> {
        None
    }

    /// Optional MCP tool annotations (readOnly/destructive/idempotent/open-world hints).
    /// Defaults to None — clients fall back to conservative behavior.
    fn annotations(&self) -> Option<ToolAnnotations> {
        None
    }

    /// Risk classification for permission decisions
    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    /// For downcasting to concrete types (e.g., AgentToolAdapter)
    fn as_any(&self) -> &dyn std::any::Any;

    /// Execute the tool
    async fn execute(
        &self,
        app: AppHandle,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError>;

    /// Execute with the stable agent call id available to mutation-aware tools.
    /// Most tools use the default implementation; workspace mutation tools can
    /// attach an exact, user-visible recovery checkpoint to this call.
    async fn execute_with_context(
        &self,
        app: AppHandle,
        chat_id: String,
        _tool_call_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        self.execute(app, chat_id, args).await
    }

    /// Convenience: build ToolInfo for LLM provider
    fn info(&self) -> ToolInfo {
        ToolInfo {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters: self.parameters_schema(),
        }
    }

    /// Build ToolDefinition with risk level metadata and MCP-spec fields.
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters: self.parameters_schema(),
            risk_level: Some(self.risk_level()),
            output_schema: self.output_schema(),
            annotations: self.annotations(),
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
    legacy_tools: HashMap<String, Arc<dyn crate::agent::tools::AgentTool>>,
    pub permissions: ToolPermissions,
    execution_history: Vec<ToolExecutionRecord>,
    /// Risk levels for tools that exist in the AgentTool registry but not here.
    /// Prevents unknown-tool fallback to RiskLevel::Critical.
    known_tool_risks: HashMap<String, RiskLevel>,
    /// Schema/description metadata for AgentTool-only tools. These tools still
    /// execute through the legacy AgentTool adapter, but discovery, permission,
    /// schema validation, and MCP listing can use the same canonical catalog.
    known_tool_definitions: HashMap<String, ToolDefinition>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            legacy_tools: HashMap::new(),
            permissions: ToolPermissions::default(),
            execution_history: Vec::new(),
            known_tool_risks: HashMap::new(),
            known_tool_definitions: HashMap::new(),
        }
    }

    pub fn with_permissions(permissions: ToolPermissions) -> Self {
        Self {
            tools: HashMap::new(),
            legacy_tools: HashMap::new(),
            permissions,
            execution_history: Vec::new(),
            known_tool_risks: HashMap::new(),
            known_tool_definitions: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Arc<dyn Tool>) {
        let name = tool.name().to_string();
        let risk_level = tool.risk_level();
        let def = tool.definition();
        self.tools.insert(name.clone(), tool);
        self.known_tool_risks.insert(name.clone(), risk_level);
        self.known_tool_definitions.insert(name.clone(), def);
    }

    /// Register a tool from an external MCP server. Uses a `{server}:{name}`
    /// prefix so the dispatcher can route calls back to the correct server.
    pub fn register_external(&mut self, server: &str, def: ToolDefinition) {
        let prefixed = format!("ext:{}:{}", server, def.name);
        self.known_tool_risks.insert(
            prefixed.clone(),
            def.risk_level.unwrap_or(RiskLevel::Medium),
        );
        self.known_tool_definitions.insert(prefixed.clone(), def);
    }

    pub fn register_legacy_tool(&mut self, tool: Arc<dyn crate::agent::tools::AgentTool>) {
        let name = tool.id().to_string();
        let risk = default_tool_risk(&name);
        self.register_known_tool_definition(
            &name,
            tool.description().to_string(),
            tool.input_schema(),
            risk,
        );
        self.legacy_tools.insert(name.clone(), tool);
    }

    /// Register a known tool name with its risk level.
    /// Used for tools that exist in the AgentTool registry but not in this v2 registry,
    /// so that permission checks use the correct risk level instead of falling back to Critical.
    pub fn register_known_tool(&mut self, name: &str, risk: RiskLevel) {
        self.known_tool_risks.insert(name.to_string(), risk);
    }

    pub fn register_known_tool_definition(
        &mut self,
        name: &str,
        description: String,
        parameters: serde_json::Value,
        risk: RiskLevel,
    ) {
        self.known_tool_risks.insert(name.to_string(), risk);
        self.known_tool_definitions.insert(
            name.to_string(),
            ToolDefinition {
                name: name.to_string(),
                description,
                parameters,
                risk_level: Some(risk),
                output_schema: None,
                annotations: None,
            },
        );
    }

    pub fn known_tool_risk(&self, name: &str) -> Option<RiskLevel> {
        self.known_tool_risks.get(name).copied()
    }

    pub fn executable_tool_names(&self) -> std::collections::HashSet<String> {
        self.tools
            .keys()
            .chain(self.known_tool_risks.keys())
            .cloned()
            .collect()
    }

    /// True if a definition is registered for `name` (external MCP tools and
    /// AgentTool-only compatibility definitions live here, not in `tools`).
    pub fn has_known_definition(&self, name: &str) -> bool {
        self.known_tool_definitions.contains_key(name)
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    pub fn get_legacy(&self, name: &str) -> Option<Arc<dyn crate::agent::tools::AgentTool>> {
        self.legacy_tools.get(name).cloned()
    }

    pub fn is_direct_tool(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    pub fn direct_tool_risk(&self, name: &str) -> Option<RiskLevel> {
        self.tools.get(name).map(|tool| tool.risk_level())
    }

    /// Remove every direct-tool registration whose `name` starts with
    /// `prefix`. Returns the number of tools actually removed. Used to
    /// wipe `ext:*` adapters before a fresh `sync_external_servers`
    /// so a re-sync can't leave stale entries behind when servers are
    /// removed from `.mcp.json`. Safe to call on an empty registry.
    pub fn remove_by_prefix(&mut self, prefix: &str) -> usize {
        let to_remove: Vec<String> = self
            .tools
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        let count = to_remove.len();
        for name in &to_remove {
            self.tools.remove(name);
            self.known_tool_risks.remove(name);
            self.known_tool_definitions.remove(name);
        }
        count
    }

    /// List tool definitions (for sending to LLM as available tools)
    pub fn list(&self) -> Vec<ToolInfo> {
        let mut infos: Vec<ToolInfo> = self.tools.values().map(|t| t.info()).collect();
        for def in self.known_tool_definitions.values() {
            if !self.tools.contains_key(&def.name) {
                infos.push(ToolInfo {
                    name: def.name.clone(),
                    description: def.description.clone(),
                    parameters: def.parameters.clone(),
                });
            }
        }
        infos.sort_by(|a, b| a.name.cmp(&b.name));
        infos
    }

    /// List with risk metadata
    pub fn list_definitions(&self) -> Vec<ToolDefinition> {
        let mut defs: Vec<ToolDefinition> = self.tools.values().map(|t| t.definition()).collect();
        for def in self.known_tool_definitions.values() {
            if !self.tools.contains_key(&def.name) {
                defs.push(def.clone());
            }
        }
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }

    /// List only tools that the v2 registry can execute directly.
    /// AgentTool-only compatibility definitions are excluded.
    pub fn list_direct_definitions(&self) -> Vec<ToolDefinition> {
        let mut defs: Vec<ToolDefinition> = self.tools.values().map(|t| t.definition()).collect();
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }

    /// Check permission for a tool call WITHOUT executing it.
    /// Returns the decision so the caller can handle Confirm via Tauri events.
    pub fn check_permission(
        &self,
        tool_call: &ToolCall,
        overrides: Option<&ToolPermissions>,
    ) -> Result<PermissionDecision, ToolError> {
        self.validate_arguments(tool_call)?;

        // Resolve the adapter here so the post-process below can read
        // its MCP `annotations()`; the layered decision logic in
        // `PermissionDecision::from_input` doesn't know about hints.
        let tool_opt = self.get(&tool_call.name);

        // If the tool exists in our local registry, use its specific risk level.
        // Then check known_tool_risks for AgentTool-only tools.
        // Otherwise, assume Critical risk for truly unknown tools.
        let risk_level = tool_opt
            .as_ref()
            .map(|tool| tool.risk_level())
            .or_else(|| self.known_tool_risks.get(&tool_call.name).copied())
            .unwrap_or(RiskLevel::Critical);

        let mut decision = PermissionDecision::from_input(
            &tool_call.name,
            &tool_call.arguments,
            risk_level,
            overrides.unwrap_or(&self.permissions),
        );

        // MCP destructive-annotation override. Per the 2025-06-18 spec,
        // `destructiveHint = true` is a server-supplied hint that the
        // tool "may perform destructive updates". We honour that hint
        // as a hard confirmation gate even if surrounding policy would
        // otherwise Allow (Yolo mode, global default Allow,
        // `always_allow` pattern). We ONLY rewrite an existing `Allow`:
        // hardcoded denies and explicit user denies stay in effect so
        // the post-process can't accidentally soften a Deny.
        if matches!(decision, PermissionDecision::Allow) {
            let is_destructive = tool_opt
                .as_ref()
                .and_then(|t| t.annotations())
                .and_then(|a| a.destructive_hint)
                .unwrap_or(false);
            if is_destructive {
                decision = PermissionDecision::Confirm {
                    context: permission::build_context(
                        &tool_call.name,
                        &tool_call.arguments,
                        risk_level,
                    ),
                };
            }
        }

        Ok(decision)
    }

    pub fn validate_arguments(&self, tool_call: &ToolCall) -> Result<(), ToolError> {
        let schema = self
            .get(&tool_call.name)
            .map(|tool| tool.parameters_schema())
            .or_else(|| {
                self.known_tool_definitions
                    .get(&tool_call.name)
                    .map(|def| def.parameters.clone())
            });

        let Some(schema) = schema else {
            return Ok(());
        };

        let validator =
            jsonschema::validator_for(&schema).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid schema for '{}': {}", tool_call.name, e),
            })?;

        if let Err(error) = validator.validate(&tool_call.arguments) {
            return Err(ToolError::InvalidArguments {
                details: format!(
                    "{} arguments do not match schema: {}",
                    tool_call.name, error
                ),
            });
        }

        Ok(())
    }

    /// Execute a tool call that has ALREADY been authorized.
    /// The caller is responsible for checking permissions first.
    pub async fn execute_authorized(
        &mut self,
        app: AppHandle,
        chat_id: String,
        tool_call: ToolCall,
    ) -> Result<ToolOutput, ToolError> {
        let tool = self
            .get(&tool_call.name)
            .ok_or_else(|| ToolError::NotFound {
                name: tool_call.name.clone(),
            })?;

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
            PermissionDecision::Allow => self.execute_authorized(app, chat_id, tool_call).await,
            PermissionDecision::Deny { reason } => {
                self.record_execution(&tool_call, false, "deny");
                Err(ToolError::PermissionDenied { reason })
            }
            PermissionDecision::Confirm { context } => {
                self.record_execution(&tool_call, false, "confirm_pending");
                // Emit event so frontend can show authorization modal
                let _ = app.emit(
                    "tool:authorization_request",
                    serde_json::json!({
                        "tool_call_id": tool_call.id,
                        "tool_name": tool_call.name,
                        "arguments": tool_call.arguments,
                        "context": context,
                    }),
                );
                Err(ToolError::AwaitingConfirmation { context })
            }
        }
    }

    pub(crate) fn record_execution(&mut self, call: &ToolCall, allowed: bool, decision: &str) {
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

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub type GlobalToolRegistry = Arc<RwLock<ToolRegistry>>;

pub fn default_tool_risk(id: &str) -> RiskLevel {
    match id {
        "run_command" | "terminal" => RiskLevel::Critical,
        "web_fetch" | "write_file" | "edit_file" | "apply_patch" | "spawn_agent"
        | "file_write" | "browser" => RiskLevel::High,
        "web_search" | "read_document_content" | "draw" | "generate_image" => {
            RiskLevel::Medium
        }
        _ => RiskLevel::Low,
    }
}

pub fn init_tool_registry(permissions: ToolPermissions) -> ToolRegistry {
    let mut registry = ToolRegistry::with_permissions(permissions);

    // Register built-in tools. The operational-map adapter is intentionally
    // disabled until the future unified world-map surface is ready.
    registry.register(Arc::new(self::calculator::CalculatorTool));
    registry.register(Arc::new(SystemMetricsTool));
    registry.register(Arc::new(WebFetchTool));
    registry.register(Arc::new(crate::search::WebSearchTool));
    // registry.register(Arc::new(ActivateOperationalMapTool)); // Disabled future feature.
    registry.register(Arc::new(RunCommandTool));
    registry.register(Arc::new(self::image_tool::ImageGenerationTool));

    // Future world-map work will replace the separate 2D/3D map tools with one
    // canonical tool. Do not expose either legacy map adapter in the meantime.

    // Register deterministic local-document tools. These read the uploaded file
    // at its recorded workspace path; semantic/vector search is intentionally
    // retired until it can provide a reliable, tested replacement.
    registry.register(Arc::new(fs_tools::ListDocumentsTool));
    registry.register(Arc::new(fs_tools::ReadDocumentTool));
    registry.register(Arc::new(fs_tools::GrepDocumentsTool));
    registry.register(Arc::new(fs_tools::WriteFileTool));
    registry.register(Arc::new(fs_tools::EditFileTool));
    registry.register(Arc::new(fs_tools::ApplyPatchTool));

    for tool_id in [
        "tools_search",
        "list_tools",
        "write_todos",
        "update_goal",
        "read_document_content",
        "run_command",
        "get_system_metrics",
        "draw",
        "list_documents",
        "list_directory",
        "search_files",
        "grep_documents",
        "write_file",
        "edit_file",
        "apply_patch",
        "graph_session",
        "spawn_agent",
        "generate_image",
    ] {
        registry.register_known_tool(tool_id, default_tool_risk(tool_id));
    }

    registry
}
