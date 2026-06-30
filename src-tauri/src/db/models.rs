use serde::{Deserialize, Serialize};

// ─── Chat ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pinned: Option<i32>,
    pub is_archived: Option<i32>,
    pub archived_at: Option<String>,
    pub message_count: Option<i32>,
    pub total_tokens_in: Option<i32>,
    pub total_tokens_out: Option<i32>,
    pub last_activity: Option<String>,
    pub folder_id: Option<String>,
}

// ─── Chat Folder ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatFolder {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub parent_folder_id: Option<String>,
    pub sort_order: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub timestamp: String,
    pub operation: String,
    pub decision: String,
    pub caller: String,
    pub target: Option<String>,
    pub reason: Option<String>,
}

// ─── Search Result ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub chat_id: String,
    pub chat_title: String,
    pub message_id: String,
    pub message_content: String,
    pub role: String,
    pub rank: f64,
    pub timestamp: String,
}

// ─── Chat Template ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatTemplate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub default_model: Option<String>,
    pub folder_id: Option<String>,
    pub is_global: Option<i32>,
    pub initial_messages_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Message ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub model: Option<String>,
    pub is_complete: Option<i32>,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub images: Option<String>,
    pub attachments: Option<String>,
    pub kind: Option<String>,
    pub metadata: Option<String>,
    pub is_compacted: Option<i32>,
    pub reasoning_details: Option<String>,
    pub created_at: String,
}

// ─── Artifact ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub chat_id: String,
    pub message_id: String,
    #[serde(rename = "type")]
    pub artifact_type: String,
    pub title: String,
    pub content: String,
    pub language: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Document ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub filename: String,
    pub mime_type: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub doc_type: Option<String>,
    pub status: String,
    pub error_msg: Option<String>,
    pub workspace: String,
    pub embedding_model: Option<String>,
    pub created_at: String,
}

// ─── Settings ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

// ─── Chat Tag ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatTag {
    pub id: String,
    pub chat_id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

// ─── Telemetry Snapshot ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySnapshot {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub timestamp: i64,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub metadata: Option<String>,
}

// ─── Graph Session ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GraphSessionDb {
    pub id: String,
    pub chat_id: String,
    pub name: String,
    pub expressions: String, // JSON
    pub variables: String,   // JSON
    pub viewport_x_min: f64,
    pub viewport_x_max: f64,
    pub viewport_y_min: f64,
    pub viewport_y_max: f64,
    pub current_version: i64,
    pub history: String, // JSON
    pub created_at: String,
    pub updated_at: String,
}

// ─── Drawing Canvas ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DrawingCanvasDb {
    pub id: String,
    pub chat_id: String,
    pub name: String,
    pub objects: String, // JSON
    pub background: String,
    pub created_at: String,
    pub updated_at: String,
}

// ─── GTSM Geofence ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GtsmGeofence {
    pub id: String,
    pub name: String,
    pub geofence_type: String,
    pub center_lat: Option<f64>,
    pub center_lon: Option<f64>,
    pub radius_km: Option<f64>,
    pub polygon_coords: Option<String>, // JSON
    pub box_north: Option<f64>,
    pub box_south: Option<f64>,
    pub box_east: Option<f64>,
    pub box_west: Option<f64>,
    pub alert_enabled: i32,
    pub created_at: String,
    pub updated_at: String,
}

// ─── GTSM Marker ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GtsmMarker {
    pub id: String,
    pub name: String,
    pub marker_type: String,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub color: String,
    pub icon: String,
    pub metadata: Option<String>, // JSON
    pub created_at: String,
}

// ─── GTSM GeoJSON Layer ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GtsmGeojsonLayer {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub visible: i32,
    pub geojson: String,
    pub feature_count: i32,
    pub geometry_types: String,
    pub bbox_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Lightweight metadata view (without the full GeoJSON blob).
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GtsmGeojsonLayerMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub visible: i32,
    pub feature_count: i32,
    pub geometry_types: String,
    pub bbox_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub version: String,
    pub core: String,
    pub ollama_connected: bool,
    pub active_model: Option<String>,
    pub tokens_per_sec: Option<f64>,
}

// ─── Chat Message for LLM context ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_details: Option<Vec<ReasoningBlock>>,
    /// Base64 encoded images (e.g. "data:image/jpeg;base64,...")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningBlock {
    pub provider: String,
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}

fn default_mime_type() -> String {
    "application/octet-stream".to_string()
}

fn default_type() -> String {
    "file".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    #[serde(default = "default_type")]
    pub r#type: String,
    #[serde(alias = "filename")]
    pub name: String,
    pub data: String,
    #[serde(default = "default_mime_type")]
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extracted_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<i32>,
}

// ─── LLM Response ───

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_details: Option<Vec<ReasoningBlock>>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub done: bool,
}

// ─── Model Info ───

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model_type: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
    #[serde(default)]
    pub quantization: Option<String>,
    #[serde(default)]
    pub max_context_length: Option<u64>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub supports_vision: Option<bool>,
    #[serde(default)]
    pub supports_tools: Option<bool>,
    #[serde(default)]
    pub supports_reasoning: Option<bool>,
    #[serde(default)]
    pub reasoning_config_type: Option<String>,
}

// ─── Provider Config (for switching providers via IPC) ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// "ollama" | "openai" | "openrouter" | "groq" | "together" | "custom"
    pub provider_type: String,
    /// API base URL
    pub base_url: String,
    /// API key (empty for Ollama)
    pub api_key: String,
    /// Display name
    pub display_name: String,
    /// Extra headers for the provider
    #[serde(default)]
    pub headers: Option<std::collections::HashMap<String, String>>,
}
// ─── Orchestration ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationPlan {
    pub id: String,
    pub chat_id: String,
    pub goal: String,
    pub complexity: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationTask {
    pub id: String,
    pub plan_id: String,
    pub description: String,
    pub agent_id: String,
    pub priority: i32,
    pub status: String,
    pub dependencies: String, // JSON
    pub result: Option<String>,
    pub retry_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Skills & Hooks ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub invocation_syntax: String,
    pub enabled: bool,
    #[sqlx(default, json)]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Hook {
    pub id: String,
    pub name: String,
    pub trigger: String,
    pub patterns: Option<String>, // JSON array
    pub enabled: bool,
    pub trigger_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HookLogEntry {
    pub timestamp: i64,
    pub hook_id: String,
    pub hook_name: String,
    pub trigger: String,
    pub result: String, // 'success' | 'blocked' | 'error'
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ZenCommand {
    pub id: String,
    pub name: String,
    pub description: String,
    pub allowed_tools: String, // JSON array
    pub instructions: String,
    pub variables: String, // JSON array
    pub enabled: bool,
}

// ─── Conversation Summary (Phase 1) ───

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub chat_id: String,
    pub summary: String,
    pub message_count: Option<i32>,
    pub token_count: Option<i32>,
    pub created_at: String,
}
