//! `AgentContext` — the handle bundle agent-core code receives instead of
//! reaching into app state (BIG_MIGRATION.md Phase 6 seam, moved into
//! zen-agent in Phase 11).
//!
//! Every service handle field is the SAME `Arc` instance the app's
//! `AppState` owns; the app constructs this struct once in `setup` and
//! manages it. Host-specific capabilities that cannot cross the crate
//! boundary as concrete types are expressed as the ports in [`crate::ports`]
//! (`tool_catalog`, `tool_service`, `tool_manager`, `board`,
//! `graph_sessions`) and implemented over the app's services.
//!
//! The ports (`events`, `secrets`, `settings`, `audit`) bridge to the exact
//! same underlying calls as before the extraction: `TauriEventSink` wraps
//! `AppHandle::emit` with identical name+payload.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::{Mutex, Notify, RwLock};
use tokio_util::sync::CancellationToken;

use zen_core::ports::{AuditSink, EventSink, SecretStore, SettingsStore};

use crate::init_state::InitState;
use crate::ports::{BoardPort, GraphSessionSource, ToolCatalogPort, ToolExecutionPort, ToolPipelinePort};

/// Cooperative pause gate for one chat. Moved verbatim from the app's
/// `commands` module (Phase 11): chat commands create/insert it, agent-core
/// runners wait on it through [`AgentContext::wait_for_chat_resume`].
pub struct ChatPauseControl {
    paused: AtomicBool,
    notify: Notify,
}

impl ChatPauseControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Shared pause-wait core. Returns false only when cancellation wins
    /// while paused.
    pub async fn wait_while_paused(&self, token: &CancellationToken) -> bool {
        while self.is_paused() && !token.is_cancelled() {
            let notified = self.notify.notified();
            if !self.is_paused() {
                break;
            }
            tokio::select! {
                _ = notified => {}
                _ = token.cancelled() => return false,
            }
        }

        !token.is_cancelled()
    }
}

impl Default for ChatPauseControl {
    fn default() -> Self {
        Self::new()
    }
}

/// The seam bundle threaded through runner/orchestrator/deep-research/
/// middleware constructors instead of any host state handle.
#[derive(Clone)]
pub struct AgentContext {
    pub events: Arc<dyn EventSink>,
    pub secrets: Arc<dyn SecretStore>,
    pub settings: Arc<dyn SettingsStore>,
    pub audit: Arc<dyn AuditSink>,

    pub db: Arc<InitState<sqlx::SqlitePool>>,
    pub conversation_store:
        Arc<InitState<Arc<zen_rag::conversation_store::ConversationStore>>>,

    pub next_run_id: Arc<AtomicU64>,
    pub tool_catalog: Arc<dyn ToolCatalogPort>,
    pub tool_service: Arc<dyn ToolExecutionPort>,
    pub tool_manager: Arc<dyn ToolPipelinePort>,
    pub board: Arc<dyn BoardPort>,
    pub session_permissions: Arc<Mutex<HashMap<String, HashMap<String, bool>>>>,
    pub subagent_cancellation_tokens:
        Arc<Mutex<HashMap<String, (String, CancellationToken)>>>,
    pub recall_cache: Arc<Mutex<HashMap<String, (String, String)>>>,
    pub context_breakdown_cache:
        Arc<RwLock<HashMap<String, crate::runner::ContextBreakdownPayload>>>,
    pub skills_manager: Arc<crate::skills::SkillsManager>,
    /// Shares the same handle as the app's `DocumentService.embedding_model`
    /// so background embedding reads the identical model slot.
    pub embedding_model: Arc<RwLock<Option<Box<dyn zen_rag::embedding::EmbeddingModel>>>>,
    pub mcp_discovery: Arc<zen_mcp::McpDiscoveryService>,
    pub graph_sessions: Arc<dyn GraphSessionSource>,
    pub agent_registry: Arc<crate::types::AgentRegistry>,
    pub provider_registry: Arc<zen_llm::ProviderRegistry>,
    pub workspace_folder: Arc<RwLock<PathBuf>>,
    pub pause_controls: Arc<Mutex<HashMap<String, Arc<ChatPauseControl>>>>,
}

impl AgentContext {
    /// Same semantics as the former `AppState::db()`.
    pub async fn db(&self) -> zen_core::ZenResult<sqlx::SqlitePool> {
        self.db.get().await
    }

    /// Same semantics as the former `AppState::provider()` (identical default
    /// + registry).
    pub async fn provider(&self) -> zen_core::ZenResult<Arc<dyn zen_llm::LlmProvider>> {
        let active_provider = self
            .settings
            .get_setting("active_provider")
            .await?
            .unwrap_or_else(|| "ollama".to_string());

        self.provider_registry.create(&active_provider).await
    }

    /// Same semantics as the former `AppState::provider_by_name`.
    pub async fn provider_by_name(
        &self,
        name: &str,
        _db: &sqlx::SqlitePool,
    ) -> zen_core::ZenResult<Arc<dyn zen_llm::LlmProvider>> {
        self.provider_registry.create(name).await
    }

    /// Cooperative pause gate. Identical lock/wait/exit semantics to the
    /// historical `commands::wait_for_chat_resume`; only the control-map
    /// lookup source changed.
    pub async fn wait_for_chat_resume(&self, chat_id: &str, token: &CancellationToken) -> bool {
        let control = self.pause_controls.lock().await.get(chat_id).cloned();

        let Some(control) = control else {
            return !token.is_cancelled();
        };

        control.wait_while_paused(token).await
    }
}
