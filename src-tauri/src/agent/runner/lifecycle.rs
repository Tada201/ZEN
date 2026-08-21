use super::config::RunConfig;
use crate::agent::cache::ToolCache;
use crate::agent::event_bus::AgentEvent;
use crate::agent::hooks::HookRegistry;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::AgentRegistry;
use crate::tools::manager::ToolManager;
use crate::tools::GlobalToolRegistry;
use sqlx::SqlitePool;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::AppHandle;

use crate::db::models::ChatMessage;

pub struct Runner {
    pub(super) app: AppHandle,
    pub(super) tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    pub(super) agent_registry: Arc<AgentRegistry>,
    pub(super) hook_registry: Arc<HookRegistry>,
    pub(super) permissions: GlobalToolRegistry,
    pub(super) tool_manager: Arc<ToolManager>,
    pub(super) config: RunConfig,
    pub(super) db_pool: Option<SqlitePool>,
    pub depth: u32,
    pub(super) cache: Arc<tokio::sync::Mutex<ToolCache>>,
    pub(super) allowed_tools: Arc<tokio::sync::Mutex<HashSet<String>>>,
    pub(super) on_event: Option<tauri::ipc::Channel<serde_json::Value>>,
    /// Isolated memory scope for sub-agents. When set, the runner must not
    /// persist intermediate or final assistant messages into the parent chat.
    pub(super) memory_scope: Option<String>,
    /// Per-run correlation id (UUID) minted at the top of `run()` and stamped
    /// on every event this runner emits (tool start/complete, authorization,
    /// chat done/error). Lets the frontend and logs reconstruct one full
    /// reasoning trace — distinct from `run_id`/`chat_id`, which are stable
    /// across every turn on a chat. `None` until `run()` sets it. Interior
    /// mutability because `run()` borrows `&self`; child runners get a fresh
    /// slot so each sub-agent run traces independently.
    pub(super) trace_id: Arc<std::sync::RwLock<Option<String>>>,
    /// Stable parent tool call for child-agent execution events. Root runs do
    /// not have a parent; child runners inherit the spawn/delegation call id.
    pub(super) parent_tool_call_id: Arc<std::sync::RwLock<Option<String>>>,
    /// Monotonic sequence for lifecycle events in this run.
    pub(super) event_sequence: Arc<AtomicU64>,
    /// Child tool ids collected by a spawned runner for its completion summary.
    pub(super) child_tool_call_ids: Arc<tokio::sync::Mutex<Vec<String>>>,
    /// Intermediate assistant commentary a spawned runner produced alongside its
    /// tool calls, tagged with the run's event sequence so the Agents panel can
    /// interleave the child's thinking between its tool cards. Root runs stream
    /// this text live and never populate it.
    pub(super) intermediate_commentary: Arc<tokio::sync::Mutex<Vec<(u64, String)>>>,
    /// Optional shared inbox for parent→child message injection. When set,
    /// the runner drains any queued `ChatMessage`s into its conversation at
    /// the start of each iteration, allowing a parent agent/orchestrator to
    /// send instructions or context updates to a running sub-agent.
    pub(super) message_inbox: Option<Arc<tokio::sync::Mutex<VecDeque<ChatMessage>>>>,
}

impl Clone for Runner {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            tool_registry: self.tool_registry.clone(),
            agent_registry: self.agent_registry.clone(),
            hook_registry: self.hook_registry.clone(),
            permissions: self.permissions.clone(),
            tool_manager: self.tool_manager.clone(),
            config: self.config.clone(),
            db_pool: self.db_pool.clone(),
            depth: self.depth,
            cache: self.cache.clone(),
            allowed_tools: self.allowed_tools.clone(),
            on_event: self.on_event.clone(),
            memory_scope: self.memory_scope.clone(),
            // Share the trace slot with the clone: clones are the same logical
            // run (see `send.rs`, which clones for the spawned task), so they
            // must observe the same trace_id `run()` sets.
            trace_id: self.trace_id.clone(),
            parent_tool_call_id: self.parent_tool_call_id.clone(),
            event_sequence: self.event_sequence.clone(),
            child_tool_call_ids: self.child_tool_call_ids.clone(),
            intermediate_commentary: self.intermediate_commentary.clone(),
            message_inbox: self.message_inbox.clone(),
        }
    }
}

impl Runner {
    pub fn new(
        app: AppHandle,
        tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
        agent_registry: Arc<AgentRegistry>,
        hook_registry: Arc<HookRegistry>,
        permissions: GlobalToolRegistry,
        tool_manager: Arc<ToolManager>,
    ) -> Self {
        Self {
            app,
            tool_registry,
            agent_registry,
            hook_registry,
            permissions,
            tool_manager,
            config: RunConfig::default(),
            db_pool: None,
            depth: 0,
            // Cache default is a short safety net only; actual TTLs come from
            // `crate::agent::cache::ttl_for_tool`. Anything not on that allowlist
            // is not cached and mutating tools clear the cache on completion.
            cache: Arc::new(tokio::sync::Mutex::new(ToolCache::new(60))),
            allowed_tools: Arc::new(tokio::sync::Mutex::new(HashSet::new())),
            on_event: None,
            memory_scope: None,
            trace_id: Arc::new(std::sync::RwLock::new(None)),
            parent_tool_call_id: Arc::new(std::sync::RwLock::new(None)),
            event_sequence: Arc::new(AtomicU64::new(0)),
            child_tool_call_ids: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            intermediate_commentary: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            message_inbox: None,
        }
    }

    /// Set a direct IPC channel for high-performance event streaming.
    pub fn with_channel(mut self, channel: tauri::ipc::Channel<serde_json::Value>) -> Self {
        self.on_event = Some(channel);
        self
    }

    pub fn with_db_pool(mut self, db_pool: SqlitePool) -> Self {
        self.db_pool = Some(db_pool);
        self
    }

    pub fn with_parallel_tools(mut self, parallel: bool) -> Self {
        self.config.parallel_tools = parallel;
        self
    }

    pub fn with_tools_enabled(mut self, enabled: bool) -> Self {
        self.config.tools_enabled = enabled;
        self
    }

    pub fn with_voice_mode(
        mut self,
        voice_mode: bool,
        display_agent_model: Option<String>,
        display_agent_provider: Option<String>,
        voice_display_context: Option<String>,
    ) -> Self {
        self.config.voice_mode = voice_mode;
        self.config.display_agent_model = display_agent_model;
        self.config.display_agent_provider = display_agent_provider;
        self.config.voice_display_context = voice_display_context;
        self
    }

    pub fn with_memory_scope(mut self, scope: String) -> Self {
        self.memory_scope = Some(scope);
        self
    }

    /// Set a shared inbox that a parent can use to inject messages into this
    /// runner's conversation while it is running.
    pub fn with_message_inbox(
        mut self,
        inbox: Arc<tokio::sync::Mutex<VecDeque<ChatMessage>>>,
    ) -> Self {
        self.message_inbox = Some(inbox);
        self
    }

    /// Sub-agents with an isolated memory scope must not write into the parent chat.
    pub(super) fn should_persist_to_parent_chat(&self) -> bool {
        self.memory_scope.is_none()
    }

    pub fn with_depth(mut self, depth: u32) -> Self {
        self.depth = depth;
        self
    }

    pub fn with_max_iterations(mut self, max_iterations: usize) -> Self {
        self.config.max_iterations = max_iterations;
        self
    }

    pub fn with_token_budget(mut self, token_budget: Option<usize>) -> Self {
        self.config.token_budget = token_budget;
        self
    }

    pub fn with_max_context_tokens(mut self, max_tokens: usize) -> Self {
        self.config.max_context_tokens = max_tokens;
        self
    }

    /// Set the selected model's real context window (`max_context_length`).
    /// Surfaced in the context breakdown as the gauge denominator; does
    /// not affect the compaction cap (`max_context_tokens`).
    pub fn with_model_context_window(mut self, window: Option<usize>) -> Self {
        self.config.model_context_window = window;
        self
    }

    pub fn with_max_messages_in_memory(mut self, max_messages: usize) -> Self {
        self.config.max_messages_in_memory = Some(max_messages);
        self
    }

    pub fn with_allowed_tools(
        mut self,
        allowed_tools: Arc<tokio::sync::Mutex<HashSet<String>>>,
    ) -> Self {
        self.allowed_tools = allowed_tools;
        self
    }

    /// Pre-seed the per-run correlation id. When set, `run()` will reuse it
    /// instead of minting a fresh UUID. This lets a parent correlate every
    /// event emitted by a child runner (e.g. sub-agent tool calls) with the
    /// parent's stable id (e.g. spawn_id) instead of a random trace.
    pub fn with_trace_id(self, trace_id: String) -> Self {
        if let Ok(mut slot) = self.trace_id.write() {
            *slot = Some(trace_id);
        }
        self
    }

    /// Associate this runner's tool events with the parent spawn/delegation
    /// call that owns the child execution.
    pub fn with_parent_tool_call_id(self, parent_tool_call_id: Option<String>) -> Self {
        if let Ok(mut slot) = self.parent_tool_call_id.write() {
            *slot = parent_tool_call_id;
        }
        self
    }

    pub fn with_child_tool_call_ids(
        mut self,
        child_tool_call_ids: Arc<tokio::sync::Mutex<Vec<String>>>,
    ) -> Self {
        self.child_tool_call_ids = child_tool_call_ids;
        self
    }

    pub fn with_intermediate_commentary(
        mut self,
        intermediate_commentary: Arc<tokio::sync::Mutex<Vec<(u64, String)>>>,
    ) -> Self {
        self.intermediate_commentary = intermediate_commentary;
        self
    }

    /// Record a slice of child commentary against a sequence position, then emit
    /// a live `running` sub-agent step carrying the cumulative commentary so the
    /// Agents panel fills in the child's thinking as it happens instead of only
    /// at completion. No-op for the root run (its text streams live) and for
    /// empty text. `task` is left empty: the frontend preserves it from the
    /// initial running step, and status stays `running` here (terminal status is
    /// owned by the spawn tool's completion emit).
    pub(super) async fn record_and_emit_intermediate_commentary(
        &self,
        sequence: u64,
        text: &str,
        chat_id: &str,
        agent_id: &str,
        agent_name: &str,
    ) {
        if self.depth == 0 {
            return;
        }
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        let segments = {
            let mut commentary = self.intermediate_commentary.lock().await;
            commentary.push((sequence, trimmed.to_string()));
            crate::agent::event_bus::SubagentCommentarySegment::snapshot(&commentary)
        };
        // spawn_id == the child runner's trace_id; required to route the step to
        // the right panel card. Without it the frontend drops the event, so skip
        // the emit rather than create an orphan.
        let Some(spawn_id) = self.trace_id() else {
            return;
        };
        AgentEvent::SubagentStep(crate::agent::event_bus::SubagentStepPayload {
            chat_id: chat_id.to_string(),
            spawn_id,
            parent_tool_call_id: self.parent_tool_call_id(),
            agent_id: agent_id.to_string(),
            agent_name: agent_name.to_string(),
            task: String::new(),
            status: "running".to_string(),
            result_summary: None,
            result_content: None,
            intermediate_content: segments,
            error: None,
            duration_ms: 0,
            timestamp: chrono::Utc::now().to_rfc3339(),
            child_tool_call_ids: None,
        })
        .emit_via(&self.app, &self.on_event);
    }

    pub(super) fn parent_tool_call_id(&self) -> Option<String> {
        self.parent_tool_call_id.read().ok().and_then(|slot| slot.clone())
    }

    pub(super) fn next_event_sequence(&self) -> u64 {
        self.event_sequence.fetch_add(1, Ordering::Relaxed)
    }

    /// The sequence the next event will use, without consuming it. Used to tag
    /// child commentary so it sorts just before the tool cards that follow.
    pub(super) fn peek_event_sequence(&self) -> u64 {
        self.event_sequence.load(Ordering::Relaxed)
    }

    pub(super) async fn record_child_tool_call_id(&self, tool_call_id: String) {
        if self.depth == 0 || tool_call_id.is_empty() {
            return;
        }
        let mut ids = self.child_tool_call_ids.lock().await;
        if !ids.iter().any(|id| id == &tool_call_id) {
            ids.push(tool_call_id);
        }
    }

    pub(super) fn emit(&self, event: AgentEvent) {
        event.emit_via(&self.app, &self.on_event);
    }

    /// Emit a terminal chat error only when this runner owns the chat. A
    /// sub-agent runs under the parent's chat id, so an unconditional
    /// `ChatError` marks the parent's assistant message failed and stops its
    /// stream because a child failed. Child failures already reach the UI
    /// through the spawn tool's terminal subagent-step / `agent:complete`
    /// events.
    pub(super) fn emit_owned_chat_error(
        &self,
        payload: crate::agent::event_bus::ChatErrorPayload,
    ) {
        if self.should_persist_to_parent_chat() {
            self.emit(AgentEvent::ChatError(payload));
        } else {
            tracing::warn!(
                chat_id = %payload.chat_id,
                "Sub-agent run failed; leaving the parent chat stream intact: {}",
                payload.error
            );
        }
    }

    /// Mint a fresh per-run correlation id and store it on the runner.
    /// Called once at the top of `run()`. The returned value is also used
    /// to seed the run's tracing span / logs.
    pub(super) fn begin_trace(&self) -> String {
        // Re-use a pre-seeded trace id so sub-agent runs can be correlated
        // with their parent's stable spawn_id. If none was provided, mint a
        // fresh UUID.
        let id = self.trace_id.read().ok().and_then(|slot| slot.clone()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        if let Ok(mut slot) = self.trace_id.write() {
            *slot = Some(id.clone());
        }
        id
    }

    /// Current per-run correlation id, or `None` before `run()` set it.
    /// Stamped on every emitted event so a full run can be reconstructed.
    pub(super) fn trace_id(&self) -> Option<String> {
        self.trace_id.read().ok().and_then(|slot| slot.clone())
    }

    /// Create a child runner with bounded iterations for sub-agent spawning.
    ///
    /// Children never inherit the parent's direct IPC `Channel` — that
    /// channel is reserved for the parent's own token stream. Child events
    /// flow through `app.emit` (the slow path) so they cannot reorder or
    /// delay the parent's `chat:chunk:first` / `chat:chunk` delivery.
    pub fn child(&self, max_iterations: usize) -> Self {
        Self {
            app: self.app.clone(),
            tool_registry: self.tool_registry.clone(),
            agent_registry: self.agent_registry.clone(),
            hook_registry: self.hook_registry.clone(),
            permissions: self.permissions.clone(),
            tool_manager: self.tool_manager.clone(),
            config: RunConfig {
                max_iterations,
                ..self.config.clone()
            },
            db_pool: self.db_pool.clone(),
            depth: self.depth + 1,
            cache: self.cache.clone(),
            allowed_tools: self.allowed_tools.clone(),
            on_event: None,
            memory_scope: self.memory_scope.clone(),
            // Fresh slot: a child sub-agent run gets its own trace_id when its
            // `run()` fires, so its events don't inherit the parent's trace.
            trace_id: Arc::new(std::sync::RwLock::new(None)),
            parent_tool_call_id: Arc::new(std::sync::RwLock::new(None)),
            event_sequence: Arc::new(AtomicU64::new(0)),
            child_tool_call_ids: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            intermediate_commentary: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            // Children get their own inbox (if any) via with_message_inbox;
            // do not inherit the parent's inbox.
            message_inbox: None,
        }    }
}
