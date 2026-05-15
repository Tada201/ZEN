use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use anyhow::{Result, anyhow};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};
use async_trait::async_trait;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

use crate::agent::tools::AgentTool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DetailLevel {
    Minimal,
    Standard,
    Full,
}

impl Default for DetailLevel {
    fn default() -> Self {
        DetailLevel::Minimal
    }
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
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
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
        self.tool_factory.insert("guidance".to_string(), Box::new(|| {
            Arc::new(GuidanceTool::new_standalone()) as Arc<dyn AgentTool>
        }));

        self.register_metadata(ToolMetadata::new(
            "web_search",
            "Web Search",
            "Search the web for current information, news, facts, or answers to questions. Use when you need up-to-date information or facts not in the knowledge base.",
            "search",
            vec!["search", "web", "internet", "online", "current", "recent"],
            DetailLevel::Minimal,
        ));
        self.tool_factory.insert("web_search".to_string(), Box::new(|| {
            Arc::new(crate::search::tool::WebSearchTool) as Arc<dyn AgentTool>
        }));

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
            "vector_search",
            "Knowledge Base Search",
            "Search the user's local knowledge base for documents and information. Use for private data, previously ingested documents, or personal files.",
            "search",
            vec!["rag", "knowledge", "documents", "vector", "embedding", "private"],
            DetailLevel::Standard,
        ));
        self.tool_factory.insert("vector_search".to_string(), Box::new(|| {
            Arc::new(VectorSearchStandalone::new_standalone()) as Arc<dyn AgentTool>
        }));

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
        self.tool_factory.insert("read_document_content".to_string(), Box::new(|| {
            Arc::new(crate::agent::tools::fs_tools::ReadDocumentTool) as Arc<dyn AgentTool>
        }));

        self.register_metadata(ToolMetadata::new(
            "list_directory",
            "List Directory",
            "List files and directories in a given path.",
            "file",
            vec!["file", "directory", "list", "filesystem", "disk"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "terminal_exec",
            "Terminal Execution",
            "Execute a command in the system terminal.",
            "system",
            vec!["terminal", "command", "shell", "exec", "bash"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "osint_flight",
            "Flight Tracking",
            "Track real-time flight information by flight number or route.",
            "osint",
            vec!["flight", "aircraft", "airport", "tracking", "adsb"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "osint_satellite",
            "Satellite Tracking",
            "Track satellite positions and passes over a location.",
            "osint",
            vec!["satellite", "space", "orbit", "tracking", "tle"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "osint_earthquake",
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
            "transfer_to_agent",
            "Transfer to Agent",
            "Transfer conversation control to another specialized agent.",
            "agent",
            vec!["agent", "transfer", "handoff", "delegate"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "session_memory",
            "Session Memory",
            "Store and retrieve information in session memory for context.",
            "memory",
            vec!["memory", "session", "store", "remember", "context"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "control_3d_globe",
            "3D Globe Control",
            "Control the 3D globe visualization - zoom, pan, fly to locations.",
            "visualization",
            vec!["globe", "3d", "earth", "visualization", "cesium"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "draw_on_canvas",
            "Draw on Canvas",
            "Draw shapes, lines, annotations on the operational canvas.",
            "visualization",
            vec!["draw", "canvas", "annotation", "shape", "operational"],
            DetailLevel::Full,
        ));

        self.register_metadata(ToolMetadata::new(
            "activate_space_view",
            "Space View",
            "Activate the space/stellar view with astronomical data.",
            "visualization",
            vec!["space", "stars", "astronomy", "stellar", "sky"],
            DetailLevel::Full,
        ));

        let mut guard = self.loaded_tools.lock().unwrap();
        // tools_search and list_tools will be loaded on-demand via get_or_load_tool when registry_arc is set
        guard.insert("guidance".to_string(), Arc::new(GuidanceTool::new_standalone()));
        guard.insert("web_search".to_string(), Arc::new(crate::search::tool::WebSearchTool));
        guard.insert("vector_search".to_string(), Arc::new(VectorSearchStandalone::new_standalone()));
    }

    /// Sets up the tools_search factory with a reference to the live registry.
    /// This must be called after the registry is wrapped in Arc<RwLock<>>.
    pub fn setup_tools_search(&mut self, registry_arc: Arc<RwLock<ProgressiveToolRegistry>>) {
        self.tool_factory.insert("tools_search".to_string(), Box::new(move || {
            Arc::new(ToolsSearchTool::new(Arc::clone(&registry_arc))) as Arc<dyn AgentTool>
        }));
    }

    /// Sets up the list_tools factory with a reference to the live registry.
    /// This must be called after the registry is wrapped in Arc<RwLock<>>.
    pub fn setup_list_tools(&mut self, registry_arc: Arc<RwLock<ProgressiveToolRegistry>>) {
        self.tool_factory.insert("list_tools".to_string(), Box::new(move || {
            Arc::new(ListToolsStandalone::new(Arc::clone(&registry_arc))) as Arc<dyn AgentTool>
        }));
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

        let mut scored: Vec<(ToolMetadata, f64)> = self.metadata
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

        scored.into_iter()
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
        self.loaded_tools.lock().ok()
            .map(|guard| guard.values().map(|t| {
                crate::tools::ToolInfo {
                    name: t.id().to_string(),
                    description: t.description().to_string(),
                    parameters: t.input_schema(),
                }
            }).collect())
            .unwrap_or_default()
    }

    pub fn loaded_tool_ids(&self) -> Vec<String> {
        self.loaded_tools.lock().ok()
            .map(|guard| guard.keys().cloned().collect())
            .unwrap_or_default()
    }
}

impl Default for ProgressiveToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

struct ToolsSearchTool {
    registry: Weak<RwLock<ProgressiveToolRegistry>>,
}

impl ToolsSearchTool {
    fn new(registry: Arc<RwLock<ProgressiveToolRegistry>>) -> Self {
        Self { registry: Arc::downgrade(&registry) }
    }
}

#[async_trait]
impl AgentTool for ToolsSearchTool {
    fn id(&self) -> &str {
        "tools_search"
    }

    fn description(&self) -> &str {
        "Search for available tools by name, category, or description. Use this to discover and select appropriate tools for a given task."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant tools (e.g., 'file operations', 'map navigation', 'system metrics')"
                }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("query is required"))?;

        let registry_arc = self.registry.upgrade()
            .ok_or_else(|| anyhow!("Registry has been dropped"))?;
        let results = {
            let registry_guard = registry_arc.read().await;
            registry_guard.search_tools(query)
        };

        if results.is_empty() {
            return Ok(json!({
                "message": "No tools found matching your query. Try different keywords or use 'list_tools' to see all available tools.",
                "results": []
            }));
        }

        let tool_summaries: Vec<Value> = results
            .into_iter()
            .map(|m| {
                json!({
                    "id": m.id,
                    "name": m.name,
                    "description": m.description,
                    "category": m.category,
                    "tags": m.tags,
                    "detailLevel": m.detail_level
                })
            })
            .collect();

        Ok(json!({
            "message": format!("Found {} matching tool(s). Use these tool IDs to call specific tools.", tool_summaries.len()),
            "results": tool_summaries
        }))
    }
}

struct GuidanceTool;

impl GuidanceTool {
    fn new_standalone() -> Self {
        Self
    }
}

#[async_trait]
impl AgentTool for GuidanceTool {
    fn id(&self) -> &str {
        "guidance"
    }

    fn description(&self) -> &str {
        "Provides step-by-step guidance for complex tasks. Use when user needs help understanding a process or learning something."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task or topic the user wants guidance on"
                },
                "context": {
                    "type": "string",
                    "description": "Additional context about what the user is trying to accomplish"
                }
            },
            "required": ["task"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let task = input["task"]
            .as_str()
            .ok_or_else(|| anyhow!("task is required"))?;

        let context = input["context"]
            .as_str()
            .unwrap_or("");

        let guidance = generate_guidance(task, context);

        Ok(json!({
            "task": task,
            "guidance": guidance
        }))
    }
}

fn generate_guidance(task: &str, context: &str) -> String {
    let task_lower = task.to_lowercase();

    if task_lower.contains("file") || task_lower.contains("read") || task_lower.contains("write") {
        return format!(
            "For file operations:\n\
             1. Use 'list_directory' to see what files exist in a path\n\
             2. Use 'read_file' to read file contents\n\
             3. Tools require exact file paths\n\nContext: {}",
            if context.is_empty() { "No additional context provided" } else { context }
        );
    }

    if task_lower.contains("map") || task_lower.contains("route") || task_lower.contains("navigation") {
        return format!(
            "For map and routing:\n\
             1. Use 'geocode_search' to convert place names to coordinates\n\
             2. Use 'calculate_route' to get driving directions\n\
             3. Routes include distance, duration, and turn-by-turn summary\n\nContext: {}",
            if context.is_empty() { "No additional context provided" } else { context }
        );
    }

    if task_lower.contains("search") || task_lower.contains("find") {
        return format!(
            "For searching:\n\
             1. Use 'web_search' for current information from the internet\n\
             2. Use 'vector_search' for your private knowledge base\n\
             3. Use 'tools_search' to find available tools\n\nContext: {}",
            if context.is_empty() { "No additional context provided" } else { context }
        );
    }

    if task_lower.contains("system") || task_lower.contains("metrics") || task_lower.contains("performance") {
        return format!(
            "For system monitoring:\n\
             1. Use 'get_system_metrics' for CPU, memory, and network stats\n\
             2. Metrics are retrieved in real-time\n\nContext: {}",
            if context.is_empty() { "No specific guidance available for this task" } else { context }
        );
    }

    format!(
        "Guidance for '{}':\n\
         Use 'tools_search' to discover relevant tools for your specific task.\n\
         Describe what you're trying to accomplish and I'll help identify the right tools.\n\nContext: {}",
        task,
        if context.is_empty() { "No additional context provided" } else { context }
    )
}

struct ListToolsStandalone {
    registry: Weak<RwLock<ProgressiveToolRegistry>>,
}

impl ListToolsStandalone {
    fn new(registry: Arc<RwLock<ProgressiveToolRegistry>>) -> Self {
        Self { registry: Arc::downgrade(&registry) }
    }
}

#[async_trait]
impl AgentTool for ListToolsStandalone {
    fn id(&self) -> &str {
        "list_tools"
    }

    fn description(&self) -> &str {
        "Lists all available tools with their descriptions. Use to see what tools are currently accessible."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional category filter (search, file, system, map, osint, agent, memory, visualization)"
                }
            },
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let registry_arc = self.registry.upgrade()
            .ok_or_else(|| anyhow!("Registry has been dropped"))?;
        let metadata = {
            let registry_guard = registry_arc.read().await;
            registry_guard.get_metadata()
        };

        let category_filter = input.get("category").and_then(|v| v.as_str());

        let filtered: Vec<Value> = metadata
            .into_iter()
            .filter(|m| {
                if let Some(cat) = category_filter {
                    m.category == cat
                } else {
                    true
                }
            })
            .map(|m| {
                json!({
                    "id": m.id,
                    "name": m.name,
                    "description": m.description,
                    "category": m.category,
                    "detailLevel": m.detail_level
                })
            })
            .collect();

        Ok(json!({
            "total_tools": filtered.len(),
            "tools": filtered
        }))
    }
}

struct VectorSearchStandalone;

impl VectorSearchStandalone {
    fn new_standalone() -> Self {
        Self
    }
}

#[async_trait]
impl AgentTool for VectorSearchStandalone {
    fn id(&self) -> &str {
        "vector_search"
    }

    fn description(&self) -> &str {
        "Performs a semantic vector search over all ingested documents in the local knowledge base. \
         Use this to find specific information or answer questions based on the user's private data."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "The semantic search query" },
                "limit": { "type": "integer", "description": "Number of results to return (default: 5, max: 20)" }
            },
            "required": ["query"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("query is required"))?;
        let limit = input
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .clamp(1, 20) as usize;

        let state = app.state::<crate::commands::AppState>();
        let db = state.db().await.map_err(|_| anyhow::anyhow!("DB Init error"))?;

        let model_name = crate::db::queries::get_setting(&db, "embedding_model")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "nomic-embed-text".to_string());

        let embedding_provider = crate::db::queries::get_setting(&db, "embedding_provider")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ollama".to_string());

        let base_url = if embedding_provider == "lmstudio" {
            crate::db::queries::get_setting(&db, "lmstudio_base_url")
                .await
                .unwrap_or_default()
                .unwrap_or_else(|| "http://localhost:1234".to_string())
        } else {
            crate::db::queries::get_setting(&db, "ollama_base_url")
                .await
                .unwrap_or_default()
                .unwrap_or_else(|| "http://localhost:11434".to_string())
        };

        let query_vec = generate_embedding(&base_url, &model_name, query)
            .await
            .map_err(|e| anyhow!("Embedding failed: {}", e))?;

        let rag_lock = state.rag.read().await;
        let rag = rag_lock.as_deref().ok_or_else(|| anyhow!("RAG not initialized"))?;
        let results = rag.search(query_vec, limit).await
            .map_err(|e| anyhow!("Vector search failed: {}", e))?;

        if results.is_empty() {
            return Ok(json!(format!("No relevant information found for query: '{}'", query)));
        }

        let mut formatted_text = format!("Found {} relevant excerpts:\n\n", results.len());
        for (i, res) in results.iter().enumerate() {
            formatted_text.push_str(&format!("Excerpt {} (Source: {}):\n{}\n\n",
                i + 1, res.chunk.source, res.chunk.text));
        }

        Ok(json!(formatted_text))
    }
}

async fn generate_embedding(base_url: &str, model: &str, text: &str) -> Result<Vec<f32>> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/embeddings", base_url);

    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "model": model,
            "prompt": text,
        }))
        .send()
        .await
        .map_err(|e| anyhow!("Failed to connect to embedding service at {}: {}", base_url, e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error = response.text().await.unwrap_or_default();
        anyhow::bail!("Embedding API error ({}): {}", status, error);
    }

    #[derive(serde::Deserialize)]
    struct EmbeddingResponse {
        embedding: Vec<f32>,
    }

    let result: EmbeddingResponse = response.json().await
        .map_err(|e| anyhow!("Failed to parse embedding response: {}", e))?;

    Ok(result.embedding)
}
