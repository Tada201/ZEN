use std::sync::Arc;
use tokio::sync::RwLock;
use serde::Serialize;
use std::collections::HashMap;

use crate::agent::tools::ToolRegistry as V1ToolRegistry;
use crate::tools::GlobalToolRegistry;
use crate::tools::permission::{ToolPermissions, PermissionDefault, ToolPermissionRules, RiskLevel};

/// Short descriptor returned by tool_list
#[derive(Debug, Clone, Serialize)]
pub struct ToolDescriptor {
    pub id: String,
    pub description: String,
}

/// Full detail returned by tool_info
#[derive(Debug, Clone, Serialize)]
pub struct ToolSchema {
    pub id: String,
    pub description: String,
    pub schema: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<String>,
    pub examples: Vec<String>,
}

/// Unified tool manager that wraps both v1 and v2 tool registries.
/// Provides listing, info, existence checks, and permission management.
/// The Runner still uses the v1 registry directly for execution; this
/// manager is the discovery layer (tool_list / tool_info meta-tools)
/// and the central authority for tool permissions.
pub struct ToolManager {
    v1: Arc<RwLock<V1ToolRegistry>>,
    v2: GlobalToolRegistry,
    pub permissions: RwLock<ToolPermissions>,
}

/// Apply a single `tools.permission.{id}.{field}` key-value pair into
/// the tool_overrides map.  Extracted as a helper so both the flat-key
/// path and the JSON `tool_settings` path share the same logic.
fn apply_permission_key(
    key: &str,
    value: &str,
    tool_overrides: &mut HashMap<String, ToolPermissionRules>,
) {
    let remainder = &key["tools.permission.".len()..];
    // remainder is like "terminal.default" or "terminal.allow-patterns"
    if let Some(dot_pos) = remainder.find('.') {
        let tool_id = remainder[..dot_pos].to_string();
        let field = &remainder[dot_pos + 1..];

        let rules = tool_overrides
            .entry(tool_id)
            .or_insert_with(ToolPermissionRules::default);

        match field {
            "default" => {
                let existing = std::mem::take(rules);
                *rules = ToolPermissionRules {
                    default: match value {
                        "allow" => Some(PermissionDefault::AlwaysAllow),
                        "deny" => Some(PermissionDefault::AlwaysDeny),
                        "confirm" => Some(PermissionDefault::Confirm),
                        _ => None, // "inherit" or unknown
                    },
                    always_allow: existing.always_allow,
                    always_deny: existing.always_deny,
                    always_confirm: existing.always_confirm,
                };
            }
            "allow-patterns" => {
                rules.always_allow = value
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(|l| l.trim().to_string())
                    .collect();
            }
            "deny-patterns" => {
                rules.always_deny = value
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(|l| l.trim().to_string())
                    .collect();
            }
            "confirm-patterns" => {
                rules.always_confirm = value
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(|l| l.trim().to_string())
                    .collect();
            }
            _ => {}
        }
    }
}

/// Canonical tool metadata exposed to the frontend for the Tools settings tab.
#[derive(Debug, Clone, Serialize)]
pub struct ToolMetadata {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub risk_level: String,
    pub description: String,
}

impl ToolManager {
    pub fn new(v1: Arc<RwLock<V1ToolRegistry>>, v2: GlobalToolRegistry) -> Self {
        Self {
            v1,
            v2,
            permissions: RwLock::new(ToolPermissions::default()),
        }
    }

    /// Update permissions from a ToolPermissions struct.
    /// Pushes the permissions to both the ToolManager (central authority)
    /// and the v2 ToolRegistry (used by the Runner for per-call checks).
    pub fn update_permissions(&self, permissions: ToolPermissions) {
        // Update our own copy
        match self.permissions.try_write() {
            Ok(mut p) => *p = permissions.clone(),
            Err(_) => eprintln!("[ToolManager] Failed to acquire permissions write lock — update skipped"),
        }
        // Push to v2 registry (used by Runner's per-call permission checks)
        match self.v2.try_write() {
            Ok(mut v2_guard) => v2_guard.update_permissions(permissions),
            Err(_) => eprintln!("[ToolManager] Failed to acquire v2 registry write lock — permission update skipped"),
        }
    }

    /// Build a ToolPermissions struct from flat key-value settings (e.g. from UI).
    /// Accepts both legacy dot-notation keys and the canonical snake_case keys
    /// produced by the frontend settingsMapper.  Dynamic `tools.permission.*`
    /// overrides can arrive in two forms:
    ///   1. Flat keys: `tools.permission.{id}.default` etc. (legacy dot-notation)
    ///   2. JSON payload: `tool_settings` key containing an object whose entries
    ///      are `"tools.permission.{id}.default"` etc. (current canonical shape)
    pub fn build_permissions(settings: &HashMap<String, String>) -> ToolPermissions {
        // ── Global defaults ──────────────────────────────────────────────
        let global_default = match settings
            .get("tool_global_default")
            .or_else(|| settings.get("tools.global-default"))
            .map(|s| s.as_str())
        {
            Some("always_allow") => PermissionDefault::AlwaysAllow,
            Some("always_deny") => PermissionDefault::AlwaysDeny,
            _ => PermissionDefault::Confirm,
        };

        let yolo_mode = settings
            .get("tool_yolo_mode")
            .or_else(|| settings.get("tools.yolo-mode"))
            .map(|s| s == "true")
            .unwrap_or(false);

        let auto_approve_low_risk = settings
            .get("tool_auto_approve_low_risk")
            .or_else(|| settings.get("tools.auto-approve-low-risk"))
            .map(|s| s == "true")
            .unwrap_or(false);

        // ── Per-tool overrides ───────────────────────────────────────────
        let mut tool_overrides: HashMap<String, ToolPermissionRules> = HashMap::new();

        // Path A: flat dot-notation keys (legacy + new dynamic keys stored flat)
        for (key, value) in settings {
            if key.starts_with("tools.permission.") {
                apply_permission_key(key, value, &mut tool_overrides);
            }
        }

        // Path B: JSON `tool_settings` payload (canonical frontend shape).
        // The frontend composes tool permission overrides into a single
        // `toolSettings` store field.  When persisted via settingsMapper
        // that field lands in SQLite under the key `tool_settings`.
        if let Some(json_str) = settings.get("tool_settings") {
            if let Ok(obj) = serde_json::from_str::<HashMap<String, String>>(json_str) {
                for (key, value) in &obj {
                    if key.starts_with("tools.permission.") {
                        apply_permission_key(key, value, &mut tool_overrides);
                    }
                }
            }
        }

        ToolPermissions {
            global_default,
            tool_overrides,
            yolo_mode,
            auto_approve_low_risk,
            cache: Default::default(),
        }
    }

    /// List all available tools with short descriptions, filtered by allowed IDs and permission settings.
    /// If allowed_ids is empty, all tools are returned (no agent-based filtering).
    /// Permission filtering is always applied: tools with `AlwaysDeny` default are excluded
    /// unless YOLO mode is enabled.
    pub async fn list_allowed(&self, allowed_ids: &[String]) -> Vec<ToolDescriptor> {
        let allowed: std::collections::HashSet<String> = allowed_ids.iter().cloned().collect();
        let mut seen = std::collections::HashSet::new();
        let mut descriptors = Vec::new();

        // V1 tools
        if let Ok(v1_guard) = self.v1.try_read() {
            for tool in v1_guard.list() {
                let id = tool.id().to_string();
                if allowed.is_empty() || allowed.contains(&id) {
                    if seen.insert(id.clone()) {
                        descriptors.push(ToolDescriptor {
                            id,
                            description: tool.description().to_string(),
                        });
                    }
                }
            }
        }

        // V2 tools
        {
            let v2_guard = self.v2.read().await;
            let v2_tools = v2_guard.list();
            // Drop lock immediately — we only needed it for the snapshot
            drop(v2_guard);
            for info in v2_tools {
                if allowed.is_empty() || allowed.contains(&info.name) {
                    if seen.insert(info.name.clone()) {
                        descriptors.push(ToolDescriptor {
                            id: info.name,
                            description: info.description,
                        });
                    }
                }
            }
        }

        // Filter by user-configured permissions: hide tools that are denied
        if let Ok(perms) = self.permissions.try_read() {
            descriptors.retain(|d| perms.is_visible_in_list(&d.id));
        }

        descriptors
    }

    /// List all tools with metadata suitable for the Tools settings tab.
    /// Combines info from both registries and attaches risk level + icon hints.
    pub async fn list_metadata(&self) -> Vec<ToolMetadata> {
        let mut seen = std::collections::HashSet::new();
        let mut tools = Vec::new();

        // V1 tools (progressive registry)
        if let Ok(v1_guard) = self.v1.try_read() {
            for tool in v1_guard.list() {
                let id = tool.id().to_string();
                if seen.insert(id.clone()) {
                    tools.push(ToolMetadata {
                        id: id.clone(),
                        name: id_to_display_name(&id),
                        icon: id_to_icon(&id),
                        risk_level: id_to_risk_label(&id),
                        description: tool.description().to_string(),
                    });
                }
            }
        }

        // V2 tools (Tool trait registry — use definitions for risk_level)
        {
            let v2_guard = self.v2.read().await;
            let v2_defs = v2_guard.list_definitions();
            drop(v2_guard);
            for def in v2_defs {
                if seen.insert(def.name.clone()) {
                    let risk = def.risk_level
                        .as_ref()
                        .map(|r| format!("{:?}", r))
                        .unwrap_or_else(|| id_to_risk_label(&def.name));
                    tools.push(ToolMetadata {
                        id: def.name.clone(),
                        name: id_to_display_name(&def.name),
                        icon: id_to_icon(&def.name),
                        risk_level: risk,
                        description: def.description,
                    });
                }
            }
        }

        tools.retain(|t| !id_to_display_name(&t.id).is_empty());
        tools.sort_by(|a, b| a.id.cmp(&b.id));
        tools
    }

    /// Get full schema and info for a specific tool (from whichever registry has it).
    pub async fn get_info(&self, id: &str) -> Option<ToolSchema> {
        // Try v1 first
        if let Ok(v1_guard) = self.v1.try_read() {
            if let Some(tool) = v1_guard.get(id) {
                return Some(ToolSchema {
                    id: id.to_string(),
                    description: tool.description().to_string(),
                    schema: tool.input_schema(),
                    risk_level: None,
                    examples: Vec::new(),
                });
            }
        }

        // Try v2
        {
            let v2_guard = self.v2.read().await;
            let def = v2_guard.list_definitions().into_iter()
                .find(|t| t.name == id);
            drop(v2_guard);
            if let Some(def) = def {
                let risk = def.risk_level.map(|r| format!("{:?}", r));
                return Some(ToolSchema {
                    id: id.to_string(),
                    description: def.description,
                    schema: def.parameters,
                    risk_level: risk,
                    examples: Vec::new(),
                });
            }
        }

        None
    }

    /// Check if a tool exists in either registry
    pub async fn exists(&self, id: &str) -> bool {
        if let Ok(v1_guard) = self.v1.try_read() {
            if v1_guard.get(id).is_some() {
                return true;
            }
        }
        let v2_guard = self.v2.read().await;
        v2_guard.get(id).is_some()
    }

    /// Resolve a `tool_exec` call: extract the real tool ID and arguments,
    /// validate the tool exists, and return the resolved (name, args) pair.
    /// Returns None if the tool doesn't exist or args are malformed.
    pub async fn resolve_tool_exec(&self, args: &serde_json::Value) -> Option<(String, serde_json::Value)> {
        let tool_id = args.get("tool_id")?.as_str()?;
        if !self.exists(tool_id).await {
            return None;
        }
        let real_args = args.get("arguments").cloned().unwrap_or(serde_json::json!({}));
        Some((tool_id.to_string(), real_args))
    }
}

// =====================================================================
// 3 Meta-Tool Definitions
// =====================================================================

/// Build the 3 meta-tool definitions that replace all individual tool schemas
/// in the LLM context. These are the ONLY tools injected into every turn.
pub fn meta_tool_definitions() -> Vec<crate::tools::ToolInfo> {
    vec![
        crate::tools::ToolInfo {
            name: "tool_list".to_string(),
            description: "List all available tools with short 1-line descriptions. Use this to discover what tools you have access to before deciding which to use.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        crate::tools::ToolInfo {
            name: "tool_info".to_string(),
            description: "Get the full JSON schema, usage description, and examples for a specific tool. Call this after tool_list to learn how to use a particular tool.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "tool_id": {
                        "type": "string",
                        "description": "The ID/name of the tool to get detailed information about, as returned by tool_list"
                    }
                },
                "required": ["tool_id"]
            }),
        },
        crate::tools::ToolInfo {
            name: "tool_exec".to_string(),
            description: "Execute a tool by name with the provided arguments. Call this after using tool_list to discover tools and tool_info to understand the required parameters.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "tool_id": {
                        "type": "string",
                        "description": "The ID/name of the tool to execute, as returned by tool_list"
                    },
                    "arguments": {
                        "type": "object",
                        "description": "A JSON object containing the arguments to pass to the tool, following the schema returned by tool_info for this tool"
                    }
                },
                "required": ["tool_id", "arguments"]
            }),
        },
    ]
}

// ── Display helpers for list_metadata ──────────────────────────────

fn id_to_display_name(id: &str) -> String {
    match id {
        "run_command" | "terminal" => "Run Command".into(),
        "web_search" => "Web Search".into(),
        "web_fetch" => "Web Fetch".into(),
        "vector_search" => "Vector Search".into(),
        "list_documents" => "List Documents".into(),
        "read_document_content" => "Read Document".into(),
        "grep_documents" => "Grep Documents".into(),
        "write_file" | "file_write" => "Write File".into(),
        "edit_file" => "Edit File".into(),
        "get_weather" => "Weather".into(),
        "get_earthquakes" => "Earthquakes".into(),
        "get_military_aircraft" => "Aircraft Radar".into(),
        "get_system_metrics" | "system_metrics" => "System Metrics".into(),
        "calculate_route" => "Routing".into(),
        "geocode_search" => "Geocode Search".into(),
        "reverse_geocode" => "Reverse Geocode".into(),
        "create_geofence" => "Geofence".into(),
        "activate_2d_operational_map" => "2D Operational Map".into(),
        "spawn_agent" => "Spawn Agent".into(),
        "delegate_to_agent" => "Delegate to Agent".into(),
        "write_to_memory" => "Write Memory".into(),
        "search_session_memory" => "Search Memory".into(),
        "get_memory_stats" => "Memory Stats".into(),
        "draw" => "Drawing Canvas".into(),
        "graph_session" => "Graph Session".into(),
        "tool_list" | "tool_info" | "tool_exec" | "tools_search"
        | "guidance" | "list_tools" => String::new(), // meta-tools: hidden from UI
        _ => id.to_string(),
    }
}

fn id_to_icon(id: &str) -> String {
    match id {
        "run_command" | "terminal" => "lucide:terminal",
        "web_search" | "web_fetch" => "lucide:globe",
        "vector_search" => "lucide:search",
        "list_documents" | "read_document_content" => "lucide:file-text",
        "grep_documents" => "lucide:file-search",
        "write_file" | "edit_file" | "file_write" => "lucide:file-signature",
        "get_weather" => "lucide:cloud",
        "get_earthquakes" => "lucide:activity",
        "get_military_aircraft" => "lucide:radar",
        "get_system_metrics" | "system_metrics" => "lucide:cpu",
        "calculate_route" => "lucide:route",
        "geocode_search" | "reverse_geocode" => "lucide:map-pin",
        "create_geofence" => "lucide:map-pin",
        "activate_2d_operational_map" => "lucide:map",
        "spawn_agent" => "lucide:bot",
        "delegate_to_agent" => "lucide:user-plus",
        "write_to_memory" | "search_session_memory" | "get_memory_stats"
        | "graph_session" => "lucide:database",
        "draw" => "lucide:pen",
        _ => "lucide:cpu",
    }.into()
}

fn id_to_risk_label(id: &str) -> String {
    match id {
        "run_command" | "terminal" => "Critical".into(),
        "web_fetch" | "write_file" | "edit_file" | "spawn_agent" | "delegate_to_agent" | "file_write" => "High".into(),
        "web_search" | "read_document_content" | "geocode_search" | "reverse_geocode" | "create_geofence" => "Medium".into(),
        _ => "Low".into(),
    }
}
