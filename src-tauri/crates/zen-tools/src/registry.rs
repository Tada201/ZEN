//! Tool contracts and registries (from `src/tools/mod.rs` + the V1 registry
//! in `src/agent/tools/mod.rs`, Phase 5 Pre-task A).
//!
//! Both registries live here so the dual in-tree registry duplication ends:
//! `AgentToolRegistry` (the former "v1" agent-side registry) and
//! `ToolRegistry` (the former "v2" catalog/permission registry) share one
//! canonical trait surface. Everything is generic over the host handle `A`;
//! the app binds `A = tauri::AppHandle` via type aliases.
//!
//! The V2 registry's former `execute_authorized`/`execute_with_permission`
//! methods were deleted during the move: they had zero callers (execution
//! flows through ToolService's approval-gated path) and were the only
//! tauri-coupled members.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use zen_core::ToolInfo;
use zen_security::approval::{build_context, PermissionContext, PermissionDecision};
use zen_security::policy::ToolPermissions;
use zen_security::risk::RiskLevel;

use crate::agent_tool::AgentTool;

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
        context: PermissionContext,
    },
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolError::PermissionDenied { reason } => write!(f, "Permission denied: {reason}"),
            ToolError::InvalidArguments { details } => write!(f, "Invalid arguments: {details}"),
            ToolError::ExecutionFailed { message } => write!(f, "Execution failed: {message}"),
            ToolError::NotFound { name } => write!(f, "Tool not found: {name}"),
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

// ========== TOOL TRAIT v2 ==========

#[async_trait]
pub trait Tool<A: Send + Sync + 'static>: Send + Sync {
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
        app: A,
        chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError>;

    /// Execute with the stable agent call id available to mutation-aware tools.
    /// Most tools use the default implementation; workspace mutation tools can
    /// attach an exact, user-visible recovery checkpoint to this call.
    async fn execute_with_context(
        &self,
        app: A,
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

// ========== TOOL REGISTRY (canonical catalog + permission checks) ==========

pub struct ToolRegistry<A> {
    tools: HashMap<String, Arc<dyn Tool<A>>>,
    legacy_tools: HashMap<String, Arc<dyn AgentTool<A>>>,
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

impl<A: Send + Sync + 'static> ToolRegistry<A> {
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

    pub fn register(&mut self, tool: Arc<dyn Tool<A>>) {
        let name = tool.name().to_string();
        let risk_level = tool.risk_level();
        let def = tool.definition();
        self.tools.insert(name.clone(), tool);
        self.known_tool_risks.insert(name.clone(), risk_level);
        self.known_tool_definitions.insert(name, def);
    }

    /// Register a tool from an external MCP server. Uses a `{server}:{name}`
    /// prefix so the dispatcher can route calls back to the correct server.
    pub fn register_external(&mut self, server: &str, def: ToolDefinition) {
        let prefixed = format!("ext:{}:{}", server, def.name);
        self.known_tool_risks.insert(
            prefixed.clone(),
            def.risk_level.unwrap_or(RiskLevel::Medium),
        );
        self.known_tool_definitions.insert(prefixed, def);
    }

    pub fn register_legacy_tool(&mut self, tool: Arc<dyn AgentTool<A>>) {
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

    /// Register the fixed set of built-in tool ids every workspace knows about
    /// (meta-tools, agent tools, and document/file tools). Single source of
    /// truth for the startup known-tool sweep; the app's
    /// `init_tool_registry` calls this after registering its executors.
    pub fn register_builtin_known_tools(&mut self) {
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
            self.register_known_tool(tool_id, default_tool_risk(tool_id));
        }
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

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool<A>>> {
        self.tools.get(name).cloned()
    }

    pub fn get_legacy(&self, name: &str) -> Option<Arc<dyn AgentTool<A>>> {
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
                    context: build_context(&tool_call.name, &tool_call.arguments, risk_level),
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

    pub fn record_execution(&mut self, call: &ToolCall, allowed: bool, decision: &str) {
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

impl<A: Send + Sync + 'static> Default for ToolRegistry<A> {
    fn default() -> Self {
        Self::new()
    }
}

pub type GlobalToolRegistry<A> = std::sync::Arc<tokio::sync::RwLock<ToolRegistry<A>>>;

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

// ========== LAZY TOOL SOURCE PORT ==========

/// Discovery metadata for a lazily-loaded tool. The app's progressive
/// registry provides this for tools that are listed before they are built.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LazyToolMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
}

/// Port over the app's progressive (lazy) tool registry. Replaces the former
/// concrete coupling from the v1 `ToolRegistry` to
/// `agent::tools::progressive::ProgressiveToolRegistry`; the app binds it
/// with a non-blocking (`try_read`) wrapper over its tokio `RwLock`.
pub trait LazyToolSource<A: Send + Sync + 'static>: Send + Sync {
    fn metadata(&self) -> Vec<LazyToolMetadata>;
    fn get_or_load(&self, id: &str) -> Option<Arc<dyn AgentTool<A>>>;
    fn loaded_ids(&self) -> Vec<String>;
}

// ========== AGENT TOOL REGISTRY (execution-side, former v1) ==========

#[derive(Clone)]
pub struct AgentToolRegistry<A> {
    tools: HashMap<String, Arc<dyn AgentTool<A>>>,
    lazy: Option<Arc<dyn LazyToolSource<A>>>,
}

impl<A: Send + Sync + 'static> Default for AgentToolRegistry<A> {
    fn default() -> Self {
        Self::new()
    }
}

impl<A: Send + Sync + 'static> AgentToolRegistry<A> {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            lazy: None,
        }
    }

    /// Build a registry backed by a lazy tool source, pre-loading every tool
    /// the source reports as loaded (mirrors the former `with_progressive`).
    pub fn with_lazy_source(lazy: Arc<dyn LazyToolSource<A>>) -> Self {
        let mut tools = HashMap::new();
        for tool_id in lazy.loaded_ids() {
            if let Some(t) = lazy.get_or_load(&tool_id) {
                tools.insert(t.id().to_string(), t);
            }
        }
        Self {
            tools,
            lazy: Some(lazy),
        }
    }

    pub fn lazy_source(&self) -> Option<Arc<dyn LazyToolSource<A>>> {
        self.lazy.clone()
    }

    pub fn register(&mut self, tool: Arc<dyn AgentTool<A>>) {
        self.tools.insert(tool.id().to_string(), tool);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn AgentTool<A>>> {
        if let Some(tool) = self.tools.get(id) {
            return Some(tool.clone());
        }
        if let Some(lazy) = &self.lazy {
            if let Some(tool) = lazy.get_or_load(id) {
                return Some(tool);
            }
        }
        None
    }

    pub fn list(&self) -> Vec<Arc<dyn AgentTool<A>>> {
        let mut result: Vec<Arc<dyn AgentTool<A>>> = self.tools.values().cloned().collect();
        if let Some(lazy) = &self.lazy {
            for tool_id in lazy.loaded_ids() {
                if let Some(t) = lazy.get_or_load(&tool_id) {
                    if !result.iter().any(|existing| existing.id() == t.id()) {
                        result.push(t);
                    }
                }
            }
        }
        result
    }

    pub fn list_as_tool_info(&self) -> Vec<ToolInfo> {
        self.list()
            .into_iter()
            .map(|t| ToolInfo {
                name: t.id().to_string(),
                description: t.description().to_string(),
                parameters: t.input_schema(),
            })
            .collect()
    }
}
