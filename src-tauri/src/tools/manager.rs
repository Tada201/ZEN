use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::agent::tools::ToolRegistry as V1ToolRegistry;
use crate::tools::capability::{tool_aliases, tool_status};
use crate::tools::permission::{PermissionDefault, ToolPermissionRules, ToolPermissions};
use crate::tools::GlobalToolRegistry;

/// Short descriptor returned by tool_list
#[derive(Debug, Clone, Serialize)]
pub struct ToolDescriptor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub risk_level: Option<String>,
    pub status: String,
    pub status_detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub availability: Option<String>,
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

const TOOL_INFO_MAX_SCHEMA_BYTES: usize = 24_000;
const TOOL_INFO_MAX_DESCRIPTION_CHARS: usize = 1_200;
const TOOL_INFO_MAX_STRING_CHARS: usize = 2_000;
const TOOL_INFO_MAX_ARRAY_ITEMS: usize = 32;
const TOOL_INFO_MAX_OBJECT_KEYS: usize = 64;

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

        let rules = tool_overrides.entry(tool_id).or_default();

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
    pub status: String,
    pub status_detail: String,
    pub user_configurable: bool,
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
    ///
    /// Awaits the write locks so callers see a deterministic ordering and
    /// surface a failure when the policy cannot be installed — the previous
    /// `try_write` path silently dropped updates under contention.
    pub async fn update_permissions(
        &self,
        permissions: ToolPermissions,
    ) -> Result<(), String> {
        let mut p = self.permissions.write().await;
        *p = permissions.clone();
        let mut v2_guard = self.v2.write().await;
        v2_guard.update_permissions(permissions);
        Ok(())
    }

    /// Hydrate the canonical registry with schemas/descriptions from the legacy
    /// AgentTool registry. This is the compatibility bridge while execution is
    /// being migrated to v2: there is still one discovery/validation catalog,
    /// even when the concrete executor is still an AgentTool.
    pub async fn sync_legacy_tool_definitions(&self) {
        let mut legacy_tools: Vec<Arc<dyn crate::agent::tools::AgentTool>> = Vec::new();

        {
            let v1_guard = self.v1.read().await;
            if let Some(prog_arc) = v1_guard.progressive() {
                let prog = prog_arc.read().await;
                for meta in prog.get_metadata() {
                    if let Some(tool) = prog.get_or_load_tool(&meta.id) {
                        legacy_tools.push(tool);
                    }
                }
            }

            for tool in v1_guard.list() {
                if !legacy_tools
                    .iter()
                    .any(|existing| existing.id() == tool.id())
                {
                    legacy_tools.push(tool);
                }
            }
        }

        match self.v2.try_write() {
            Ok(mut v2_guard) => {
                for tool in legacy_tools {
                    v2_guard.register_legacy_tool(tool);
                }
            }
            Err(_) => eprintln!(
                "[ToolManager] Failed to acquire v2 registry write lock - legacy schema sync skipped"
            ),
        }
    }

    /// Build a ToolPermissions struct from flat key-value settings (e.g. from UI).
    /// Accepts both legacy dot-notation keys and the canonical snake_case keys
    /// produced by the frontend settingsMapper.  Dynamic `tools.permission.*`
    /// overrides can arrive in two forms:
    ///   1. Flat keys: `tools.permission.{id}.default` etc. (legacy dot-notation)
    ///   2. JSON payload: `tool_settings` key containing an object whose entries
    ///      are `"tools.permission.{id}.default"` etc. (current canonical shape)
    ///
    /// `workspace_root` is the authoritative workspace folder for Plan-Mode:
    /// when supplied, `plans_root = workspace_root.join("plans")` (after
    /// a re-canonicalization that tolerates failures) is threaded into the
    /// returned `ToolPermissions` so `PermissionDecision::from_input` can
    /// replace the legacy `/plans/` substring check with a real path-prefix
    /// check. When `None`, `plans_root` stays `None` and the substring
    /// fallback is used (preserves test compatibility).
    pub fn build_permissions(
        settings: &HashMap<String, String>,
        workspace_root: Option<PathBuf>,
    ) -> ToolPermissions {
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
            if let Ok(obj) = serde_json::from_str::<HashMap<String, serde_json::Value>>(json_str) {
                for (key, val_val) in &obj {
                    if key.starts_with("tools.permission.") {
                        let value = match val_val {
                            serde_json::Value::String(s) => s.clone(),
                            other => other.to_string().trim_matches('"').to_string(),
                        };
                        apply_permission_key(key, &value, &mut tool_overrides);
                    }
                }
            }
        }

        let permission_mode = settings
            .get("tool_permission_mode")
            .or_else(|| settings.get("tools.permission-mode"))
            .cloned()
            .unwrap_or_else(|| "ask".to_string());

        let plans_root = workspace_root.map(|ws| ws.canonicalize().unwrap_or(ws).join("plans"));

        ToolPermissions {
            global_default,
            tool_overrides,
            yolo_mode,
            auto_approve_low_risk,
            permission_mode,
            cache: Default::default(),
            plans_root,
        }
    }

    /// List all available tools with short descriptions, filtered by allowed IDs and permission settings.
    /// If allowed_ids is empty, all tools are returned (no agent-based filtering).
    /// Permission filtering is always applied: tools with `AlwaysDeny` default are excluded
    /// unless YOLO mode is enabled.
    pub async fn list_allowed(&self, allowed_ids: &[String]) -> Vec<ToolDescriptor> {
        self.list_allowed_matching(allowed_ids, None).await
    }

    /// List/search available tools. This includes progressive metadata, so lazy tools are
    /// discoverable before they are loaded. If `query` is supplied, results are ranked by
    /// id/name/category/tags/description match.
    pub async fn list_allowed_matching(
        &self,
        allowed_ids: &[String],
        query: Option<&str>,
    ) -> Vec<ToolDescriptor> {
        let allowed: HashSet<String> = allowed_ids.iter().cloned().collect();
        let executable_tool_names = {
            let v2_guard = self.v2.read().await;
            v2_guard.executable_tool_names()
        };
        let mut seen = HashSet::new();
        let mut descriptors = Vec::new();

        // V1 progressive metadata. This is the authoritative discovery source
        // for lazy tools; do not limit discovery to already loaded tools.
        {
            let v1_guard = self.v1.read().await;
            if let Some(prog_arc) = v1_guard.progressive() {
                let prog = prog_arc.read().await;
                for meta in prog.get_metadata() {
                    let id = meta.id.clone();
                    if executable_tool_names.contains(&id)
                        && (allowed.is_empty() || allowed.contains(&id))
                        && seen.insert(id.clone())
                    {
                        descriptors.push(ToolDescriptor {
                            risk_level: Some(id_to_risk_label(&id)),
                            status: tool_status(&id).status.to_string(),
                            status_detail: tool_status(&id).detail.to_string(),
                            id,
                            name: meta.name,
                            description: meta.description,
                            category: meta.category,
                            tags: meta.tags,
                            origin: None,
                            server_id: None,
                            server_name: None,
                            transport: None,
                            availability: None,
                        });
                    }
                }
            } else {
                for tool in v1_guard.list() {
                    let id = tool.id().to_string();
                    if executable_tool_names.contains(&id)
                        && (allowed.is_empty() || allowed.contains(&id))
                        && seen.insert(id.clone())
                    {
                        descriptors.push(ToolDescriptor {
                            name: id_to_display_name(&id),
                            risk_level: Some(id_to_risk_label(&id)),
                            status: tool_status(&id).status.to_string(),
                            status_detail: tool_status(&id).detail.to_string(),
                            id,
                            description: tool.description().to_string(),
                            category: "agent".to_string(),
                            tags: Vec::new(),
                            origin: None,
                            server_id: None,
                            server_name: None,
                            transport: None,
                            availability: None,
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
                if (allowed.is_empty() || allowed.contains(&info.name))
                    && seen.insert(info.name.clone())
                {
                    let id = info.name;
                    descriptors.push(ToolDescriptor {
                        name: id_to_display_name(&id),
                        risk_level: Some(id_to_risk_label(&id)),
                        status: tool_status(&id).status.to_string(),
                        status_detail: tool_status(&id).detail.to_string(),
                        id,
                        description: info.description,
                        category: "tool".to_string(),
                        tags: Vec::new(),
                        origin: None,
                        server_id: None,
                        server_name: None,
                        transport: None,
                        availability: None,
                    });
                }
            }
        }

        // External adapters carry the stable `ext:<server>:<tool>` identity.
        // Add bounded origin metadata without creating a second registry.
        for descriptor in &mut descriptors {
            if let Some((server_name, _tool_name)) = descriptor.id.strip_prefix("ext:").and_then(split_external_id) {
                descriptor.origin = Some("mcp".to_string());
                descriptor.server_id = Some(format!("mcp:{}", server_name));
                descriptor.server_name = Some(server_name.to_string());
                descriptor.transport = Some("unknown".to_string());
                descriptor.availability = Some("ready".to_string());
            }
        }

        // Filter by user-configured permissions: hide tools that are denied
        {
            let perms = self.permissions.read().await;
            descriptors.retain(|d| perms.is_visible_in_list(&d.id));
        }

        descriptors.retain(|d| tool_status(&d.id).agent_visible);

        if let Some(query) = query.map(str::trim).filter(|q| !q.is_empty()) {
            let terms: Vec<String> = query
                .to_lowercase()
                .split_whitespace()
                .map(ToOwned::to_owned)
                .collect();

            let mut scored: Vec<(ToolDescriptor, i32)> = descriptors
                .into_iter()
                .map(|d| {
                    let id = d.id.to_lowercase();
                    let name = d.name.to_lowercase();
                    let category = d.category.to_lowercase();
                    let description = d.description.to_lowercase();
                    let tags = d.tags.join(" ").to_lowercase();
                    let aliases = tool_aliases(&d.id).join(" ").to_lowercase();
                    let mut score = 0;
                    for term in &terms {
                        if id.contains(term) {
                            score += 30;
                        }
                        if name.contains(term) {
                            score += 25;
                        }
                        if category.contains(term) {
                            score += 20;
                        }
                        if tags.contains(term) {
                            score += 15;
                        }
                        if aliases.contains(term) {
                            score += 18;
                        }
                        if description.contains(term) {
                            score += 10;
                        }
                    }
                    (d, score)
                })
                .filter(|(_, score)| *score > 0)
                .collect();
            scored.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.id.cmp(&b.0.id)));
            descriptors = scored.into_iter().map(|(d, _)| d).take(16).collect();
        } else {
            descriptors.sort_by(|a, b| a.id.cmp(&b.id));
        }

        descriptors
    }

    /// List all tools with metadata suitable for the Tools settings tab.
    /// Combines info from both registries and attaches risk level + icon hints.
    pub async fn list_metadata(&self) -> Vec<ToolMetadata> {
        let mut seen = std::collections::HashSet::new();
        let mut tools = Vec::new();

        // V1 tools (progressive registry metadata source)
        {
            let v1_guard = self.v1.read().await;
            if let Some(prog_arc) = v1_guard.progressive() {
                let prog = prog_arc.read().await;
                for meta in prog.get_metadata() {
                    let id = meta.id.clone();
                    if seen.insert(id.clone()) {
                        tools.push(ToolMetadata {
                            id: id.clone(),
                            name: id_to_display_name(&id),
                            icon: id_to_icon(&id),
                            risk_level: id_to_risk_label(&id),
                            description: meta.description.clone(),
                            status: tool_status(&id).status.to_string(),
                            status_detail: tool_status(&id).detail.to_string(),
                            user_configurable: tool_status(&id).user_configurable,
                        });
                    }
                }
            } else {
                for tool in v1_guard.list() {
                    let id = tool.id().to_string();
                    if seen.insert(id.clone()) {
                        tools.push(ToolMetadata {
                            id: id.clone(),
                            name: id_to_display_name(&id),
                            icon: id_to_icon(&id),
                            risk_level: id_to_risk_label(&id),
                            description: tool.description().to_string(),
                            status: tool_status(&id).status.to_string(),
                            status_detail: tool_status(&id).detail.to_string(),
                            user_configurable: tool_status(&id).user_configurable,
                        });
                    }
                }
            }
        }

        // V2 tools (Tool trait registry — use definitions for risk_level)
        {
            let v2_guard = self.v2.read().await;
            let v2_defs = v2_guard.list_definitions();
            drop(v2_guard);
            for def in v2_defs {
                let risk = def
                    .risk_level
                    .as_ref()
                    .map(|r| format!("{:?}", r))
                    .unwrap_or_else(|| id_to_risk_label(&def.name));

                if seen.insert(def.name.clone()) {
                    tools.push(ToolMetadata {
                        id: def.name.clone(),
                        name: id_to_display_name(&def.name),
                        icon: id_to_icon(&def.name),
                        risk_level: risk,
                        description: def.description,
                        status: tool_status(&def.name).status.to_string(),
                        status_detail: tool_status(&def.name).detail.to_string(),
                        user_configurable: tool_status(&def.name).user_configurable,
                    });
                } else {
                    // Merge with v2 definitions for supplemental schema or risk data
                    if let Some(existing) = tools.iter_mut().find(|t| t.id == def.name) {
                        existing.risk_level = risk;
                        if !def.description.is_empty() {
                            existing.description = def.description;
                        }
                    }
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
        {
            let v1_guard = self.v1.read().await;
            if let Some(tool) = v1_guard.get(id) {
                return Some(ToolSchema {
                    id: id.to_string(),
                    description: cap_chars(tool.description(), TOOL_INFO_MAX_DESCRIPTION_CHARS),
                    schema: sanitize_tool_info_schema(tool.input_schema()),
                    risk_level: Some(id_to_risk_label(id)),
                    examples: Vec::new(),
                });
            }
        }

        // Try v2
        {
            let v2_guard = self.v2.read().await;
            let def = v2_guard
                .list_definitions()
                .into_iter()
                .find(|t| t.name == id);
            drop(v2_guard);
            if let Some(def) = def {
                let risk = def.risk_level.map(|r| format!("{:?}", r));
                return Some(ToolSchema {
                    id: id.to_string(),
                    description: cap_chars(&def.description, TOOL_INFO_MAX_DESCRIPTION_CHARS),
                    schema: sanitize_tool_info_schema(def.parameters),
                    risk_level: risk,
                    examples: Vec::new(),
                });
            }
        }

        None
    }

    /// Check if a tool exists in either registry
    pub async fn exists(&self, id: &str) -> bool {
        {
            let v1_guard = self.v1.read().await;
            if v1_guard.get(id).is_some() {
                return true;
            }
        }
        let v2_guard = self.v2.read().await;
        // Directly-executable tools live in `tools`; external MCP tools are
        // registered as definitions only (`known_tool_definitions`) and are
        // dispatched by name, so accept either.
        v2_guard.get(id).is_some() || v2_guard.has_known_definition(id)
    }

    /// Resolve a `tool_exec` call: extract the real tool ID and arguments,
    /// validate the tool exists, and return the resolved (name, args) pair.
    /// Returns None if the tool doesn't exist or args are malformed.
    pub async fn resolve_tool_exec(
        &self,
        args: &serde_json::Value,
    ) -> Option<(String, serde_json::Value)> {
        let tool_id = args.get("tool_id")?.as_str()?;
        if !self.exists(tool_id).await {
            return None;
        }
        let real_args = args
            .get("arguments")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        Some((tool_id.to_string(), real_args))
    }
}

fn cap_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut out: String = value.chars().take(max_chars).collect();
    out.push_str("...");
    out
}

fn sanitize_tool_info_schema(value: serde_json::Value) -> serde_json::Value {
    let sanitized = sanitize_schema_value(value, 0);
    let serialized_len = serde_json::to_string(&sanitized)
        .map(|s| s.len())
        .unwrap_or_default();
    if serialized_len <= TOOL_INFO_MAX_SCHEMA_BYTES {
        return sanitized;
    }
    serde_json::json!({
        "type": "object",
        "description": "Schema is too large to expose inline. Use tool_list for discovery and provide only documented arguments.",
        "truncated": true,
        "original_bytes": serialized_len
    })
}

fn sanitize_schema_value(value: serde_json::Value, depth: usize) -> serde_json::Value {
    if depth > 8 {
        return serde_json::json!({ "truncated": true, "reason": "max_depth" });
    }
    match value {
        serde_json::Value::String(s) => {
            serde_json::Value::String(cap_chars(&s, TOOL_INFO_MAX_STRING_CHARS))
        }
        serde_json::Value::Array(items) => {
            let truncated = items.len() > TOOL_INFO_MAX_ARRAY_ITEMS;
            let mut next: Vec<serde_json::Value> = items
                .into_iter()
                .take(TOOL_INFO_MAX_ARRAY_ITEMS)
                .map(|item| sanitize_schema_value(item, depth + 1))
                .collect();
            if truncated {
                next.push(serde_json::json!({ "truncated": true }));
            }
            serde_json::Value::Array(next)
        }
        serde_json::Value::Object(map) => {
            let truncated = map.len() > TOOL_INFO_MAX_OBJECT_KEYS;
            let mut next = serde_json::Map::new();
            for (key, item) in map.into_iter().take(TOOL_INFO_MAX_OBJECT_KEYS) {
                next.insert(key, sanitize_schema_value(item, depth + 1));
            }
            if truncated {
                next.insert("truncated".to_string(), serde_json::Value::Bool(true));
            }
            serde_json::Value::Object(next)
        }
        other => other,
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
            description: "List/search the allowed tools with short 1-line descriptions. Always use this first for unfamiliar, non-trivial, file, terminal, web, research, or agent tasks before choosing a tool.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional intent/search phrase such as 'web fetch', 'read documents', 'map route', or 'delegate task'. Use this to find specialized tools without loading every schema."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of tools to return. Defaults to 16 and is capped at 24.",
                        "minimum": 1,
                        "maximum": 24,
                        "default": 16
                    }
                },
                "required": [],
                "additionalProperties": false
            }),
        },
        crate::tools::ToolInfo {
            name: "tool_info".to_string(),
            description: "Read the full description, JSON schema, parameters, risk level, and examples for one tool. Call this after tool_list and before the first tool_exec for any non-trivial tool.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "tool_id": {
                        "type": "string",
                        "description": "The ID/name of the tool to get detailed information about, as returned by tool_list"
                    }
                },
                "required": ["tool_id"],
                "additionalProperties": false
            }),
        },
        crate::tools::ToolInfo {
            name: "tool_exec".to_string(),
            description: "Execute a tool by name with the provided arguments. Call this only after tool_list discovered the tool and tool_info described its schema; use only documented arguments.".to_string(),
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
                "required": ["tool_id", "arguments"],
                "additionalProperties": false
            }),
        },
    ]
}

// ── Display helpers for list_metadata ──────────────────────────────

fn split_external_id(value: &str) -> Option<(&str, &str)> {
    value.split_once(':').filter(|(server, tool)| !server.is_empty() && !tool.is_empty())
}

fn id_to_display_name(id: &str) -> String {
    match id {
        "run_command" | "terminal" => "Run Command".into(),
        "web_search" => "Web Search".into(),
        "web_fetch" => "Web Fetch".into(),
        "list_documents" => "List Documents".into(),
        "read_document_content" => "Read Document".into(),
        "grep_documents" => "Grep Documents".into(),
        "write_file" | "file_write" => "Write File".into(),
        "edit_file" => "Edit File".into(),
        "calculator" => "Calculator".into(),
        "get_system_metrics" | "system_metrics" => "System Metrics".into(),
        // Legacy map/geofence tools are intentionally absent from the catalog.
        "spawn_agent" => "Spawn Agent".into(),
        "write_todos" => "Task Checklist".into(),
        "draw" => "Drawing Canvas".into(),
        "generate_image" => "Image Generation".into(),
        "graph_session" => "Graph Session".into(),
        "tool_list" | "tool_info" | "tool_exec" | "tools_search" | "list_tools" => {
            String::new()
        } // meta-tools: hidden from UI
        _ => id.to_string(),
    }
}

fn id_to_icon(id: &str) -> String {
    match id {
        "run_command" | "terminal" => "lucide:terminal",
        "web_search" | "web_fetch" => "lucide:globe",
        "list_documents" | "read_document_content" => "lucide:file-text",
        "grep_documents" => "lucide:file-search",
        "write_file" | "edit_file" | "file_write" => "lucide:file-signature",
        "calculator" => "lucide:calculator",
        "get_system_metrics" | "system_metrics" => "lucide:cpu",
        "spawn_agent" => "lucide:bot",
        "write_todos" => "lucide:list-checks",
        "graph_session" => "lucide:database",
        "draw" => "lucide:pen",
        "generate_image" => "lucide:image",
        _ => "lucide:cpu",
    }
    .into()
}

fn id_to_risk_label(id: &str) -> String {
    format!("{:?}", crate::tools::default_tool_risk(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manager_for_tests() -> ToolManager {
        let progressive = Arc::new(RwLock::new(
            crate::agent::tools::progressive::ProgressiveToolRegistry::new(),
        ));
        let v1 = Arc::new(RwLock::new(
            crate::agent::tools::ToolRegistry::with_progressive(progressive),
        ));
        let v2 = Arc::new(RwLock::new(crate::tools::init_tool_registry(
            ToolPermissions::default(),
        )));
        ToolManager::new(v1, v2)
    }

    #[tokio::test]
    async fn tool_list_includes_lazy_progressive_metadata() {
        let manager = manager_for_tests();
        let tools = manager.list_allowed(&[]).await;

        assert!(tools.iter().any(|t| t.id == "run_command"));
        assert!(tools.iter().any(|t| t.id == "web_search"));
    }

    #[tokio::test]
    async fn tool_list_query_searches_metadata_fields() {
        let manager = manager_for_tests();
        let tools = manager
            .list_allowed_matching(&[], Some("terminal shell"))
            .await;

        assert_eq!(tools.first().map(|t| t.id.as_str()), Some("run_command"));
    }

    #[tokio::test]
    async fn tool_list_respects_authorized_ids() {
        let manager = manager_for_tests();
        let allowed = vec!["web_search".to_string()];
        let tools = manager.list_allowed(&allowed).await;

        assert!(tools.iter().any(|t| t.id == "web_search"));
        assert!(!tools.iter().any(|t| t.id == "run_command"));
    }

    #[tokio::test]
    async fn tool_list_exposes_only_canonical_spawn_tool() {
        let manager = manager_for_tests();
        let tools = manager.list_allowed(&[]).await;

        assert!(tools.iter().any(|t| t.id == "spawn_agent"));
        assert!(!tools.iter().any(|t| t.id == "handoff_to_agent"));
        assert!(!tools.iter().any(|t| t.id == "delegate_to_agent"));
    }

    #[tokio::test]
    async fn tool_list_hides_disabled_future_tools() {
        let manager = manager_for_tests();
        let tools = manager.list_allowed(&[]).await;

        assert!(tools.iter().any(|t| t.id == "draw"));
        assert!(!tools.iter().any(|t| t.id == "activate_2d_operational_map"));
        assert!(!tools.iter().any(|t| t.id == "activate_3d_globe"));
        assert!(!tools.iter().any(|t| t.id == "create_geofence"));
        assert!(!tools.iter().any(|t| t.id == "get_weather"));
        assert!(tools.iter().any(|t| t.id == "manage_board"));
    }

    #[tokio::test]
    async fn retired_tools_are_not_discoverable() {
        let manager = manager_for_tests();
        let tools = manager.list_allowed(&[]).await;

        for retired in [
            "vector_search",
            "guidance",
            "write_to_memory",
            "search_session_memory",
            "get_memory_stats",
            "calculate_route",
            "geocode_search",
            "reverse_geocode",
            "get_earthquakes",
            "get_military_aircraft",
        ] {
            assert!(
                !tools.iter().any(|tool| tool.id == retired),
                "retired tool '{}' must not be discoverable",
                retired
            );
        }

        assert!(tools.iter().any(|tool| tool.id == "list_documents"));
        assert!(tools.iter().any(|tool| tool.id == "read_document_content"));
        assert!(tools.iter().any(|tool| tool.id == "grep_documents"));
        assert!(!tools.iter().any(|tool| tool.id == "vector_search"));
    }

    #[tokio::test]
    async fn metadata_keeps_draw_available_for_audit() {
        let manager = manager_for_tests();
        let tools = manager.list_metadata().await;
        let draw = tools
            .iter()
            .find(|t| t.id == "draw")
            .expect("draw metadata should still be visible for audit");

        assert_eq!(draw.status, "partial");
        assert!(draw.user_configurable);
    }

    #[tokio::test]
    async fn generate_image_discoverable_by_art_aliases() {
        let manager = manager_for_tests();
        // The tool_aliases for generate_image include "draw", "paint", "artwork"
        for alias in &["draw", "paint", "artwork", "illustration", "flux"] {
            let tools = manager
                .list_allowed_matching(&["generate_image".to_string()], Some(alias))
                .await;
            assert!(
                tools.iter().any(|t| t.id == "generate_image"),
                "generate_image should be discoverable via alias '{}'",
                alias,
            );
        }
    }

    #[tokio::test]
    async fn generate_image_status_is_external() {
        use crate::tools::capability::tool_status;
        let info = tool_status("generate_image");
        assert_eq!(info.status, "external");
        assert!(info.agent_visible);
        assert!(info.user_configurable);
    }

    async fn register_ext_tool(manager: &ToolManager, server: &str, name: &str) -> String {
        let def = crate::tools::ToolDefinition {
            name: name.to_string(),
            description: format!("External {} tool", name),
            parameters: serde_json::json!({ "type": "object", "properties": {} }),
            risk_level: None,
            output_schema: None,
            annotations: None,
        };
        manager.v2.write().await.register_external(server, def);
        format!("ext:{}:{}", server, name)
    }

    #[tokio::test]
    async fn external_mcp_tool_is_discoverable_when_authorized() {
        let manager = manager_for_tests();
        let ext_id = register_ext_tool(&manager, "github", "create_issue").await;
        let allowed = vec![ext_id.clone()];

        let tools = manager.list_allowed_matching(&allowed, None).await;
        assert!(
            tools.iter().any(|t| t.id == ext_id),
            "external MCP tool should surface in tool_list for an agent authorized for it",
        );
    }

    #[tokio::test]
    async fn external_mcp_tool_resolves_for_exec() {
        let manager = manager_for_tests();
        let ext_id = register_ext_tool(&manager, "github", "create_issue").await;

        // tool_info must find the definition.
        assert!(
            manager.get_info(&ext_id).await.is_some(),
            "tool_info should return a schema for a registered external tool",
        );

        // tool_exec resolution must accept the external tool by name.
        let resolved = manager
            .resolve_tool_exec(&serde_json::json!({
                "tool_id": ext_id,
                "arguments": { "title": "hi" }
            }))
            .await;
        assert_eq!(resolved.map(|(id, _)| id), Some(ext_id));
    }
}
