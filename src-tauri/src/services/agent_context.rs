//! `AgentContext` — the handle bundle agent-core code receives instead of
//! reaching up into `AppState` (BIG_MIGRATION.md Phase 6, re-scoped).
//!
//! Every field is the SAME `Arc` instance `AppState` already owns (or an
//! `Arc` over the same `InitState`), so swapping
//! `app.state::<AppState>().field` for `ctx.field` reads the identical
//! objects — behavior-identical by construction. The ports (`events`,
//! `secrets`, `settings`, `audit`) bridge to the exact same underlying calls:
//! `TauriEventSink` wraps `AppHandle::emit` with identical name+payload.
//!
//! Scope note: this struct intentionally holds typed service handles
//! (`ToolService`, `SkillsManager`, ...) per the plan's Phase 6 spec; full
//! trait-ification of those happens with Phase 11 extraction.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio_util::sync::CancellationToken;

use zen_core::ports::{AuditEvent, AuditSink, EventSink, SecretStore, SettingsStore};
use zen_db::models::AuditLogEntry;

use crate::commands::{AppState, ChatPauseControl, InitState};
use sqlx::SqlitePool;

/// Wraps [`crate::services::SecretService`] behind the async port.
pub struct SecretServicePort(pub Arc<crate::services::SecretService>);

#[async_trait::async_trait]
impl SecretStore for SecretServicePort {
    async fn get_secret(&self, key: &str) -> zen_core::ZenResult<Option<String>> {
        self.0.get_secret(key).await
    }
    async fn set_secret(&self, key: String, value: String) -> zen_core::ZenResult<()> {
        self.0.set_secret(key, value).await
    }
    async fn delete_secret(&self, key: &str) -> zen_core::ZenResult<()> {
        self.0.delete_secret(key).await
    }
}

/// Wraps [`crate::services::SettingsService`] behind the async port.
pub struct SettingsServicePort(pub Arc<crate::services::SettingsService>);

#[async_trait::async_trait]
impl SettingsStore for SettingsServicePort {
    async fn get_setting(&self, key: &str) -> zen_core::ZenResult<Option<String>> {
        self.0.get(key).await
    }

    async fn set_setting(&self, key: String, value: String) -> zen_core::ZenResult<()> {
        self.0.set(key, value).await
    }
}

/// Audit sink sharing the app's DB init lifecycle: persists through the same
/// audit table as [`crate::services::audit_sink::ZenAuditSink`], reusing its
/// row mapping, but resolves the pool lazily so it can be constructed at boot
/// before migrations run. Currently dormant — Phase 8 (zen-mcp) is expected
/// to become the first port-based audit consumer.
struct SharedPoolAuditSink {
    pool: Arc<InitState<SqlitePool>>,
}

impl SharedPoolAuditSink {
    #[allow(dead_code)]
    fn to_entry(event: AuditEvent) -> AuditLogEntry {
        crate::services::audit_sink::to_entry(event)
    }
}

impl AuditSink for SharedPoolAuditSink {
    fn record(&self, event: AuditEvent) {
        let pool_state = self.pool.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                handle.spawn(async move {
                    match pool_state.get().await {
                        Ok(pool) => {
                            let entry = Self::to_entry(event);
                            if let Err(e) =
                                zen_db::queries::add_audit_event(&pool, &entry).await
                            {
                                tracing::warn!(error = %e, "Failed to persist audit-sink event");
                            }
                        }
                        Err(_) => tracing::warn!(
                            action = %event.action,
                            "Audit-sink event dropped: db not initialized yet"
                        ),
                    }
                });
            }
            Err(no_runtime) => tracing::warn!(
                action = %event.action,
                error = %no_runtime,
                "Audit-sink event dropped: no tokio runtime on this thread"
            ),
        }
    }
}

/// The seam bundle threaded through runner/orchestrator/deep-research/
/// middleware constructors instead of `AppHandle.state::<AppState>()`.
#[derive(Clone)]
pub struct AgentContext {
    pub events: Arc<dyn EventSink>,
    pub secrets: Arc<dyn SecretStore>,
    pub settings: Arc<dyn SettingsStore>,
    pub audit: Arc<dyn AuditSink>,

    /// Shares the AppState instance (wrapped in Arc for cloneability).
    pub db: Arc<InitState<SqlitePool>>,
    pub conversation_store:
        Arc<InitState<Arc<crate::rag::conversation_store::ConversationStore>>>,

    pub next_run_id: Arc<AtomicU64>,
    pub tool_service: Arc<crate::services::tool::ToolService>,
    pub tool_manager: Arc<crate::tools::manager::ToolManager>,
    pub session_permissions:
        Arc<Mutex<HashMap<String, HashMap<String, bool>>>>,
    pub subagent_cancellation_tokens:
        Arc<Mutex<HashMap<String, (String, CancellationToken)>>>,
    pub recall_cache: Arc<Mutex<HashMap<String, (String, String)>>>,
    pub context_breakdown_cache:
        Arc<RwLock<HashMap<String, crate::agent::runner::ContextBreakdownPayload>>>,
    pub skills_manager: Arc<crate::agent::skills::SkillsManager>,
    pub documents: Arc<crate::services::DocumentService>,
    pub mcp_discovery: Arc<crate::services::McpDiscoveryService>,
    pub graph_sessions:
        Arc<Mutex<HashMap<String, crate::canvas::session::GraphSession>>>,
    pub agent_registry: Arc<crate::agent::types::AgentRegistry>,
    pub provider_registry: Arc<crate::llm::ProviderRegistry>,
    pub workspace_folder: Arc<RwLock<PathBuf>>,
    pub pause_controls:
        Arc<Mutex<HashMap<String, Arc<ChatPauseControl>>>>,
}

impl AgentContext {
    /// Builds the context from managed state. Call once in `setup`, after
    /// `AppState` is managed. All clones share instances with `AppState`.
    pub fn new(app: &AppHandle) -> Self {
        let state = app.state::<AppState>();
        let state = state.inner();

        Self {
            events: Arc::new(crate::services::event_sink::TauriEventSink::new(
                app.clone(),
            )),
            secrets: Arc::new(SecretServicePort(state.secret_manager.clone())),
            settings: Arc::new(SettingsServicePort(state.settings_manager.clone())),
            audit: Arc::new(SharedPoolAuditSink {
                pool: state.db.clone(),
            }),

            db: state.db.clone(),
            conversation_store: state.conversation_store.clone(),

            next_run_id: state.next_run_id.clone(),
            tool_service: state.tool_service.clone(),
            tool_manager: state.tool_manager.clone(),
            session_permissions: state.session_permissions.clone(),
            subagent_cancellation_tokens: state.subagent_cancellation_tokens.clone(),
            recall_cache: state.recall_cache.clone(),
            context_breakdown_cache: state.context_breakdown_cache.clone(),
            skills_manager: state.skills_manager.clone(),
            documents: state.documents.clone(),
            mcp_discovery: state.mcp_discovery.clone(),
            graph_sessions: state.graph_sessions.clone(),
            agent_registry: state.agent_registry.clone(),
            provider_registry: state.provider_registry.clone(),
            workspace_folder: state.workspace_folder.clone(),
            pause_controls: state.chat_pause_controls.clone(),
        }
    }

    /// Same semantics as `AppState::db()`.
    pub async fn db(&self) -> zen_core::ZenResult<SqlitePool> {
        self.db.get().await
    }

    /// Same semantics as `AppState::provider()` (identical default + registry).
    pub async fn provider(&self) -> zen_core::ZenResult<Arc<dyn crate::llm::LlmProvider>> {
        let active_provider = self
            .settings
            .get_setting("active_provider")
            .await?
            .unwrap_or_else(|| "ollama".to_string());

        self.provider_registry.create(&active_provider).await
    }

    /// Same semantics as `AppState::provider_by_name` (ignores its db arg).
    pub async fn provider_by_name(
        &self,
        name: &str,
        _db: &SqlitePool,
    ) -> zen_core::ZenResult<Arc<dyn crate::llm::LlmProvider>> {
        self.provider_registry.create(name).await
    }

    /// Cooperative pause gate. Identical lock/wait/exit semantics to the
    /// historical `commands::wait_for_chat_resume`; only the control-map
    /// lookup source changed (context field instead of AppState fetch).
    pub async fn wait_for_chat_resume(&self, chat_id: &str, token: &CancellationToken) -> bool {
        let control = self.pause_controls.lock().await.get(chat_id).cloned();

        let Some(control) = control else {
            return !token.is_cancelled();
        };

        control.wait_while_paused(token).await
    }
}

// Re-exported for convenience so domain call sites have one import path.
pub use crate::services::event_sink::TauriEventSink;
