//! Shared helper for constructing child runners and delegation prompts.
//!
//! Shared setup for child-agent execution: look up the agent, resolve the model,
//! build the delegation prompt, fetch parent context, and create a bounded
//! child `Runner`. The deprecated delegate alias reuses this path.

use anyhow::Result;

use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::runner::{Runner, MAX_SPAWN_DEPTH};
use crate::agent::tools::ToolRegistry;
use crate::agent::types::{Agent, AgentRegistry};
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use crate::tools::GlobalToolRegistry;

/// Resolved agent configuration for spawning a child runner.
pub(crate) struct ResolvedAgent {
    pub agent: Agent,
    pub model: String,
    pub effective_max_steps: usize,
    pub effective_context_window: Option<usize>,
    pub effective_max_messages: Option<usize>,
    pub config_file: Option<crate::agent::config_file::AgentConfigFile>,
}

/// Resolve which model and iteration limit to use for a given agent.
///
/// Priority: explicit override > config file > agent JSON > active DB setting.
pub(crate) fn resolve_agent(
    agent_registry: &AgentRegistry,
    agent_id: &str,
    explicit_model: Option<&str>,
    explicit_max_steps: Option<u64>,
) -> Result<ResolvedAgent> {
    let agent = agent_registry.get(agent_id).cloned().ok_or_else(|| {
        anyhow::anyhow!(
            "Agent '{}' not found. Available: {:?}",
            agent_id,
            agent_registry
                .list()
                .iter()
                .map(|a| &a.id)
                .collect::<Vec<_>>()
        )
    })?;

    let config_file = crate::agent::config_file::load_agent_config(agent_id).ok();

    let model = if let Some(m) = explicit_model {
        m.to_string()
    } else {
        let cfg_model = config_file
            .as_ref()
            .filter(|c| !c.model_name.is_empty())
            .map(|c| c.model_name.clone());

        cfg_model
            .or_else(|| agent.model_override.clone())
            .unwrap_or_default()
    };

    let effective_max_steps = if let Some(s) = explicit_max_steps {
        s as usize
    } else if let Some(ref cfg) = config_file {
        cfg.max_iterations.max(1) as usize
    } else {
        10
    };

    let effective_context_window = config_file
        .as_ref()
        .filter(|c| c.context_window > 0)
        .map(|c| c.context_window as usize)
        .or(agent.context_window);

    let effective_max_messages = config_file
        .as_ref()
        .filter(|c| c.max_messages_in_memory > 0)
        .map(|c| c.max_messages_in_memory as usize);

    Ok(ResolvedAgent {
        agent,
        model,
        effective_max_steps,
        effective_context_window,
        effective_max_messages,
        config_file,
    })
}

/// Build the delegation prompt injected as the final user message.
pub(crate) fn build_delegation_prompt(
    resolved: &ResolvedAgent,
    task: &str,
    context: &str,
) -> String {
    let mut prompt = String::new();

    if !context.is_empty() {
        prompt.push_str(&format!("## Context\n{}\n\n", context));
    }

    prompt.push_str(&format!(
        r#"## Task Delegation

### Your Role
You are {}, a specialized AI agent.
{}

### Task
{}

### Instructions
1. Focus on completing this specific task efficiently
2. Use all your available tools
3. Provide a comprehensive, well-structured result
4. If you need to hand off to another specialist, use handoff_to_agent
"#,
        resolved.agent.name,
        resolved
            .agent
            .instructions
            .lines()
            .take(50)
            .collect::<Vec<_>>()
            .join("\n"),
        task
    ));

    prompt
}

/// Fetch the last N messages from the parent chat for context injection.
pub(crate) async fn fetch_parent_context(
    app: &AppHandle,
    chat_id: &str,
    max_messages: usize,
) -> Vec<ChatMessage> {
    let state = app.state::<AppState>();
    let Ok(db) = state.db().await else {
        return Vec::new();
    };
    let Ok(parent_msgs) = crate::db::queries::get_messages(&db, chat_id).await else {
        return Vec::new();
    };

    parent_msgs
        .into_iter()
        .filter(|m| m.role != "system")
        .rev()
        .take(max_messages)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
            reasoning_details: None,
            images: m.images.as_ref().and_then(|s| serde_json::from_str(s).ok()),
            tool_calls: m
                .tool_calls
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok()),
            tool_call_id: m.tool_call_id,
        })
        .collect()
}

/// Build a fully configured child `Runner` with depth limits, tool
/// permissions, db_pool, and direct IPC channel inherited from a
/// temporary parent runner via `Runner::child()`.
pub(crate) struct ChildRunnerParams<'a> {
    pub app: &'a AppHandle,
    pub tool_registry: Arc<tokio::sync::RwLock<ToolRegistry>>,
    pub agent_registry: Arc<AgentRegistry>,
    pub hook_registry: Arc<HookRegistry>,
    pub permissions: GlobalToolRegistry,
    pub parent_depth: u32,
    pub resolved: &'a ResolvedAgent,
    pub allowed_tools: Option<Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>>,
}

pub(crate) fn build_child_runner(params: ChildRunnerParams<'_>) -> Result<Runner> {
    let ChildRunnerParams { app, tool_registry, agent_registry, hook_registry, permissions, parent_depth, resolved, allowed_tools } = params;
    let state = app.state::<AppState>();
    let tool_manager = state.tool_manager.clone();

    // Build a parent runner first, then call child() to inherit
    // db_pool and on_event channel from the parent context.
    let parent = Runner::new(
        app.clone(),
        tool_registry,
        agent_registry,
        hook_registry,
        permissions,
        tool_manager,
    )
    .with_depth(parent_depth);

    let mut runner = parent.child(resolved.effective_max_steps);

    if let Some(ctx) = resolved.effective_context_window {
        runner = runner.with_max_context_tokens(ctx);
    }

    if let Some(max_msgs) = resolved.effective_max_messages {
        runner = runner.with_max_messages_in_memory(max_msgs);
    }

    if let Some(allowed) = allowed_tools {
        runner = runner.with_allowed_tools(allowed);
    } else if let Some(ref cfg) = resolved.config_file {
        if !cfg.enabled_tools.is_empty() {
            runner = runner.with_allowed_tools(Arc::new(tokio::sync::Mutex::new(
                cfg.enabled_tools.iter().cloned().collect(),
            )));
        }
    }

    Ok(runner)
}

/// Generate a unique memory scope ID for a subagent task.
pub(crate) fn subagent_memory_scope(agent_id: &str, task: &str) -> String {
    use sha2::{Digest, Sha256};
    let task_hash = {
        let mut hasher = Sha256::new();
        hasher.update(task.as_bytes());
        format!("{:x}", hasher.finalize())[..8].to_string()
    };
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("subagent:{}:{}:{}", agent_id, timestamp, task_hash)
}

/// Build the full child message list: parent context + delegation prompt.
pub(crate) async fn build_child_messages(
    app: &AppHandle,
    chat_id: &str,
    delegation_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages = fetch_parent_context(app, chat_id, 10).await;
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: delegation_prompt.to_string(),
        reasoning_details: None,
        images: None,
        tool_calls: None,
        tool_call_id: None,
    });
    messages
}

/// Check depth limit and return error JSON if exceeded.
pub(crate) fn check_depth(depth: u32) -> Result<()> {
    if depth >= MAX_SPAWN_DEPTH {
        return Err(anyhow::anyhow!(
            "Maximum agent nesting depth ({}) reached. Cannot spawn more sub-agents.",
            MAX_SPAWN_DEPTH
        ));
    }
    Ok(())
}
