mod discovery;
mod guidance;
mod vector_search;

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

use crate::agent::tools::AgentTool;

use discovery::{ListToolsStandalone, ToolsSearchTool};
use guidance::GuidanceTool;
use vector_search::VectorSearchStandalone;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum DetailLevel {
    #[default]
    Minimal,
    Standard,
    Full,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    #[serde(rename = "detailLevel")]
    pub detail_level: DetailLevel,
}

impl ToolMetadata {
    pub fn new(
        id: &str,
        name: &str,
        description: &str,
        category: &str,
        tags: Vec<&str>,
        detail_level: DetailLevel,
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            category: category.to_string(),
            tags: tags.iter().map(|s| s.to_string()).collect(),
            detail_level,
        }
    }
}

pub struct ProgressiveToolRegistry {
    metadata: HashMap<String, ToolMetadata>,
    loaded_tools: Arc<Mutex<HashMap<String, Arc<dyn AgentTool>>>>,
    tool_factory: HashMap<String, Box<dyn Fn() -> Arc<dyn AgentTool> + Send + Sync>>,
}

#[async_trait]
impl AgentTool for ProgressiveToolRegistry {
    fn id(&self) -> &str {
        "progressive_tool_registry"
    }

    fn description(&self) -> &str {
        "Manages progressive tool loading - only core tools loaded initially, additional tools loaded on-demand via tools_search"
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {},
            "strict": true
        })
    }

    async fn run(
        &self,
        _app: tauri::AppHandle,
        _chat_id: String,
        _input: serde_json::Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::json!({
            "loaded_tools": self.loaded_tool_ids(),
            "available_tools": self.metadata.keys().collect::<Vec<_>>(),
            "message": "Use tools_search to discover and load additional tools"
        }))
    }
}

impl ProgressiveToolRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            metadata: HashMap::new(),
            loaded_tools: Arc::new(Mutex::new(HashMap::new())),
            tool_factory: HashMap::new(),
        };
        registry.init_core_tools();
        registry
    }

    fn init_core_tools(&mut self) {
        self.register_metadata(ToolMetadata::new(
            "tools_search",
            "Tools Search",
            "Search for available tools by name, category, or description. Use this to discover and select appropriate tools for a given task.",
            "system",
            vec!["search", "discover", "find", "tools"],
            DetailLevel::Minimal,
        ));
        // tools_search factory will be set later via set_tools_search_factory()

        self.register_metadata(ToolMetadata::new(
            "guidance",
            "Guidance",
            "Provides step-by-step guidance for complex tasks. Use when user needs help understanding a process or learning something.",
            "system",
            vec!["help", "guide", "tutorial", "learn", "explain"],
            DetailLevel::Minimal,
        ));
        self.tool_factory.insert(
            "guidance".to_string(),
            Box::new(|| Arc::new(GuidanceTool::new_standalone()) as Arc<dyn AgentTool>),
        );

        self.register_metadata(ToolMetadata::new(
            "web_search",
            "Web Search",
            "Search the web for current information, news, facts, or answers to questions. Use when you need up-to-date information or facts not in the knowledge base.",
            "search",
            vec!["search", "web", "internet", "online", "current", "recent"],
            DetailLevel::Minimal,
        ));
        self.tool_factory.insert(
            "web_search".to_string(),
            Box::new(|| Arc::new(crate::search::tool::WebSearchTool) as Arc<dyn AgentTool>),
        );

        self.register_metadata(ToolMetadata::new(
            "web_fetch",
            "Web Fetch",
            "Fetch and retrieve the full content of a web page or URL. Use when you need to read the complete content of a specific web page.",
            "search",
            vec!["fetch", "web", "url", "page", "content", "download"],
            DetailLevel::Standard,
        ));
        self.tool_factory.insert(
            "web_fetch".to_string(),
            Box::new(|| Arc::new(crate::tools::web_fetch::WebFetchTool) as Arc<dyn AgentTool>),
        );

        self.register_metadata(ToolMetadata::new(
            "list_tools",
            "List Available Tools",
            "Lists all available tools with their descriptions. Use to see what tools are currently accessible.",
            "system",
            vec!["list", "tools", "available", "capabilities"],
            DetailLevel::Minimal,
        ));
        // list_tools factory will be set later via setup_list_tools()

        self.register_metadata(ToolMetadata::new(
            "write_todos",
            "Write Todos",
            "Write or update the visible task checklist for multi-step work. Use for tasks that require 3+ steps, and update it as work completes.",
            "system",
            vec!["todo", "task", "plan", "checklist", "progress"],
            DetailLevel::Minimal,
        ));
        self.tool_factory.insert(
            "write_todos".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::task_tools::WriteTodosTool) as Arc<dyn AgentTool>
            }),
        );

        self.register_metadata(ToolMetadata::new(
            "vector_search",
            "Knowledge Base Search",
            "Search the user's local knowledge base for documents and information. Use for private data, previously ingested documents, or personal files.",
            "search",
            vec!["rag", "knowledge", "documents", "vector", "embedding", "private"],
            DetailLevel::Standard,
        ));
        self.tool_factory.insert(
            "vector_search".to_string(),
            Box::new(|| Arc::new(VectorSearchStandalone::new_standalone()) as Arc<dyn AgentTool>),
        );

        self.register_metadata(ToolMetadata::new(
            "get_system_metrics",
            "System Metrics",
            "Retrieve real-time hardware performance metrics including CPU load, RAM usage, and network throughput.",
            "system",
            vec!["system", "metrics", "performance", "cpu", "memory", "hardware"],
            DetailLevel::Standard,
        ));

        self.register_metadata(ToolMetadata::new(
            "calculate_route",
            "Calculate Route",
            "Calculate a driving route between two locations with distance and duration.",
            "map",
            vec!["route", "navigation", "driving", "directions", "map"],
            DetailLevel::Standard,
        ));

        self.register_metadata(ToolMetadata::new(
            "geocode_search",
            "Geocode Search",
            "Search for a place name and get its latitude/longitude coordinates.",
            "map",
            vec!["geocode", "location", "coordinates", "place", "address"],
            DetailLevel::Standard,
        ));

        self.register_metadata(ToolMetadata::new(
            "read_document_content",
            "Read Document",
            "Read the contents of an ingested document from the knowledge base.",
            "file",
            vec!["file", "read", "document", "knowledge", "text"],
            DetailLevel::Full,
        ));
        self.tool_factory.insert(
            "read_document_content".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::fs_tools::ReadDocumentTool) as Arc<dyn AgentTool>
            }),
        );

        self.register_metadata(ToolMetadata::new(
            "list_documents",
            "List Documents",
            "List all documents currently ingested and available in local knowledge base",
            "file",
            vec!["file", "directory", "list", "filesystem", "disk"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "run_command",
            "Terminal Execution",
            "Execute a command in the system terminal.",
            "system",
            vec!["terminal", "command", "shell", "exec", "bash"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "get_military_aircraft",
            "Flight Tracking",
            "Track real-time flight information by flight number or route.",
            "osint",
            vec!["flight", "aircraft", "airport", "tracking", "adsb"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "get_earthquakes",
            "Earthquake Data",
            "Get recent earthquake data from USGS.",
            "osint",
            vec!["earthquake", "seismic", "usgs", "quake"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "spawn_agent",
            "Spawn Agent",
            "Spawn a specialized sub-agent for complex multi-step tasks.",
            "agent",
            vec!["agent", "spawn", "delegate", "subtask"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "handoff_to_agent",
            "Handoff to Agent",
            "Signal that the current conversation should be handed off to a specialized agent.",
            "agent",
            vec!["agent", "handoff", "transfer"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "write_to_memory",
            "Write to Memory",
            "Writes a finding, observation, or intermediate result to session-scoped vector memory.",
            "memory",
            vec!["memory", "write", "store", "save", "session"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "search_session_memory",
            "Search Session Memory",
            "Searches within the current session's vector memory for relevant findings.",
            "memory",
            vec!["memory", "search", "retrieve", "find", "session"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "get_memory_stats",
            "Get Memory Stats",
            "Returns statistics about the current session's vector memory, including entry count.",
            "memory",
            vec!["memory", "stats", "count", "info", "session"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "draw",
            "Draw on Canvas",
            "Draw shapes, lines, annotations on the operational canvas.",
            "visualization",
            vec!["draw", "canvas", "annotation", "shape", "operational"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "activate_3d_globe",
            "3D Globe Control",
            "Navigate the 3D globe visualization to a location or coordinate.",
            "visualization",
            vec!["globe", "3d", "earth", "map", "cesium"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "reverse_geocode",
            "Reverse Geocode",
            "Convert coordinates to address.",
            "map",
            vec!["geocode", "location", "address", "reverse"],
            DetailLevel::Standard,
        ));

        self.register_metadata(ToolMetadata::new(
            "get_weather",
            "Weather Info",
            "Get weather for a location.",
            "osint",
            vec!["weather", "forecast", "climate"],
            DetailLevel::Standard,
        ));

        self.register_metadata(ToolMetadata::new(
            "grep_documents",
            "Grep Documents",
            "Search for text within documents.",
            "file",
            vec!["file", "search", "grep", "text"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "write_file",
            "Write File",
            "Write content to a file.",
            "file",
            vec!["file", "write", "save", "create"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "edit_file",
            "Edit File",
            "Edit content of a file.",
            "file",
            vec!["file", "edit", "modify", "update"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "apply_patch",
            "Apply Patch",
            "Apply a structured patch with multiple file additions, deletions, or updates.",
            "file",
            vec!["file", "patch", "edit", "update", "diff", "search", "replace"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "create_geofence",
            "Create Geofence",
            "Create a geofence around a location.",
            "map",
            vec!["geofence", "map", "boundary", "area"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "graph_session",
            "Graph Session",
            "Manage graph sessions.",
            "visualization",
            vec!["graph", "session", "visualization"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "manage_board",
            "Manage Board",
            "Update the scratch-pad board in the voice/visual mode UI. Display notes, metrics, tables, charts, code, equations, or map placeholders. Use to show data visually instead of describing it in text.",
            "visualization",
            vec!["board", "display", "show", "visual", "ui", "panel"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "skill",
            "Skill",
            "List, load, or execute an explicitly selected skill using the canonical skill tool.",
            "system",
            vec!["skill", "instructions", "guidance", "load"],
            DetailLevel::Full,
        ));

        self.tool_factory.insert(
            "get_system_metrics".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::system_tools::SystemMetricsTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "calculate_route".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::routing_tools::RouteTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "geocode_search".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::routing_tools::GeocodeTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "reverse_geocode".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::routing_tools::ReverseGeocodeTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "run_command".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::terminal_tools::RunCommandTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "get_military_aircraft".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::osint_tools::MilitaryTrackingTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "get_weather".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::osint_tools::WeatherTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "get_earthquakes".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::osint_tools::EarthquakeTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "draw".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::drawing_tools::DrawTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "list_documents".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::fs_tools::ListDocumentsTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "grep_documents".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::fs_tools::GrepDocumentsTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "write_file".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::fs_tools::WriteFileTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "edit_file".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::fs_tools::EditFileTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "apply_patch".to_string(),
            Box::new(|| {
                Arc::new(crate::tools::fs_tools::ApplyPatchTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "create_geofence".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::geofence_tools::CreateGeofenceTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "activate_3d_globe".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::map_tools::MapTool::new()) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "graph_session".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::graph_session::GraphSessionTool) as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "write_to_memory".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::session_memory_tools::WriteToMemoryTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "search_session_memory".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::session_memory_tools::SearchSessionMemoryTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "get_memory_stats".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::session_memory_tools::GetMemoryStatsTool)
                    as Arc<dyn AgentTool>
            }),
        );
        self.tool_factory.insert(
            "handoff_to_agent".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::handoff_tools::HandoffTool) as Arc<dyn AgentTool>
            }),
        );

        let mut guard = self.loaded_tools.lock().unwrap();
        // tools_search and list_tools will be loaded on-demand via get_or_load_tool when registry_arc is set
        guard.insert(
            "guidance".to_string(),
            Arc::new(GuidanceTool::new_standalone()),
        );
        guard.insert(
            "web_search".to_string(),
            Arc::new(crate::search::tool::WebSearchTool),
        );
        guard.insert(
            "web_fetch".to_string(),
            Arc::new(crate::tools::web_fetch::WebFetchTool),
        );
        guard.insert(
            "vector_search".to_string(),
            Arc::new(VectorSearchStandalone::new_standalone()),
        );
    }

    /// Sets up the tools_search factory with a reference to the live registry.
    /// This must be called after the registry is wrapped in Arc<RwLock<>>.
    pub fn setup_tools_search(&mut self, registry_arc: Arc<RwLock<ProgressiveToolRegistry>>) {
        self.tool_factory.insert(
            "tools_search".to_string(),
            Box::new(move || {
                Arc::new(ToolsSearchTool::new(Arc::clone(&registry_arc))) as Arc<dyn AgentTool>
            }),
        );
    }

    /// Sets up the list_tools factory with a reference to the live registry.
    /// This must be called after the registry is wrapped in Arc<RwLock<>>.
    pub fn setup_list_tools(&mut self, registry_arc: Arc<RwLock<ProgressiveToolRegistry>>) {
        self.tool_factory.insert(
            "list_tools".to_string(),
            Box::new(move || {
                Arc::new(ListToolsStandalone::new(Arc::clone(&registry_arc))) as Arc<dyn AgentTool>
            }),
        );
    }

    pub fn setup_agent_tools(
        &mut self,
        tool_registry: Arc<tokio::sync::RwLock<crate::agent::tools::ToolRegistry>>,
        agent_registry: Arc<crate::agent::types::AgentRegistry>,
        hook_registry: Arc<crate::agent::hooks::HookRegistry>,
        permissions: crate::tools::GlobalToolRegistry,
        skills_manager: Arc<crate::agent::skills::SkillsManager>,
    ) {
        // Board management — lightweight UI scratch pad
        self.tool_factory.insert(
            "manage_board".to_string(),
            Box::new(|| {
                Arc::new(crate::agent::tools::manage_board::ManageBoardTool::new())
                    as Arc<dyn AgentTool>
            }),
        );

        let tr = tool_registry.clone();
        let ar = agent_registry.clone();
        let hr = hook_registry.clone();
        let p = permissions.clone();
        self.tool_factory.insert(
            "spawn_agent".to_string(),
            Box::new(move || {
                Arc::new(crate::agent::tools::spawn_tools::SpawnAgentTool::new(
                    tr.clone(),
                    ar.clone(),
                    hr.clone(),
                    p.clone(),
                )) as Arc<dyn AgentTool>
            }),
        );

        let sm = skills_manager.clone();
        self.tool_factory.insert(
            "skill".to_string(),
            Box::new(move || {
                Arc::new(crate::agent::tools::skill_tool::SkillTool::new(sm.clone()))
                    as Arc<dyn AgentTool>
            }),
        );
    }

    fn register_metadata(&mut self, metadata: ToolMetadata) {
        self.metadata.insert(metadata.id.clone(), metadata);
    }

    pub fn get_metadata(&self) -> Vec<ToolMetadata> {
        self.metadata.values().cloned().collect()
    }

    pub fn get_tool(&self, id: &str) -> Option<Arc<dyn AgentTool>> {
        self.loaded_tools.lock().ok()?.get(id).cloned()
    }

    pub fn get_or_load_tool(&self, id: &str) -> Option<Arc<dyn AgentTool>> {
        let mut guard = self.loaded_tools.lock().ok()?;

        if let Some(tool) = guard.get(id) {
            return Some(tool.clone());
        }

        if let Some(factory) = self.tool_factory.get(id) {
            let tool = factory();
            guard.insert(id.to_string(), tool.clone());
            return Some(tool);
        }

        None
    }

    pub fn search_tools(&self, query: &str) -> Vec<ToolMetadata> {
        let query_lower = query.to_lowercase();
        let query_terms: Vec<&str> = query_lower.split_whitespace().collect();

        let mut scored: Vec<(ToolMetadata, f64)> = self
            .metadata
            .values()
            .cloned()
            .map(|metadata| {
                let mut score = 0.0;

                for term in &query_terms {
                    if metadata.id.contains(term) {
                        score += 3.0;
                    }
                    if metadata.name.to_lowercase().contains(term) {
                        score += 2.5;
                    }
                    if metadata.category == *term {
                        score += 2.0;
                    }
                    if metadata.tags.iter().any(|t| t.contains(term)) {
                        score += 1.5;
                    }
                    if metadata.description.to_lowercase().contains(term) {
                        score += 1.0;
                    }
                }

                (metadata, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        scored
            .into_iter()
            .filter(|(_, score)| *score > 0.0)
            .map(|(metadata, _)| metadata)
            .collect()
    }

    pub fn preload_tools(&self, ids: &[&str]) {
        let mut guard = if let Ok(guard) = self.loaded_tools.lock() {
            guard
        } else {
            return;
        };

        for id in ids {
            if !guard.contains_key(*id) {
                if let Some(factory) = self.tool_factory.get(*id) {
                    let tool = factory();
                    guard.insert(id.to_string(), tool);
                }
            }
        }
    }

    pub fn list_as_tool_info(&self) -> Vec<crate::tools::ToolInfo> {
        self.loaded_tools
            .lock()
            .ok()
            .map(|guard| {
                guard
                    .values()
                    .map(|t| crate::tools::ToolInfo {
                        name: t.id().to_string(),
                        description: t.description().to_string(),
                        parameters: t.input_schema(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn loaded_tool_ids(&self) -> Vec<String> {
        self.loaded_tools
            .lock()
            .ok()
            .map(|guard| guard.keys().cloned().collect())
            .unwrap_or_default()
    }
}

impl Default for ProgressiveToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
