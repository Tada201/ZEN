pub mod system;
pub mod terminal;
pub mod document;
pub mod settings;
pub mod chat;
pub mod agent;

use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;
use sqlx::SqlitePool;
use std::path::PathBuf;

use crate::services::{HardwareService, TerminalService, DocumentService, SettingsService, process_manager::ProcessManager};
use crate::llm::LlmProvider;
use crate::error::{ZenResult, ZenError};
use crate::agent::types::AgentRegistry;
use crate::agent::hooks::HookRegistry;
use crate::agent::event_bus::EventBus;
use crate::agent::swarm::SwarmCoordinator;
use crate::agent::orchestrator::Orchestrator;
use crate::agent::memory::UnifiedMemoryBackend;

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
    pub db: Arc<RwLock<Option<SqlitePool>>>,
    pub llm: Arc<RwLock<Option<Arc<dyn LlmProvider>>>>,
    pub tools: crate::tools::GlobalToolRegistry,
    pub tool_registry_v1: Arc<RwLock<crate::agent::tools::ToolRegistry>>,
    pub agent_registry: Arc<AgentRegistry>,
    pub hook_registry: Arc<HookRegistry>,
    pub agent: AgentState,
    pub settings: Arc<RwLock<HashMap<String, String>>>,
    pub hardware: Arc<Mutex<HardwareService>>,
    pub terminal: Arc<TerminalService>,
    pub documents: Arc<DocumentService>,
    pub settings_manager: Arc<SettingsService>,
    pub chat_cancellation_tokens: Arc<tokio::sync::Mutex<HashMap<String, CancellationToken>>>,
    pub rag: Arc<RwLock<Option<Arc<dyn crate::rag::VectorStore>>>>,
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
    pub orchestrator: Arc<RwLock<Option<Arc<Orchestrator>>>>,
    pub memory_backend: Arc<UnifiedMemoryBackend>,
}

impl AppState {
    pub fn new() -> Self {
        let tool_registry_v1 = Arc::new(RwLock::new(crate::agent::tools::ToolRegistry::new()));
        let tool_registry_v2 = Arc::new(RwLock::new(crate::tools::ToolRegistry::new()));
        let default_workspace = crate::workspace::get_default_workspace();
        let shared_session_memory = Arc::new(crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()));
        let process_manager = Arc::new(ProcessManager::new());
        let event_bus = Arc::new(EventBus::default());
        
        Self {
            db: Arc::new(RwLock::new(None)),
            llm: Arc::new(RwLock::new(None)),
            tools: tool_registry_v2.clone(),
            tool_registry_v1: tool_registry_v1.clone(),
            agent_registry: Arc::new(AgentRegistry::new()),
            hook_registry: Arc::new(HookRegistry::new()),
            agent: AgentState { event_bus: event_bus.clone() },
            settings: Arc::new(RwLock::new(HashMap::new())),
            hardware: Arc::new(Mutex::new(HardwareService::new())),
            terminal: Arc::new(TerminalService::new()),
            documents: Arc::new(DocumentService::new()),
            settings_manager: Arc::new(SettingsService::new()),
            chat_cancellation_tokens: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            rag: Arc::new(RwLock::new(None)),
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
            swarm: Arc::new(SwarmCoordinator::new(
                crate::agent::swarm::SwarmTopology::default(),
                event_bus.clone(),
                tool_registry_v2.clone(),
            )),
            orchestrator: Arc::new(RwLock::new(None)),
            memory_backend: {
                let session_memory = Arc::new(crate::rag::session_memory::SessionMemoryManager::new(default_workspace.clone()));
                Arc::new(UnifiedMemoryBackend::new(session_memory))
            },
        }
    }

    pub async fn db(&self) -> ZenResult<SqlitePool> {
        self.db.read().await.clone().ok_or_else(|| ZenError::DatabaseError("Database not initialized".into()))
    }

    pub async fn rag(&self) -> ZenResult<Arc<dyn crate::rag::VectorStore>> {
        self.rag.read().await.clone().ok_or_else(|| ZenError::Custom("RAG not initialized".into()))
    }

    pub async fn provider(&self) -> ZenResult<Arc<dyn LlmProvider>> {
        self.llm.read().await.clone().ok_or_else(|| ZenError::Custom("No LLM provider initialized".into()))
    }
}
