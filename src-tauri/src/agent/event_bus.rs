/// ISSUE-008: Internal Event Bus for Agent Coordination
///
/// Centralized `tokio::broadcast` event bus for backend-to-backend coordination.
/// Subsystems (SwarmCoordinator, WorkflowEngine, Memory) subscribe to events
/// and react without tight coupling.
///
/// A bridge task forwards events to the Tauri frontend via `app.emit()`.

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing;

// ─── Events ───

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    #[serde(rename = "agent:spawn")]
    AgentSpawn(AgentSpawnPayload),
    
    #[serde(rename = "agent:complete")]
    AgentComplete(AgentCompletePayload),
    
    #[serde(rename = "agent:handoff")]
    AgentHandoff(AgentHandoffPayload),

    #[serde(rename = "orchestrator:start")]
    OrchestratorStart(OrchestratorStartPayload),
    
    #[serde(rename = "orchestrator:progress")]
    OrchestratorProgress(serde_json::Value), // Flexible payload for progress

    #[serde(rename = "chat:chunk")]
    ChatChunk(ChatChunkPayload),
    
    #[serde(rename = "chat:message")]
    ChatMessage(ChatMessagePayload),
    
    #[serde(rename = "chat:status")]
    ChatStatus(ChatStatusPayload),
    
    #[serde(rename = "chat:error")]
    ChatError(ChatErrorPayload),

    #[serde(rename = "chat:done")]
    ChatDone(ChatDonePayload),
    
    #[serde(rename = "chat:stream-reset")]
    ChatStreamReset(ChatStreamResetPayload),
    
    #[serde(rename = "tool:start")]
    ToolStart(ToolStartPayload),
    
    #[serde(rename = "tool:complete")]
    ToolComplete(ToolCompletePayload),

    // --- Workflow & Task Events ---
    #[serde(rename = "workflow:started")]
    WorkflowStarted {
        workflow_id: String,
        total_tasks: usize,
    },
    #[serde(rename = "workflow:completed")]
    WorkflowCompleted {
        workflow_id: String,
        tasks_completed: usize,
        duration_ms: u64,
    },
    #[serde(rename = "workflow:failed")]
    WorkflowFailed {
        workflow_id: String,
        error: String,
    },
    #[serde(rename = "task:started")]
    TaskStarted {
        task_id: String,
        agent_id: String,
        description: String,
    },
    #[serde(rename = "task:completed")]
    TaskCompleted {
        task_id: String,
        agent_id: String,
        duration_ms: u64,
    },
    #[serde(rename = "task:failed")]
    TaskFailed {
        task_id: String,
        agent_id: String,
        error: String,
    },

    #[serde(rename = "tool:authorization_request")]
    ToolAuthorizationRequest(ToolAuthorizationPayload),

    // ─── Artifact Lifecycle Events ───
    #[serde(rename = "artifact:start")]
    ArtifactStart(ArtifactStartPayload),

    #[serde(rename = "artifact:delta")]
    ArtifactDelta(ArtifactDeltaPayload),

    #[serde(rename = "artifact:complete")]
    ArtifactComplete(ArtifactCompletePayload),

    // Legacy/Internal Events (keeping for compatibility)
    #[serde(rename = "agent:spawned")]
    AgentSpawned {
        agent_id: String,
        agent_type: String,
    },
    #[serde(rename = "agent:terminated")]
    AgentTerminated {
        agent_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpawnPayload {
    pub parent_agent: String,
    pub child_agent_id: String,
    pub child_agent_name: String,
    pub task: String,
    pub chat_id: String,
    pub spawn_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCompletePayload {
    pub agent_id: String,
    pub chat_id: String,
    pub status: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub spawn_id: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHandoffPayload {
    pub from_agent: String,
    pub to_agent: String,
    pub reason: String,
    pub chat_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorStartPayload {
    pub chat_id: String,
    pub mode: String,
    pub battle_plan: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunkPayload {
    pub chat_id: String,
    pub delta: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessagePayload {
    pub chat_id: String,
    /// Stable UUID used to deduplicate live events with DB-persisted rows.
    pub id: String,
    /// ISO-8601 UTC timestamp.
    pub timestamp: String,
    pub role: String,
    pub content: String,
    pub kind: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStatusPayload {
    pub chat_id: String,
    pub message: String,
    pub iteration: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatErrorPayload {
    pub chat_id: String,
    pub error: String,
    pub recoverable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDonePayload {
    pub chat_id: String,
    pub content: Option<String>,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub reason: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamResetPayload {
    pub chat_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStartPayload {
    pub tool_name: String,
    pub tool_call_id: String,
    pub arguments: serde_json::Value,
    pub agent_id: String,
    pub agent_name: String,
    pub chat_id: String,
    pub iteration: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCompletePayload {
    pub tool_name: String,
    pub tool_call_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub chat_id: String,
    pub duration_ms: u64,
    pub status: String,
    pub iteration: usize,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolAuthorizationPayload {
    pub chat_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub model: Option<String>,
    pub context: serde_json::Value,
}

// ─── Artifact Lifecycle Events ───────────────────────────────────────────────
//
// These events decouple artifact creation from inline <nexus_artifact> XML
// parsing during markdown rendering.  The backend emits typed lifecycle events
// when it detects artifact tag boundaries in the LLM output stream.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactStartPayload {
    pub chat_id: String,
    pub artifact_id: String,
    /// 'code' | 'diagram' | 'ui' | 'document' | 'stepper'
    pub artifact_type: String,
    pub title: String,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactDeltaPayload {
    pub chat_id: String,
    pub artifact_id: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactCompletePayload {
    pub chat_id: String,
    pub artifact_id: String,
    pub content: Option<String>,
}

// ─── Streaming Artifact Detector ────────────────────────────────────────────

/// Detects `<nexus_artifact>` tag boundaries in a streaming text buffer and emits
/// typed artifact lifecycle events via the provided `emit_fn` callback.
///
/// Usage: attach one per active chat stream, feed incoming text chunks to
/// `feed()`, and the detector will call `emit_fn` for each artifact event.
pub struct StreamingArtifactDetector<F: Fn(AgentEvent)> {
    emit_fn: F,
    /// Accumulated partial line for multi-chunk tag boundary detection.
    partial: String,
    /// Active artifact being built (Some → inside an artifact).
    active_artifact: Option<ActiveArtifact>,
}

struct ActiveArtifact {
    artifact_id: String,
    chat_id: String,
}

struct ArtifactAttrs {
    id: String,
    artifact_type: String,
    title: String,
    language: Option<String>,
}

impl<F: Fn(AgentEvent)> StreamingArtifactDetector<F> {
    pub fn new(emit_fn: F) -> Self {
        Self {
            emit_fn,
            partial: String::new(),
            active_artifact: None,
        }
    }

    /// Feed a text chunk from the LLM output stream.  The detector scans for
    /// `<nexus_artifact ...>` open tags and `</nexus_artifact>` close tags,
    /// extracts the artifact body between them, and emits the appropriate
    /// lifecycle events.  Non-artifact text is passed through without change.
    ///
    /// The caller should continue forwarding the original text as `chat:chunk`
    /// events — this detector only emits the **additional** artifact events.
    pub fn feed(&mut self, chunk: &str, chat_id: &str) {
        self.partial.push_str(chunk);

        loop {
            if self.active_artifact.is_none() {
                // Look for an opening <nexus_artifact ...> tag
                let tag_start = match self.find_tag_open() {
                    Some(pos) => pos,
                    None => {
                        // No opening tag found — keep only a trailing window
                        // in case the tag spans chunk boundaries.
                        let tag = "<nexus_artifact";
                        if self.partial.len() > tag.len() {
                            let keep = &self.partial[self.partial.len() - tag.len()..];
                            if !keep.contains('<') {
                                self.partial.clear();
                            } else {
                                let last_lt = self.partial.rfind('<').unwrap_or(0);
                                self.partial.drain(..last_lt);
                            }
                        }
                        return;
                    }
                };

                // Drop everything before the tag
                self.partial.drain(..tag_start);

                // Parse attributes from the opening tag
                if let Some(attrs) = self.parse_artifact_attrs() {
                    let artifact_id = attrs.id;
                    let artifact_type = attrs.artifact_type;
                    let title = attrs.title;
                    let language = attrs.language;

                    self.active_artifact = Some(ActiveArtifact {
                        artifact_id: artifact_id.clone(),
                        chat_id: chat_id.to_string(),
                    });

                    (self.emit_fn)(AgentEvent::ArtifactStart(ArtifactStartPayload {
                        chat_id: chat_id.to_string(),
                        artifact_id,
                        artifact_type,
                        title,
                        language,
                    }));
                } else {
                    // Malformed opening tag — skip it
                    if let Some(gt) = self.partial.find('>') {
                        self.partial.drain(..=gt);
                    } else {
                        self.partial.clear();
                    }
                }
            } else {
                // Inside an active artifact — look for closing tag
                if let Some(close_pos) = self.partial.find("</nexus_artifact>") {
                    let artifact_id = self.active_artifact.as_ref().unwrap().artifact_id.clone();
                    let cid = self.active_artifact.as_ref().unwrap().chat_id.clone();

                    // Body is everything between the opening tag's '>' and the close tag
                    let body_start = if let Some(gt) = self.partial.find('>') {
                        gt + 1
                    } else {
                        0
                    };
                    let body = if close_pos > body_start {
                        self.partial[body_start..close_pos].to_string()
                    } else {
                        String::new()
                    };

                    // Emit the final delta (remaining body text)
                    if !body.is_empty() {
                        (self.emit_fn)(AgentEvent::ArtifactDelta(ArtifactDeltaPayload {
                            chat_id: cid.clone(),
                            artifact_id: artifact_id.clone(),
                            delta: body,
                        }));
                    }

                    // Emit artifact complete
                    (self.emit_fn)(AgentEvent::ArtifactComplete(ArtifactCompletePayload {
                        chat_id: cid,
                        artifact_id,
                        content: None,
                    }));

                    self.active_artifact = None;
                    // Consume up to and including the closing tag
                    self.partial.drain(..=close_pos + "</nexus_artifact>".len());
                } else {
                    // No closing tag yet — emit whatever body text is available.
                    // Find the '>' that ends the opening tag, then emit everything after.
                    let body_start = if let Some(gt) = self.partial.find('>') {
                        gt + 1
                    } else {
                        0
                    };

                    if self.partial.len() > body_start {
                        let body = self.partial[body_start..].to_string();
                        if !body.is_empty() {
                            let artifact_id = self.active_artifact.as_ref().unwrap().artifact_id.clone();
                            let cid = self.active_artifact.as_ref().unwrap().chat_id.clone();
                            (self.emit_fn)(AgentEvent::ArtifactDelta(ArtifactDeltaPayload {
                                chat_id: cid,
                                artifact_id,
                                delta: body,
                            }));
                        }
                        // Keep only a trailing window in case </nexus_artifact> crosses a chunk boundary
                        let keep_window = "</nexus_artifact>".len();
                        if self.partial.len() > body_start + keep_window {
                            let cutoff = self.partial.len() - keep_window;
                            self.partial.drain(body_start..cutoff);
                        }
                    }
                    return;
                }
            }
        }
    }

    /// Flush any remaining buffered text — call when the stream ends.
    pub fn flush(&mut self) {
        self.partial.clear();
        self.active_artifact = None;
    }

    // ─── private helpers ───

    fn find_tag_open(&self) -> Option<usize> {
        self.partial.find("<nexus_artifact")
    }

    fn parse_artifact_attrs(&self) -> Option<ArtifactAttrs> {
        let start = self.find_tag_open()?;
        let after_tag = &self.partial[start + "<nexus_artifact".len()..];
        let gt_pos = after_tag.find('>')?;
        let attrs_str = &after_tag[..gt_pos];

        let mut id = String::new();
        let mut artifact_type = String::new();
        let mut title = String::new();
        let mut language: Option<String> = None;

        // Manual key="value" attribute parser (no regex dependency needed).
        let mut pos = 0;
        let bytes = attrs_str.as_bytes();
        while pos < bytes.len() {
            // Skip whitespace
            while pos < bytes.len() && bytes[pos].is_ascii_whitespace() {
                pos += 1;
            }
            if pos >= bytes.len() { break; }

            // Read key name
            let key_start = pos;
            while pos < bytes.len() && (bytes[pos].is_ascii_alphanumeric() || bytes[pos] == b'_' || bytes[pos] == b'-') {
                pos += 1;
            }
            if pos == key_start { break; }
            let key = &attrs_str[key_start..pos];

            // Skip whitespace and '='
            while pos < bytes.len() && (bytes[pos].is_ascii_whitespace() || bytes[pos] == b'=') {
                pos += 1;
            }
            if pos >= bytes.len() { break; }

            // Read quoted value
            let quote = bytes[pos];
            if quote != b'"' && quote != b'\'' { break; }
            pos += 1; // skip opening quote
            let val_start = pos;
            while pos < bytes.len() && bytes[pos] != quote {
                pos += 1;
            }
            let val = &attrs_str[val_start..pos];
            if pos < bytes.len() { pos += 1; } // skip closing quote

            match key {
                "id" => id = val.to_string(),
                "type" => artifact_type = val.to_string(),
                "title" => title = val.to_string(),
                "language" => language = Some(val.to_string()),
                _ => {}
            }
        }

        if id.is_empty() || artifact_type.is_empty() || title.is_empty() {
            return None;
        }

        Some(ArtifactAttrs { id, artifact_type, title, language })
    }
}

impl AgentEvent {
    /// Tauri event name for frontend bridging.
    pub fn event_name(&self) -> &'static str {
        match self {
            AgentEvent::AgentSpawn(_) | AgentEvent::AgentSpawned { .. } => "agent:spawn",
            AgentEvent::AgentComplete(_) => "agent:complete",
            AgentEvent::AgentTerminated { .. } => "agent:terminated",
            AgentEvent::AgentHandoff(_) => "agent:handoff",
            AgentEvent::OrchestratorStart(_) => "orchestrator:start",
            AgentEvent::OrchestratorProgress(_) => "orchestrator:progress",
            AgentEvent::ChatChunk(_) => "chat:chunk",
            AgentEvent::ChatMessage(_) => "chat:message",
            AgentEvent::ChatStatus(_) => "chat:status",
            AgentEvent::ChatError(_) => "chat:error",
            AgentEvent::ChatDone(_) => "chat:done",
            AgentEvent::ChatStreamReset(_) => "chat:stream-reset",
            AgentEvent::ToolStart(_) => "tool:start",
            AgentEvent::ToolComplete(_) => "tool:complete",
            AgentEvent::WorkflowStarted { .. } => "workflow:started",
            AgentEvent::WorkflowCompleted { .. } => "workflow:completed",
            AgentEvent::WorkflowFailed { .. } => "workflow:failed",
            AgentEvent::TaskStarted { .. } => "task:started",
            AgentEvent::TaskCompleted { .. } => "task:completed",
            AgentEvent::TaskFailed { .. } => "task:failed",
            AgentEvent::ToolAuthorizationRequest(_) => "tool:authorization_request",
            AgentEvent::ArtifactStart(_) => "artifact:start",
            AgentEvent::ArtifactDelta(_) => "artifact:delta",
            AgentEvent::ArtifactComplete(_) => "artifact:complete",
        }
    }

    /// Extract payload for emission
    pub fn payload(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }

    /// Emit via direct channel or fallback to app handle
    pub fn emit_via(&self, app: &tauri::AppHandle, channel: &Option<tauri::ipc::Channel<serde_json::Value>>) {
        use tauri::Emitter;
        let payload = self.payload();
        
        if let Some(ref ch) = channel {
            // For channels, we keep the {type, payload} structure
            let _ = ch.send(payload);
        } else {
            // For global emit, we use the event name and flat payload
            let event_name = self.event_name();
            let flat_payload = match payload.get("payload") {
                Some(p) => p.clone(),
                None => payload,
            };
            let _ = app.emit(event_name, flat_payload);
        }
    }
}

// ─── EventBus ───

/// Central broadcast event bus.
pub struct EventBus {
    tx: broadcast::Sender<AgentEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn emit(&self, event: AgentEvent) {
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AgentEvent> {
        self.tx.subscribe()
    }

    pub fn bridge_to_tauri(&self, app: tauri::AppHandle) {
        use tauri::Emitter;
        let mut rx = self.subscribe();

        tauri::async_runtime::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        let event_name = event.event_name();
                        // For global events, we emit the payload directly
                        // This matches what listen<T> expects in the frontend
                        let payload = match &event {
                            AgentEvent::AgentSpawn(p) => serde_json::to_value(p),
                            AgentEvent::AgentComplete(p) => serde_json::to_value(p),
                            AgentEvent::AgentHandoff(p) => serde_json::to_value(p),
                            AgentEvent::OrchestratorStart(p) => serde_json::to_value(p),
                            AgentEvent::OrchestratorProgress(p) => Ok(p.clone()),
                            AgentEvent::ChatChunk(p) => serde_json::to_value(p),
                            AgentEvent::ChatMessage(p) => serde_json::to_value(p),
                            AgentEvent::ChatStatus(p) => serde_json::to_value(p),
                            AgentEvent::ChatError(p) => serde_json::to_value(p),
                            AgentEvent::ChatDone(p) => serde_json::to_value(p),
                            AgentEvent::ChatStreamReset(p) => serde_json::to_value(p),
                            AgentEvent::ToolStart(p) => serde_json::to_value(p),
                            AgentEvent::ToolComplete(p) => serde_json::to_value(p),
                            AgentEvent::ToolAuthorizationRequest(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactStart(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactDelta(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactComplete(p) => serde_json::to_value(p),
                            _ => serde_json::to_value(&event),
                        }.unwrap_or(serde_json::Value::Null);

                        if let Err(e) = app.emit(event_name, payload) {
                            tracing::warn!("Failed to bridge event '{}' to Tauri: {}", event_name, e);
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("Event bus bridge lagged, missed {} events", n);
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        tracing::info!("Event bus closed, stopping Tauri bridge");
                        break;
                    }
                }
            }
        });
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(256)
    }
}
