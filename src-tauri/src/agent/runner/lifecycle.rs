use super::config::RunConfig;
use crate::agent::cache::ToolCache;
use crate::agent::event_bus::AgentEvent;
use crate::agent::hooks::HookRegistry;
use crate::agent::tools::ToolRegistry;
use crate::agent::types::AgentRegistry;
use crate::tools::manager::ToolManager;
use crate::tools::GlobalToolRegistry;
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::AppHandle;

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
            cache: Arc::new(tokio::sync::Mutex::new(ToolCache::new(300))),
            allowed_tools: Arc::new(tokio::sync::Mutex::new(HashSet::new())),
            on_event: None,
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
    ) -> Self {
        self.config.voice_mode = voice_mode;
        self.config.display_agent_model = display_agent_model;
        self
    }

    pub fn with_memory_scope(self, _scope: String) -> Self {
        self
    }

    pub fn with_depth(mut self, depth: u32) -> Self {
        self.depth = depth;
        self
    }

    pub fn with_max_iterations(mut self, max_iterations: usize) -> Self {
        self.config.max_iterations = max_iterations;
        self
    }

    pub fn with_max_context_tokens(mut self, max_tokens: usize) -> Self {
        self.config.max_context_tokens = max_tokens;
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

    pub(super) fn emit(&self, event: AgentEvent) {
        event.emit_via(&self.app, &self.on_event);
    }

    /// Create a child runner with bounded iterations for sub-agent spawning.
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
            on_event: self.on_event.clone(),
        }
    }
}
