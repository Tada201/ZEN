pub mod agent;
pub mod agent_config;
pub mod artifacts;
pub mod audio;
pub mod canvas;
pub mod chat;
pub mod dependency;
pub mod document;
pub mod mcp;
pub mod memory;
pub mod pagination;
pub mod settings;
pub mod spatial;
pub mod system;
pub mod terminal;
pub mod voice;

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio_util::sync::CancellationToken;

use crate::agent::event_bus::EventBus;
use crate::agent::hooks::HookRegistry;
use crate::agent::orchestrator::Orchestrator;
use crate::agent::swarm::SwarmCoordinator;
use crate::agent::types::AgentRegistry;
use crate::error::{ZenError, ZenResult};
use crate::llm::{LlmProvider, ProviderRegistry};
use crate::services::{
    process_manager::ProcessManager, DocumentService, HardwareService, SecretService,
    SecurityService, SettingsService, SpeechService, TerminalService, ToolService, TtsService,
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

#[allow(clippy::type_complexity)]
pub struct AppState {
    pub db: InitState<SqlitePool>,
    pub llm: InitState<Arc<dyn LlmProvider>>,
    pub tools: crate::tools::GlobalToolRegistry,
    pub tool_registry_v1: Arc<RwLock<crate::agent::tools::ToolRegistry>>,
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
    pub secret_manager: Arc<SecretService>,
    pub security: Arc<SecurityService>,
    pub chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub rag: InitState<Arc<dyn crate::rag::VectorStore>>,
    pub conversation_store: InitState<Arc<crate::rag::conversation_store::ConversationStore>>,
    pub workspace_folder: Arc<RwLock<PathBuf>>,
    pub graph_sessions:
        Arc<tokio::sync::Mutex<HashMap<String, crate::canvas::session::GraphSession>>>,
    pub session_memory: Arc<RwLock<Arc<crate::rag::session_memory::SessionMemoryManager>>>,
    pub mcp_server: Arc<RwLock<crate::mcp::McpServer>>,
    pub pending_tool_approvals:
        Arc<tokio::sync::Mutex<HashMap<String, crate::services::tool::PendingToolApproval>>>,
    pub pending_orchestrator_approvals:
        Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub subagent_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub session_permissions: Arc<tokio::sync::Mutex<HashMap<String, HashMap<String, bool>>>>,
    pub sys_metrics: SysInfoState,
    pub terminal_sessions: Arc<RwLock<crate::terminal::TerminalManager>>,
    pub process_manager: Arc<ProcessManager>,
    pub swarm: Arc<SwarmCoordinator>,
    pub tool_manager: Arc<ToolManager>,
    pub tool_service: Arc<ToolService>,
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
            crate::agent::tools::ToolRegistry::with_progressive(progressive.clone()),
        ));
        let tool_registry_v2 = Arc::new(RwLock::new(crate::tools::init_tool_registry(
            crate::tools::permission::ToolPermissions::default(),
        )));
        let mut agent_registry_inner = AgentRegistry::new();
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
            if path.exists() && path.is_dir()
                && agent_registry_inner.load_from_dir(&path) > 0 {
                    break;
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
            );
        }
        {
            let v1_guard = tool_registry_v1.blocking_read();
            let mut v2_guard = tool_registry_v2.blocking_write();
            if let Some(prog_arc) = v1_guard.progressive() {
                let prog = prog_arc.blocking_read();
                for meta in prog.get_metadata() {
                    if let Some(tool) = prog.get_or_load_tool(&meta.id) {
                        v2_guard.register_legacy_tool(tool);
                    }
                }
            }
            for tool in v1_guard.list() {
                v2_guard.register_legacy_tool(tool);
            }
        }

        let default_workspace = crate::workspace::get_default_workspace();
        let shared_session_memory = Arc::new(
            crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()),
        );
        let process_manager = Arc::new(ProcessManager::new());
        let event_bus = Arc::new(EventBus::default());
        let settings_manager = Arc::new(SettingsService::new());
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

        Self {
            db: InitState::new(),
            llm: InitState::new(),
            tools: tool_registry_v2.clone(),
            tool_registry_v1: tool_registry_v1.clone(),
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
            secret_manager: secret_manager.clone(),
            security,
            chat_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            rag: InitState::new(),
            conversation_store: InitState::new(),
            workspace_folder: Arc::new(RwLock::new(default_workspace.clone())),
            graph_sessions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            session_memory: Arc::new(RwLock::new(shared_session_memory)),
            mcp_server: Arc::new(RwLock::new(crate::mcp::McpServer::new(
                crate::mcp::McpServerConfig::default(),
                tool_registry_v2.clone(),
                None,
            ))),
            pending_tool_approvals,
            pending_orchestrator_approvals: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            subagent_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
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
            swarm: Arc::new(SwarmCoordinator::new(event_bus.clone())),
            orchestrator: InitState::new(),
            geofence_engine: Arc::new(crate::services::gtsm::geofence::GeofenceEngine::new()),
            gtsm_cache: Arc::new(crate::services::gtsm::cache::GtsmCache::new()),
            recall_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            provider_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            provider_registry: Arc::new(ProviderRegistry::new(settings_manager, secret_manager)),
        }
    }

    pub async fn db(&self) -> ZenResult<SqlitePool> {
        self.db.get().await
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
