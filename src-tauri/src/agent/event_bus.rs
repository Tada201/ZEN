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

    #[serde(rename = "agent:chunk")]
    AgentChunk(AgentChunkPayload),

    #[serde(rename = "orchestrator:start")]
    OrchestratorStart(OrchestratorStartPayload),

    #[serde(rename = "orchestrator:progress")]
    OrchestratorProgress(serde_json::Value), // Flexible payload for progress

    #[serde(rename = "chat:chunk")]
    ChatChunk(ChatChunkPayload),

    #[serde(rename = "chat:chunk:first")]
    ChatChunkFirst(ChatChunkFirstPayload),

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

    /// Emitted when a sub-agent run starts, progresses, or finishes.  Carried
    /// on the event bus and bridged to `chat:subagent-step` so the frontend
    /// timeline can render sub-agent execution as a first-class step.
    #[serde(rename = "chat:subagent-step")]
    SubagentStep(SubagentStepPayload),

    #[serde(rename = "tool:start")]
    ToolStart(ToolStartPayload),

    #[serde(rename = "tool:complete")]
    ToolComplete(ToolCompletePayload),

    #[serde(rename = "tool:authorization_request")]
    ToolAuthorizationRequest(ToolAuthorizationPayload),

    // ─── Artifact Lifecycle Events ───
    #[serde(rename = "artifact:start")]
    ArtifactStart(ArtifactStartPayload),

    #[serde(rename = "artifact:delta")]
    ArtifactDelta(ArtifactDeltaPayload),

    #[serde(rename = "artifact:complete")]
    ArtifactComplete(ArtifactCompletePayload),

    // ─── Context Viewer Events ──────────────────────────────────────
    // Per-iteration breakdown of the LLM context window: which sections
    // landed, their token costs, and which compaction path fired. Drives
    // the Codex-style context visualiser in PremiumChatInput and the
    // right-panel "Context" tab.
    #[serde(rename = "context:breakdown")]
    ContextBreakdown(crate::agent::context_breakdown::ContextBreakdownPayload),
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
pub struct AgentChunkPayload {
    pub chat_id: String,
    /// Stable child-run identity. Without this, parallel children using the
    /// same agent type collapse into one frontend transcript lane.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_id: Option<String>,
    pub agent_id: String,
    pub agent_name: String,
    pub delta: String,
    #[serde(rename = "type")]
    pub r#type: String,
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
    /// Optional message_id for deterministic routing to the correct assistant
    pub message_id: Option<String>,
    /// Runner event sequence at emit time. Constant while a single LLM stream
    /// segment produces text (no `next_event_sequence` is consumed during
    /// streaming), and higher after that iteration's tools run — so the
    /// frontend can open a NEW text part when prose resumes after a tool
    /// instead of folding it back into the pre-tool block.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunkFirstPayload {
    pub chat_id: String,
    pub delta: String,
    #[serde(rename = "type")]
    pub r#type: String,
    /// Optional message_id for deterministic routing to the correct assistant
    pub message_id: Option<String>,
    /// See `ChatChunkPayload::sequence`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
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
    pub phase: Option<String>,
    pub metadata: Option<serde_json::Value>,
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
    /// Backend-persisted assistant message ID so the frontend can target
    /// the correct DB row for post-stream updates (e.g. steps_json).
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamResetPayload {
    pub chat_id: String,
}

/// Lifecycle payload for a sub-agent execution step shown inline in the chat.
///
/// `spawn_id` is the stable correlation id shared with the child runner's
/// `trace_id`, so every child tool event (`tool:start`/`tool:complete`) can be
/// associated with this sub-agent step.  `parent_tool_call_id` is the id of
/// the parent agent's `spawn_agent` tool call, used by the frontend to place
/// the step in the right timeline position.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentStepPayload {
    pub chat_id: String,
    pub spawn_id: String,
    pub parent_tool_call_id: Option<String>,
    pub agent_id: String,
    pub agent_name: String,
    pub task: String,
    /// One of: running, completed, failed, cancelled, incomplete, uncertain.
    pub status: String,
    /// Short result summary when the sub-agent completes successfully.
    pub result_summary: Option<String>,
    /// Full final output text (bounded) so the Agents panel can render the
    /// child's complete answer as a chat message instead of the short summary.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_content: Option<String>,
    /// Intermediate commentary the child produced between its tool calls, each
    /// tagged with the event sequence it preceded so the panel can interleave
    /// the child's thinking with its tool cards in execution order.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intermediate_content: Option<Vec<SubagentCommentarySegment>>,
    /// Error message when the sub-agent fails.
    pub error: Option<String>,
    pub duration_ms: u64,
    /// ISO-8601 UTC timestamp.
    pub timestamp: String,
    /// Tool-call ids executed by the child runner (optional, may be populated
    /// incrementally as the child runs).
    pub child_tool_call_ids: Option<Vec<String>>,
}

/// One slice of sub-agent commentary, tagged with the event sequence it
/// preceded so the frontend can interleave text with the child's tool cards.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentCommentarySegment {
    pub sequence: u64,
    pub text: String,
}

impl SubagentCommentarySegment {
    /// Number of commentary slices carried in one payload.
    pub const MAX_SEGMENTS: usize = 40;
    /// Per-slice character bound so a chatty child can't bloat the event/DB.
    pub const MAX_SEGMENT_CHARS: usize = 4_000;

    /// Sort raw `(sequence, text)` pairs and bound them into wire segments.
    /// Single source of truth for both the live per-iteration emit and the
    /// final completion payload. `None` when there is no commentary yet.
    pub fn snapshot(raw: &[(u64, String)]) -> Option<Vec<Self>> {
        if raw.is_empty() {
            return None;
        }
        let mut sorted = raw.to_vec();
        sorted.sort_by_key(|(sequence, _)| *sequence);
        // Keep the NEWEST slices once the cap is exceeded: the tail is the
        // thinking a long-running child still needs on the panel; dropping
        // from the head would freeze it on its earliest commentary. Output
        // stays ascending so consumers see monotonic sequences.
        let start = sorted.len().saturating_sub(Self::MAX_SEGMENTS);
        let segments: Vec<Self> = sorted[start..]
            .iter()
            .map(|(sequence, text)| Self {
                sequence: *sequence,
                text: text.chars().take(Self::MAX_SEGMENT_CHARS).collect(),
            })
            .collect();
        (!segments.is_empty()).then_some(segments)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStartPayload {
    pub tool_name: String,
    pub tool_call_id: String,
    pub arguments: serde_json::Value,
    /// Monotonic position within the owning run.
    pub sequence: u64,
    /// ISO-8601 event timestamp emitted by the backend.
    pub timestamp: String,
    /// Canonical lifecycle phase for this event.
    pub phase: String,
    /// Stable parent tool call for child-agent execution events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    /// Per-run correlation id (UUID) minted once per `Runner::run()`. Unlike
    /// `run_id` (currently the chat_id, stable across turns), this isolates a
    /// single run so all its events can be reassembled into one trace.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_batch_id: Option<String>,
    /// Backend-persisted assistant message ID so tool events can be routed
    /// to the same timeline entry after reload.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    pub agent_id: String,
    pub agent_name: String,
    pub chat_id: String,
    pub iteration: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCompletePayload {
    pub tool_name: String,
    pub tool_call_id: String,
    /// Monotonic position within the owning run.
    pub sequence: u64,
    /// ISO-8601 event timestamp emitted by the backend.
    pub timestamp: String,
    /// Canonical lifecycle phase for this event.
    pub phase: String,
    /// Stable parent tool call for child-agent execution events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    /// Per-run correlation id (UUID). See `ToolStartPayload::trace_id`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_batch_id: Option<String>,
    /// Backend-persisted assistant message ID so tool events can be routed
    /// to the same timeline entry after reload.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    /// Per-run correlation id (UUID). See `ToolStartPayload::trace_id`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iteration: Option<usize>,
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
                        if let Some(last_lt) = self.partial.rfind('<') {
                            if last_lt > 0 {
                                self.partial.drain(..last_lt);
                            }
                        } else {
                            self.partial.clear();
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
                            let artifact_id =
                                self.active_artifact.as_ref().unwrap().artifact_id.clone();
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
                            let cutoff = self.floor_char_boundary(self.partial.len() - keep_window);
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

    fn floor_char_boundary(&self, mut index: usize) -> usize {
        while index > 0 && !self.partial.is_char_boundary(index) {
            index -= 1;
        }
        index
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
            if pos >= bytes.len() {
                break;
            }

            // Read key name
            let key_start = pos;
            while pos < bytes.len()
                && (bytes[pos].is_ascii_alphanumeric() || bytes[pos] == b'_' || bytes[pos] == b'-')
            {
                pos += 1;
            }
            if pos == key_start {
                break;
            }
            let key = &attrs_str[key_start..pos];

            // Skip whitespace and '='
            while pos < bytes.len() && (bytes[pos].is_ascii_whitespace() || bytes[pos] == b'=') {
                pos += 1;
            }
            if pos >= bytes.len() {
                break;
            }

            // Read quoted value
            let quote = bytes[pos];
            if quote != b'"' && quote != b'\'' {
                break;
            }
            pos += 1; // skip opening quote
            let val_start = pos;
            while pos < bytes.len() && bytes[pos] != quote {
                pos += 1;
            }
            let val = &attrs_str[val_start..pos];
            if pos < bytes.len() {
                pos += 1;
            } // skip closing quote

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

        Some(ArtifactAttrs {
            id,
            artifact_type,
            title,
            language,
        })
    }
}

impl AgentEvent {
    /// Tauri event name for frontend bridging.
    pub fn event_name(&self) -> &'static str {
        match self {
            AgentEvent::AgentSpawn(_) => "agent:spawn",
            AgentEvent::AgentComplete(_) => "agent:complete",
            AgentEvent::AgentHandoff(_) => "agent:handoff",
            AgentEvent::AgentChunk(_) => "agent:chunk",
            AgentEvent::OrchestratorStart(_) => "orchestrator:start",
            AgentEvent::OrchestratorProgress(_) => "orchestrator:progress",
            AgentEvent::ChatChunk(_) => "chat:chunk",
            AgentEvent::ChatChunkFirst(_) => "chat:chunk:first",
            AgentEvent::ChatMessage(_) => "chat:message",
            AgentEvent::ChatStatus(_) => "chat:status",
            AgentEvent::ChatError(_) => "chat:error",
            AgentEvent::ChatDone(_) => "chat:done",
            AgentEvent::ChatStreamReset(_) => "chat:stream-reset",
            AgentEvent::SubagentStep(_) => "chat:subagent-step",
            AgentEvent::ToolStart(_) => "tool:start",
            AgentEvent::ToolComplete(_) => "tool:complete",
            AgentEvent::ToolAuthorizationRequest(_) => "tool:authorization_request",
            AgentEvent::ArtifactStart(_) => "artifact:start",
            AgentEvent::ArtifactDelta(_) => "artifact:delta",
            AgentEvent::ArtifactComplete(_) => "artifact:complete",
            AgentEvent::ContextBreakdown(_) => "context:breakdown",
        }
    }

    /// Extract payload for emission
    pub fn payload(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }

    /// Emit via direct channel or fallback to app handle (XOR — never both)
    pub fn emit_via(
        &self,
        app: &tauri::AppHandle,
        channel: &Option<tauri::ipc::Channel<serde_json::Value>>,
    ) {
        use tauri::Emitter;
        let payload = self.payload();

        if let Some(ref ch) = channel {
            if let Err(e) = ch.send(payload) {
                tracing::warn!(
                    "Failed to emit event '{}' via direct channel: {}",
                    self.event_name(),
                    e
                );
            }
        } else {
            let event_name = self.event_name();
            let flat_payload = match payload.get("payload") {
                Some(p) => p.clone(),
                None => payload,
            };
            if let Err(e) = app.emit(event_name, flat_payload) {
                tracing::warn!("Failed to emit event '{}' via app handle: {}", event_name, e);
            }
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
                        // Every variant flattens its payload directly — this
                        // matches what listen<T> expects in the frontend. A
                        // catch-all arm used to double-wrap any variant listed
                        // here and silently broke the frontend router (most
                        // recently `agent:chunk`, whose sub-agent progress
                        // chunks were dropped); the match is now exhaustive so
                        // a new variant must choose its payload shape
                        // explicitly.
                        let payload = match &event {
                            AgentEvent::AgentSpawn(p) => serde_json::to_value(p),
                            AgentEvent::AgentComplete(p) => serde_json::to_value(p),
                            AgentEvent::AgentHandoff(p) => serde_json::to_value(p),
                            AgentEvent::AgentChunk(p) => serde_json::to_value(p),
                            AgentEvent::OrchestratorStart(p) => serde_json::to_value(p),
                            AgentEvent::OrchestratorProgress(p) => Ok(p.clone()),
                            AgentEvent::ChatChunk(p) => serde_json::to_value(p),
                            AgentEvent::ChatChunkFirst(p) => serde_json::to_value(p),
                            AgentEvent::ChatMessage(p) => serde_json::to_value(p),
                            AgentEvent::ChatStatus(p) => serde_json::to_value(p),
                            AgentEvent::ChatError(p) => serde_json::to_value(p),
                            AgentEvent::ChatDone(p) => serde_json::to_value(p),
                            AgentEvent::ChatStreamReset(p) => serde_json::to_value(p),
                            AgentEvent::SubagentStep(p) => serde_json::to_value(p),
                            AgentEvent::ToolStart(p) => serde_json::to_value(p),
                            AgentEvent::ToolComplete(p) => serde_json::to_value(p),
                            AgentEvent::ToolAuthorizationRequest(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactStart(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactDelta(p) => serde_json::to_value(p),
                            AgentEvent::ArtifactComplete(p) => serde_json::to_value(p),
                            AgentEvent::ContextBreakdown(p) => serde_json::to_value(p),
                        }
                        .unwrap_or(serde_json::Value::Null);

                        if let Err(e) = app.emit(event_name, payload) {
                            tracing::warn!(
                                "Failed to bridge event '{}' to Tauri: {}",
                                event_name,
                                e
                            );
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
        // 4096 to absorb subagent burst floods (AgentChunk + chat:status
        // events). Previous 256 caused RecvError::Lagged drops that
        // manifested as parent-stream stutter.
        Self::new(4096)
    }
}
