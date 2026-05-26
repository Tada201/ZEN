use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::agent::tools::AgentTool;

pub(super) struct GuidanceTool;

impl GuidanceTool {
    pub(super) fn new_standalone() -> Self {
        Self
    }
}

#[async_trait]
impl AgentTool for GuidanceTool {
    fn id(&self) -> &str {
        "guidance"
    }

    fn description(&self) -> &str {
        "Provides step-by-step guidance for complex tasks. Use when user needs help understanding a process or learning something."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task or topic the user wants guidance on"
                },
                "context": {
                    "type": "string",
                    "description": "Additional context about what the user is trying to accomplish"
                }
            },
            "required": ["task"]
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let task = input["task"]
            .as_str()
            .ok_or_else(|| anyhow!("task is required"))?;

        let context = input["context"].as_str().unwrap_or("");
        let guidance = generate_guidance(task, context);

        Ok(json!({
            "task": task,
            "guidance": guidance
        }))
    }
}

fn generate_guidance(task: &str, context: &str) -> String {
    let task_lower = task.to_lowercase();

    if task_lower.contains("file") || task_lower.contains("read") || task_lower.contains("write") {
        return format!(
            "For file operations:\n\
             1. Use 'list_directory' to see what files exist in a path\n\
             2. Use 'read_file' to read file contents\n\
             3. Tools require exact file paths\n\nContext: {}",
            fallback_context(context, "No additional context provided")
        );
    }

    if task_lower.contains("map")
        || task_lower.contains("route")
        || task_lower.contains("navigation")
    {
        return format!(
            "For map and routing:\n\
             1. Use 'geocode_search' to convert place names to coordinates\n\
             2. Use 'calculate_route' to get driving directions\n\
             3. Routes include distance, duration, and turn-by-turn summary\n\nContext: {}",
            fallback_context(context, "No additional context provided")
        );
    }

    if task_lower.contains("search") || task_lower.contains("find") {
        return format!(
            "For searching:\n\
             1. Use 'web_search' for current information from the internet\n\
             2. Use 'vector_search' for your private knowledge base\n\
             3. Use 'tools_search' to find available tools\n\nContext: {}",
            fallback_context(context, "No additional context provided")
        );
    }

    if task_lower.contains("system")
        || task_lower.contains("metrics")
        || task_lower.contains("performance")
    {
        return format!(
            "For system monitoring:\n\
             1. Use 'get_system_metrics' for CPU, memory, and network stats\n\
             2. Metrics are retrieved in real-time\n\nContext: {}",
            fallback_context(context, "No specific guidance available for this task")
        );
    }

    format!(
        "Guidance for '{}':\n\
         Use 'tools_search' to discover relevant tools for your specific task.\n\
         Describe what you're trying to accomplish and I'll help identify the right tools.\n\nContext: {}",
        task,
        fallback_context(context, "No additional context provided")
    )
}

fn fallback_context<'a>(context: &'a str, fallback: &'a str) -> &'a str {
    if context.is_empty() {
        fallback
    } else {
        context
    }
}
