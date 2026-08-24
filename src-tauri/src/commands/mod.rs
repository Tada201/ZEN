pub mod agent;
pub mod artifacts;
pub mod backup;
pub mod audio;
pub mod browser;
pub mod canvas;
pub mod chat;
pub mod checkpoint;
pub mod compact;
pub mod context_viewer;
pub mod dependency;
pub mod document;
pub mod goal;
pub mod mcp;
pub mod media;
pub mod memory;
pub mod pagination;
pub mod settings;
pub mod skills;
pub mod spatial;
pub mod system;
pub mod terminal;
pub mod voice;
pub mod workbench;

use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify, RwLock};
use tokio_util::sync::CancellationToken;
use tauri::Emitter;

use crate::db::models::ChatMessage;

use crate::agent::event_bus::EventBus;
use crate::agent::hooks::HookRegistry;
use crate::agent::orchestrator::Orchestrator;
use crate::agent::runner::ContextBreakdownPayload;
use crate::agent::swarm::SwarmCoordinator;
use crate::agent::types::AgentRegistry;
use crate::error::{ZenError, ZenResult};
use crate::llm::{LlmProvider, ProviderRegistry};
use crate::services::{
    checkpoint::CheckpointService, process_manager::ProcessManager, DocumentService,
    HardwareService, MediaService, SecretService, SecurityService, SettingsService,
    SpeechService, TerminalService, ToolService, TtsService, UsageService,
};
use crate::tools::manager::ToolManager;

/// Wrapper for lazy-initialized services with validation
pub struct InitState<T> {
    inner: RwLock<Option<T>>,
}

impl<T> InitState<T> {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(None),
        }
    }

    pub async fn get(&self) -> ZenResult<T>
    where
        T: Clone,
    {
        let guard = self.inner.read().await;
        guard.as_ref().cloned().ok_or_else(|| {
            ZenError::Internal(
                "Service not initialized. Ensure initialization completed before use.".into(),
            )
        })
    }

    pub async fn set(&self, value: T) {
        let mut guard = self.inner.write().await;
        *guard = Some(value);
    }

    pub async fn is_initialized(&self) -> bool {
        self.inner.read().await.is_some()
    }
}

impl<T> Default for InitState<T> {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AgentState {
    pub event_bus: Arc<EventBus>,
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            event_bus: Arc::new(EventBus::default()),
        }
    }
}

/// Represents the status of a single initialization phase.
#[derive(Debug, Clone, Serialize)]
pub struct InitPhase {
    pub id: &'static str,
    pub label: &'static str,
    /// "pending", "running", "done", "error", "skipped"
    pub status: &'static str,
    pub elapsed_ms: Option<u64>,
}

impl InitPhase {
    pub const fn new(id: &'static str, label: &'static str) -> Self {
        Self {
            id,
            label,
            status: "pending",
            elapsed_ms: None,
        }
    }
}

/// Snapshot of all init phases for the frontend.
///
/// `critical_complete`  — every `critical.*` phase reached a terminal state
///                        (`done | skipped`). Critical failures should
///                        still block the boot gate.
/// `core_complete`      — `critical_complete` AND `bg.orchestrator` (the
///                        chat-essential background service) reached a
///                        terminal state. This is the readiness signal the
///                        splash UI gates on: chat is usable.
/// `background_complete`— every `bg.*` phase reached a terminal state
///                        (`done | skipped | error`). Informational only;
///                        external/optional subsystems (speech, tts,
///                        lancedb, conversation_store, rag) can be
///                        unavailable without blocking the app. See lib.rs
///                        setup(): "the app works without them being
///                        fully ready".
#[derive(Debug, Clone, Serialize)]
pub struct InitStatus {
    pub phases: Vec<InitPhase>,
    pub critical_complete: bool,
    pub core_complete: bool,
    pub background_complete: bool,
}

/// Shared mutable tracker for init progress.
pub struct InitProgress {
    pub phases: tokio::sync::RwLock<Vec<std::sync::Mutex<InitPhase>>>,
}

impl InitProgress {
    pub fn new(phases: Vec<InitPhase>) -> Self {
        Self {
            phases: tokio::sync::RwLock::new(
                phases.into_iter().map(std::sync::Mutex::new).collect(),
            ),
        }
    }

    pub async fn snapshot(&self) -> InitStatus {
        let guard = self.phases.read().await;
        let mut critical_complete = true;
        let mut background_complete = true;
        let mut orchestrator_terminal = false;
        let phases: Vec<InitPhase> = guard.iter().map(|m| m.lock().unwrap().clone()).collect();
        for p in &phases {
            if p.id.starts_with("critical.") && p.status != "done" && p.status != "skipped" {
                critical_complete = false;
            }
            // The orchestrator is the only core background service — chat is
            // unusable without it. Other `bg.*` phases (speech, tts, lancedb,
            // conversation_store, rag) are external/optional and may be
            // `error` (e.g. LanceDB can't mount on this machine) without
            // blocking the boot gate.
            if p.id == "bg.orchestrator"
                && (p.status == "done" || p.status == "skipped" || p.status == "error")
            {
                orchestrator_terminal = true;
            }
            if p.id.starts_with("bg.") && p.status != "done" && p.status != "skipped" && p.status != "error" {
                background_complete = false;
            }
        }
        InitStatus {
            phases,
            critical_complete,
            core_complete: critical_complete && orchestrator_terminal,
            background_complete,
        }
    }

    pub async fn set_status(&self, app: &tauri::AppHandle, id: &str, status: &'static str, elapsed_ms: Option<u64>) {
        {
            let guard = self.phases.read().await;
            if let Some(mutex) = guard.iter().find(|m| m.lock().unwrap().id == id) {
                let mut phase = mutex.lock().unwrap();
                phase.status = status;
                if let Some(ms) = elapsed_ms {
                    phase.elapsed_ms = Some(ms);
                }
            }
        }
        // Emit snapshot update event to all webview listeners
        let snap = self.snapshot().await;
        let _ = app.emit("init-status-update", snap);
    }
}

pub struct SysInfoState {
    pub system: RwLock<sysinfo::System>,
    pub networks: RwLock<sysinfo::Networks>,
    pub disks: RwLock<sysinfo::Disks>,
    pub hardware: Arc<RwLock<Option<HardwareService>>>,
}

impl Default for SysInfoState {
    fn default() -> Self {
        Self::new()
    }
}

impl SysInfoState {
    pub fn new() -> Self {
        Self {
            system: RwLock::new(sysinfo::System::new_all()),
            networks: RwLock::new(sysinfo::Networks::new_with_refreshed_list()),
            disks: RwLock::new(sysinfo::Disks::new_with_refreshed_list()),
            hardware: Arc::new(RwLock::new(None)),
        }
    }
}

/// Boot handoff flags — the single source of truth for "may the splash
/// dismiss and the main window become visible".
///
/// Both signals must be `true` for the canonical Tauri splash → main
/// transition (see https://v2.tauri.app/learn/splashscreen/):
/// * `backend_ready`  — critical init + bg.orchestrator (chat-essential)
///   reached terminal state (set in lib.rs).
/// * `frontend_ready` — the React app called `set_complete("frontend")`
///   after its own init hook (useAppInit) finished.
pub struct SetupFlags {
    pub frontend_ready: bool,
    pub backend_ready: bool,
}

impl SetupFlags {
    pub fn new() -> Self {
        Self {
            frontend_ready: false,
            backend_ready: false,
        }
    }

    pub fn both_ready(&self) -> bool {
        self.frontend_ready && self.backend_ready
    }
}

impl Default for SetupFlags {
    fn default() -> Self {
        Self::new()
    }
}

/// Cooperative pause gate for one active chat execution.
///
/// Pausing never cancels the request or discards approvals/checkpoints. Runners
/// observe this gate at safe iteration/tool boundaries and wait until the
/// matching continue command releases them.
pub struct ChatPauseControl {
    paused: std::sync::atomic::AtomicBool,
    notify: Notify,
}

impl ChatPauseControl {
    pub fn new() -> Self {
        Self {
            paused: std::sync::atomic::AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, std::sync::atomic::Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Phase 6: shared pause-wait core, extracted verbatim from the
    /// historical `wait_for_chat_resume` loop so both the legacy AppHandle
    /// wrapper and `AgentContext::wait_for_chat_resume` share one body.
    /// Returns false only when cancellation wins while paused.
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

// Phase 6: the former `wait_for_chat_resume` AppHandle wrapper was deleted —
// its logic core lives on `ChatPauseControl::wait_while_paused` and every
// caller reaches it via `AgentContext::wait_for_chat_resume`.

#[allow(clippy::type_complexity)]
pub struct AppState {
    /// Wrapped in `Arc` so `AgentContext` can share the same instance
    /// (Phase 6 seam); `Deref` keeps every existing call site identical.
    pub db: Arc<InitState<SqlitePool>>,
    pub llm: InitState<Arc<dyn LlmProvider>>,
    pub tools: crate::tools::GlobalToolRegistry,
    pub tool_registry_v1: Arc<RwLock<crate::agent::tools::ToolRegistry>>,
    pub skills_manager: Arc<crate::agent::skills::SkillsManager>,
    pub agent_registry: Arc<AgentRegistry>,
    pub hook_registry: Arc<HookRegistry>,
    pub agent: AgentState,
    pub settings: Arc<RwLock<HashMap<String, String>>>,
    pub hardware: Arc<Mutex<HardwareService>>,
    pub terminal: Arc<TerminalService>,
    pub documents: Arc<DocumentService>,
    pub speech: Arc<tokio::sync::RwLock<Option<SpeechService>>>,
    pub tts: Arc<tokio::sync::RwLock<Option<TtsService>>>,
    pub settings_manager: Arc<SettingsService>,
    pub media: Arc<MediaService>,
    pub secret_manager: Arc<SecretService>,
    pub security: Arc<SecurityService>,
    pub chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub chat_pause_controls: Arc<tokio::sync::Mutex<HashMap<String, Arc<ChatPauseControl>>>>,
    pub rag: InitState<Arc<dyn crate::rag::VectorStore>>,
    /// Arc-shared with `AgentContext` (Phase 6 seam); `Deref`-transparent.
    pub conversation_store: Arc<InitState<Arc<crate::rag::conversation_store::ConversationStore>>>,
    pub workspace_folder: Arc<RwLock<PathBuf>>,
    pub graph_sessions:
        Arc<tokio::sync::Mutex<HashMap<String, crate::canvas::session::GraphSession>>>,
    pub session_memory: Arc<RwLock<Arc<crate::rag::session_memory::SessionMemoryManager>>>,
    pub mcp_client: Arc<crate::mcp::McpClient>,
    pub mcp_config: Arc<crate::services::McpConfigService>,
    pub mcp_discovery: Arc<crate::services::McpDiscoveryService>,
    pub mcp_consent: Arc<crate::services::McpConsentStore>,
    pub pending_tool_approvals:
        Arc<tokio::sync::Mutex<HashMap<String, crate::services::tool::PendingToolApproval>>>,
    pub pending_orchestrator_approvals:
        Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    /// Per-sub-agent cancellation tokens, paired with the owning `chat_id` so a
    /// cancel request can be verified against the chat that spawned it.
    pub subagent_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, (String, CancellationToken)>>>,
    /// Per-sub-agent message inbox for parent→child message injection.
    /// Keyed by the sub-agent's `spawn_id`, the queue holds `ChatMessage`s
    /// that the child runner drains into its conversation each iteration.
    pub subagent_message_queues:
        Arc<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<std::collections::VecDeque<ChatMessage>>>>>>,
    pub session_permissions: Arc<tokio::sync::Mutex<HashMap<String, HashMap<String, bool>>>>,
    pub sys_metrics: SysInfoState,
    pub terminal_sessions: Arc<RwLock<crate::terminal::TerminalManager>>,
    pub process_manager: Arc<ProcessManager>,
    pub swarm: Arc<SwarmCoordinator>,
    pub tool_manager: Arc<ToolManager>,
    pub tool_service: Arc<ToolService>,
    pub checkpoints: Arc<CheckpointService>,
    pub orchestrator: InitState<Arc<Orchestrator>>,
    pub geofence_engine: Arc<crate::services::gtsm::geofence::GeofenceEngine>,
    pub gtsm_cache: Arc<crate::services::gtsm::cache::GtsmCache>,
    /// Per-chat cached recall context from the previous turn.
    /// Keyed by chat_id; value is (recall_block, last_user_msg_text).
    /// Populated in background after each LLM response; consumed on the NEXT message's iteration-1.
    pub recall_cache: Arc<tokio::sync::Mutex<HashMap<String, (String, String)>>>,
    pub provider_cache:
        Arc<tokio::sync::Mutex<HashMap<String, (Arc<dyn LlmProvider>, std::time::Instant)>>>,
    pub provider_registry: Arc<ProviderRegistry>,
    pub init_progress: Arc<InitProgress>,
    /// Single-source-of-truth boot handoff flags. Both must be true before
    /// Rust closes the splash window and shows the main window. See
    /// `SetupFlags` for the contract.
    pub setup_flags: Arc<tokio::sync::Mutex<SetupFlags>>,
    /// Per-chat context breakdown cache. The `bridge_to_ui` task in
    /// `event_bus.rs` clones the latest `ContextBreakdownPayload` keyed
    /// by `chat_id` on every `context:breakdown` event so the
    /// `get_context_breakdown` / `get_context_snapshot` Tauri commands
    /// can hydrate the right-panel on cold start (before any live
    /// event would have arrived). Keyed by chat_id; newest entry wins;
    /// never evicted deliberately — bounded by chat history. The
    /// payload carries a `run_id` so the frontend dedupes by
    /// `(chat_id, run_id, iteration)` across runs and never loses a
    /// later, shorter run to an earlier, longer one.
    pub context_breakdown_cache:
        Arc<tokio::sync::RwLock<HashMap<String, ContextBreakdownPayload>>>,
    /// Monotonic per-run counter. Mints a fresh `run_id` for every
    /// invocation of `Runner::run()`; the value is carried on every
    /// `ContextBreakdownPayload` emitted during that run so the
    /// frontend `useContextStore` can dedupe emissions by
    /// `(chat_id, run_id, iteration)` instead of `iteration` alone.
    /// Starts at 0 so the first run is observable in the UI.
    pub next_run_id: Arc<AtomicU64>,
    pub usage: Arc<UsageService>,
    /// Embedded WebView2 browser-preview lifecycle (Windows-native panel).
    pub browser: Arc<crate::browser::BrowserManager>,
}


impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let progressive = Arc::new(RwLock::new(
            crate::agent::tools::progressive::ProgressiveToolRegistry::new(),
        ));
        let tool_registry_v1 = Arc::new(RwLock::new(
            crate::agent::tools::ToolRegistry::with_lazy_source(Arc::new(
                crate::agent::tools::ProgressiveToolSource::new(progressive.clone()),
            )),
        ));
        // SkillsManager uses the OS home dir for ~/.zen/skills/ discovery.
        let skills_manager = Arc::new(
            crate::agent::skills::SkillsManager::new(dirs::home_dir().unwrap_or_default()),
        );
        let tool_registry_v2 = Arc::new(RwLock::new(crate::tools::init_tool_registry(
            crate::tools::permission::ToolPermissions::default(),
        )));
        let agent_registry_inner = AgentRegistry::new();
        let mut paths_to_try = vec![
            std::path::PathBuf::from("resources/agents"),
            std::path::PathBuf::from("src-tauri/resources/agents"),
            std::path::PathBuf::from("../resources/agents"),
        ];
        if let Ok(curr) = std::env::current_dir() {
            paths_to_try.push(curr.join("resources").join("agents"));
            paths_to_try.push(curr.join("src-tauri").join("resources").join("agents"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                paths_to_try.push(parent.join("resources").join("agents"));
                if let Some(p2) = parent.parent() {
                    paths_to_try.push(p2.join("resources").join("agents"));
                }
            }
        }
        for path in paths_to_try {
            if path.exists() && path.is_dir() && agent_registry_inner.load_from_dir(&path) > 0 {
                break;
            }
        }
        agent_registry_inner.mark_loaded_as_builtin();
        if let Some(config_dir) = dirs::config_dir() {
            let user_agent_dir = config_dir.join("zen").join("agents");
            if let Err(error) = agent_registry_inner.configure_user_dir(user_agent_dir) {
                tracing::warn!(error = %error, "User agent configuration could not be initialized");
            }
        }
        let agent_registry = Arc::new(agent_registry_inner);
        let hook_registry = Arc::new(HookRegistry::new());

        {
            let mut prog = progressive.blocking_write();
            prog.setup_tools_search(progressive.clone());
            prog.setup_list_tools(progressive.clone());
            prog.setup_agent_tools(
                tool_registry_v1.clone(),
                agent_registry.clone(),
                hook_registry.clone(),
                tool_registry_v2.clone(),
                skills_manager.clone(),
            );
        }
        {
            let v1_guard = tool_registry_v1.blocking_read();
            let mut v2_guard = tool_registry_v2.blocking_write();
            if let Some(lazy) = v1_guard.lazy_source() {
                for meta in lazy.metadata() {
                    if let Some(tool) = lazy.get_or_load(&meta.id) {
                        v2_guard.register_legacy_tool(tool);
                    }
                }
            }
            for tool in v1_guard.list() {
                v2_guard.register_legacy_tool(tool);
            }
        }

        let default_workspace = crate::workspace::get_default_workspace();
        let workspace_folder_arc = Arc::new(RwLock::new(default_workspace.clone()));
        let shared_session_memory = Arc::new(
            crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()),
        );
        let process_manager = Arc::new(ProcessManager::new());
        let event_bus = Arc::new(EventBus::default());
        let settings_manager = Arc::new(SettingsService::new());
        let media = Arc::new(MediaService::new());
        let security = Arc::new(SecurityService::new());
        let secret_manager = Arc::new(SecretService::new(
            settings_manager.clone(),
            security.clone(),
        ));
        let pending_tool_approvals = Arc::new(tokio::sync::Mutex::new(HashMap::new()));
        let tool_service = Arc::new(ToolService::new(
            tool_registry_v2.clone(),
            security.clone(),
            pending_tool_approvals.clone(),
        ));
        let checkpoints = Arc::new(CheckpointService::new());

        let security_for_mcp_config = security.clone();
        let mcp_config = Arc::new(crate::services::McpConfigService::new(
            workspace_folder_arc.clone(),
            security_for_mcp_config,
        ));
        let mcp_discovery = Arc::new(crate::services::McpDiscoveryService::new(mcp_config.clone()));
        let mcp_consent = Arc::new(crate::services::McpConsentStore::new(security.clone()));
        // Phase 8: registrar port wraps the v2 registry; the client's Weak
        // back-reference is wired right after the Arc exists (cycle break).
        let mcp_registrar = Arc::new(crate::services::mcp_registrar::McpRegistrar::new(
            tool_registry_v2.clone(),
        ));

        Self {
            db: Arc::new(InitState::new()),
            llm: InitState::new(),
            tools: tool_registry_v2.clone(),
            tool_registry_v1: tool_registry_v1.clone(),
            skills_manager: skills_manager.clone(),
            agent_registry: agent_registry.clone(),
            hook_registry: hook_registry.clone(),
            agent: AgentState {
                event_bus: event_bus.clone(),
            },
            settings: Arc::new(RwLock::new(HashMap::new())),
            hardware: Arc::new(Mutex::new(HardwareService::new())),
            terminal: Arc::new(TerminalService::new()),
            documents: Arc::new(DocumentService::new()),
            speech: Arc::new(tokio::sync::RwLock::new(None)),
            tts: Arc::new(tokio::sync::RwLock::new(None)),
            settings_manager: settings_manager.clone(),
            media,
            secret_manager: secret_manager.clone(),
            security: security.clone(),
            chat_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            chat_pause_controls: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            rag: InitState::new(),
            conversation_store: Arc::new(InitState::new()),
            workspace_folder: workspace_folder_arc.clone(),
            graph_sessions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            session_memory: Arc::new(RwLock::new(shared_session_memory)),
            mcp_config: mcp_config.clone(),
            mcp_client: {
                let client = Arc::new(crate::mcp::McpClient::new(
                    mcp_registrar.clone(),
                    mcp_config.clone(),
                    mcp_discovery.clone(),
                    security.clone(),
                    secret_manager.clone(),
                    mcp_consent.clone(),
                ));
                mcp_registrar.set_client_weak(&client);
                client
            },
            mcp_discovery,
            mcp_consent,
            pending_tool_approvals,
            pending_orchestrator_approvals: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            subagent_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            subagent_message_queues: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            session_permissions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            sys_metrics: SysInfoState::new(),
            terminal_sessions: Arc::new(RwLock::new(
                crate::terminal::TerminalManager::with_process_manager(process_manager.clone()),
            )),
            process_manager,
            tool_manager: Arc::new(ToolManager::new(
                tool_registry_v1.clone(),
                tool_registry_v2.clone(),
            )),
            tool_service: tool_service.clone(),
            checkpoints,
            swarm: Arc::new(SwarmCoordinator::new()),
            orchestrator: InitState::new(),
            geofence_engine: Arc::new(crate::services::gtsm::geofence::GeofenceEngine::new()),
            gtsm_cache: Arc::new(crate::services::gtsm::cache::GtsmCache::new()),
            recall_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            provider_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            provider_registry: Arc::new(ProviderRegistry::new(settings_manager, secret_manager)),
            init_progress: Arc::new(InitProgress::new(vec![
                InitPhase::new("critical.fs", "File system"),
                InitPhase::new("critical.db", "Database"),
                InitPhase::new("critical.settings", "Settings"),
                InitPhase::new("critical.finalize", "Services"),
                InitPhase::new("bg.speech", "Speech recognition"),
                InitPhase::new("bg.tts", "Text-to-speech"),
                InitPhase::new("bg.lancedb", "Vector store"),
                InitPhase::new("bg.conversation_store", "Conversation store"),
                InitPhase::new("bg.rag", "Embeddings"),
                InitPhase::new("bg.orchestrator", "Orchestrator"),
            ])),
            setup_flags: Arc::new(tokio::sync::Mutex::new(SetupFlags::new())),
            context_breakdown_cache: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
            next_run_id: Arc::new(AtomicU64::new(0)),
            usage: Arc::new(UsageService),
            browser: Arc::new(crate::browser::BrowserManager::new()),
        }
    }

    pub async fn db(&self) -> ZenResult<SqlitePool> {
        self.db.get().await
    }

    /// Resolve the workspace used by a chat execution without mutating the
    /// process-wide workspace setting. Legacy chats with no stored root use
    /// the current global workspace as an explicit compatibility fallback.
    pub async fn workspace_for_chat(&self, chat_id: &str) -> ZenResult<PathBuf> {
        let global_workspace = self.workspace_folder.read().await.clone();
        let db = self.db().await?;
        let chat = crate::db::queries::get_chat(&db, chat_id).await?;

        match chat.workspace_root {
            Some(root) if !root.trim().is_empty() =>
                crate::workspace::canonicalize_workspace_root(std::path::Path::new(&root))
                    .map_err(|e| ZenError::Custom(format!("Invalid session workspace root: {}", e))),
            _ => Ok(global_workspace),
        }
    }

    pub async fn rag(&self) -> ZenResult<Arc<dyn crate::rag::VectorStore>> {
        self.rag.get().await
    }

    pub async fn provider(&self) -> ZenResult<Arc<dyn LlmProvider>> {
        let active_provider = self
            .settings_manager
            .get("active_provider")
            .await?
            .unwrap_or_else(|| "ollama".to_string());

        self.provider_registry.create(&active_provider).await
    }

    pub async fn provider_by_name(
        &self,
        name: &str,
        db: &SqlitePool,
    ) -> ZenResult<Arc<dyn LlmProvider>> {
        let _ = db;
        self.provider_registry.create(name).await
    }

    pub async fn get_provider(&self) -> ZenResult<Arc<dyn LlmProvider>> {
        self.provider().await
    }

    pub async fn set_workspace_folder(&self, path: impl AsRef<std::path::Path>) -> ZenResult<()> {
        let canonical = crate::workspace::canonicalize_workspace_root(path.as_ref())
            .map_err(|e| ZenError::Custom(format!("Invalid workspace root: {}", e)))?;

        {
            let mut workspace = self.workspace_folder.write().await;
            *workspace = canonical.clone();
        }

        {
            let mut session_memory = self.session_memory.write().await;
            *session_memory = Arc::new(crate::rag::session_memory::SessionMemoryManager::new(
                canonical.clone(),
            ));
        }

        tracing::info!(workspace = %canonical.display(), "Live workspace root updated");
        Ok(())
    }

    pub async fn search_rag(
        &self,
        query_vec: Vec<f32>,
        limit: usize,
    ) -> ZenResult<Vec<crate::rag::SearchResult>> {
        let rag = self.rag.get().await?;
        rag.search(query_vec, limit)
            .await
            .map_err(|e| ZenError::Custom(format!("RAG search failed: {}", e)))
    }
}
