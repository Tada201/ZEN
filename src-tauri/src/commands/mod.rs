pub mod system;
pub mod terminal;
pub mod document;
pub mod settings;
pub mod chat;
pub mod agent;
pub mod voice;
pub mod canvas;
pub mod spatial;

use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;
use sqlx::SqlitePool;
use std::path::PathBuf;

use crate::services::{HardwareService, TerminalService, DocumentService, SettingsService, SpeechService, TtsService, process_manager::ProcessManager};
use crate::llm::LlmProvider;
use crate::error::{ZenResult, ZenError};
use crate::agent::types::AgentRegistry;
use crate::agent::hooks::HookRegistry;
use crate::agent::event_bus::EventBus;
use crate::agent::swarm::SwarmCoordinator;
use crate::tools::manager::ToolManager;
use crate::agent::orchestrator::Orchestrator;
use crate::agent::memory::UnifiedMemoryBackend;

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
    where T: Clone {
        let guard = self.inner.read().await;
        guard.as_ref().cloned().ok_or_else(|| {
            ZenError::Internal("Service not initialized. Ensure initialization completed before use.".into())
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
    pub chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub rag: InitState<Arc<dyn crate::rag::VectorStore>>,
    pub workspace_folder: Arc<RwLock<PathBuf>>,
    pub graph_sessions: Arc<tokio::sync::Mutex<HashMap<String, crate::canvas::session::GraphSession>>>,
    pub session_memory: Arc<RwLock<Arc<crate::rag::session_memory::SessionMemoryManager>>>,
    pub mcp_server: Arc<RwLock<crate::mcp::McpServer>>,
    pub pending_tool_approvals: Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub pending_orchestrator_approvals: Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub subagent_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub session_permissions: Arc<tokio::sync::Mutex<HashMap<String, HashMap<String, bool>>>>,
    pub sys_metrics: SysInfoState,
    pub terminal_sessions: Arc<RwLock<crate::terminal::TerminalManager>>,
    pub process_manager: Arc<ProcessManager>,
    pub swarm: Arc<SwarmCoordinator>,
    pub tool_manager: Arc<ToolManager>,
    pub orchestrator: InitState<Arc<Orchestrator>>,
    pub memory_backend: Arc<UnifiedMemoryBackend>,
    pub geofence_engine: Arc<crate::services::gtsm::geofence::GeofenceEngine>,
    pub gtsm_cache: Arc<crate::services::gtsm::cache::GtsmCache>,
}

impl AppState {
    pub fn new() -> Self {
        let progressive = Arc::new(RwLock::new(crate::agent::tools::progressive::ProgressiveToolRegistry::new()));
        let tool_registry_v1 = Arc::new(RwLock::new(crate::agent::tools::ToolRegistry::with_progressive(progressive.clone())));
        let tool_registry_v2 = Arc::new(RwLock::new(crate::tools::ToolRegistry::new()));
        let agent_registry = Arc::new(AgentRegistry::new());
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

        let default_workspace = crate::workspace::get_default_workspace();
        let shared_session_memory = Arc::new(crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()));
        let process_manager = Arc::new(ProcessManager::new());
        let event_bus = Arc::new(EventBus::default());

        Self {
            db: InitState::new(),
            llm: InitState::new(),
            tools: tool_registry_v2.clone(),
            tool_registry_v1: tool_registry_v1.clone(),
            agent_registry: agent_registry.clone(),
            hook_registry: hook_registry.clone(),
            agent: AgentState { event_bus: event_bus.clone() },
            settings: Arc::new(RwLock::new(HashMap::new())),
            hardware: Arc::new(Mutex::new(HardwareService::new())),
            terminal: Arc::new(TerminalService::new()),
            documents: Arc::new(DocumentService::new()),
            speech: Arc::new(tokio::sync::RwLock::new(None)),
            tts: Arc::new(tokio::sync::RwLock::new(None)),
            settings_manager: Arc::new(SettingsService::new()),
            chat_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            rag: InitState::new(),
            workspace_folder: Arc::new(RwLock::new(default_workspace.clone())),
            graph_sessions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            session_memory: Arc::new(RwLock::new(shared_session_memory)),
            mcp_server: Arc::new(RwLock::new(crate::mcp::McpServer::new(
                crate::mcp::McpServerConfig::default(),
                tool_registry_v2.clone(),
                None,
            ))),
            pending_tool_approvals: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            pending_orchestrator_approvals: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            subagent_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            session_permissions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            sys_metrics: SysInfoState::new(),
            terminal_sessions: Arc::new(RwLock::new(crate::terminal::TerminalManager::with_process_manager(process_manager.clone()))),
            process_manager,
            tool_manager: Arc::new(ToolManager::new(
                tool_registry_v1.clone(),
                tool_registry_v2.clone(),
            )),
            swarm: Arc::new(SwarmCoordinator::new(
                crate::agent::swarm::SwarmTopology::default(),
                event_bus.clone(),
                tool_registry_v2.clone(),
            )),
            orchestrator: InitState::new(),
            memory_backend: {
                let session_memory = Arc::new(crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()));
                Arc::new(UnifiedMemoryBackend::new(session_memory))
            },
            geofence_engine: Arc::new(crate::services::gtsm::geofence::GeofenceEngine::new()),
            gtsm_cache: Arc::new(crate::services::gtsm::cache::GtsmCache::new()),
        }
    }

    pub async fn db(&self) -> ZenResult<SqlitePool> {
        self.db.get().await.map(|p| p.clone())
    }

    pub async fn rag(&self) -> ZenResult<Arc<dyn crate::rag::VectorStore>> {
        self.rag.get().await.map(|r| r.clone())
    }

    pub async fn provider(&self) -> ZenResult<Arc<dyn LlmProvider>> {
        let db = self.db().await?;
        let active_provider = crate::db::queries::get_setting(&db, "active_provider")
            .await
            .unwrap_or_default()
            .unwrap_or_else(|| "ollama".to_string());
        Ok(crate::llm::create_provider(&db, &active_provider).await)
        
    }

    pub async fn get_provider(&self) -> ZenResult<Arc<dyn LlmProvider>> {
        self.provider().await
    }

    pub async fn search_rag(&self, query_vec: Vec<f32>, limit: usize) -> ZenResult<Vec<crate::rag::SearchResult>> {
        let rag = self.rag.get().await?;
        rag.search(query_vec, limit).await.map_err(|e| ZenError::Custom(format!("RAG search failed: {}", e).into()))
    }
}
