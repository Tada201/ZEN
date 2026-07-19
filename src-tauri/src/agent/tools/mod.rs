pub mod child_runner;
pub mod handoff_context;
pub mod delegate_to_agent;
pub mod drawing_tools;
pub mod fs_tools;
pub mod geofence_tools;
pub mod graph_session;
pub mod handoff_tools;
pub mod manage_board;
pub mod map_tools;
pub mod osint_tools;
pub mod progressive;
pub mod routing_tools;
pub mod session_memory_tools;
pub mod skill_tool;
pub mod spawn_tools;
pub mod system_tools;
pub mod task_tools;
pub mod terminal_tools;

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[async_trait]
pub trait AgentTool: Send + Sync {
    fn id(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    async fn run(
        &self,
        app: tauri::AppHandle,
        chat_id: String,
        input: Value,
        depth: u32,
        allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
        token: tokio_util::sync::CancellationToken,
    ) -> Result<Value>;

    /// Execution timeout in seconds. Tools can override this for operations
    /// that need more or less time. Default is 45 seconds.
    fn timeout_seconds(&self) -> u64 {
        45
    }
}

#[derive(Clone)]
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn AgentTool>>,
    progressive: Option<Arc<RwLock<crate::agent::tools::progressive::ProgressiveToolRegistry>>>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            progressive: None,
        }
    }

    pub fn with_progressive(
        progressive: Arc<RwLock<crate::agent::tools::progressive::ProgressiveToolRegistry>>,
    ) -> Self {
        let mut tools = HashMap::new();
        if let Ok(prog) = progressive.try_read() {
            for tool in prog.loaded_tool_ids() {
                if let Some(t) = prog.get_tool(&tool) {
                    tools.insert(t.id().to_string(), t);
                }
            }
        }
        Self {
            tools,
            progressive: Some(progressive),
        }
    }

    pub fn progressive(
        &self,
    ) -> Option<Arc<RwLock<crate::agent::tools::progressive::ProgressiveToolRegistry>>> {
        self.progressive.clone()
    }

    pub fn register(&mut self, tool: Arc<dyn AgentTool>) {
        self.tools.insert(tool.id().to_string(), tool);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn AgentTool>> {
        if let Some(tool) = self.tools.get(id) {
            return Some(tool.clone());
        }
        if let Some(prog_arc) = &self.progressive {
            if let Ok(prog) = prog_arc.try_read() {
                if let Some(tool) = prog.get_or_load_tool(id) {
                    return Some(tool);
                }
            }
        }
        None
    }

    pub fn list(&self) -> Vec<Arc<dyn AgentTool>> {
        let mut result: Vec<Arc<dyn AgentTool>> = self.tools.values().cloned().collect();
        if let Some(prog_arc) = &self.progressive {
            if let Ok(prog) = prog_arc.try_read() {
                for tool_id in prog.loaded_tool_ids() {
                    if let Some(t) = prog.get_or_load_tool(&tool_id) {
                        if !result.iter().any(|existing| existing.id() == t.id()) {
                            result.push(t);
                        }
                    }
                }
            }
        }
        result
    }

    pub fn list_as_tool_info(&self) -> Vec<crate::tools::ToolInfo> {
        self.list()
            .into_iter()
            .map(|t| crate::tools::ToolInfo {
                name: t.id().to_string(),
                description: t.description().to_string(),
                parameters: t.input_schema(),
            })
            .collect()
    }
}
