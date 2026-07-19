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
use crate::agent::tools::handoff_context::{
    build_handoff_context, handoff_to_messages, HandoffContext, HandoffContextInput,
};
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
}

/// Resolve which model and iteration limit to use for a given agent.
///
/// Priority: explicit override > agent JSON > active DB setting.
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

    let model = if let Some(m) = explicit_model {
        m.to_string()
    } else {
        agent.model_override.clone().unwrap_or_default()
    };

    let effective_max_steps = if let Some(s) = explicit_max_steps {
        s as usize
    } else {
        agent.max_iterations.unwrap_or(10).max(1)
    };

    let effective_context_window = agent.context_window;
    let effective_max_messages = agent.max_messages_in_memory;

    Ok(ResolvedAgent {
        agent,
        model,
        effective_max_steps,
        effective_context_window,
        effective_max_messages,
    })
}

/// Resolve an ad-hoc, LLM-defined agent that is not in the registry.
///
/// The caller supplies the ceiling of usable tools; the ad-hoc agent inherits
/// that set minus delegation tools (to avoid runaway spawning). If
/// `requested_tools` is non-empty, the result is the intersection with the
/// ceiling — the model can narrow, never widen, its own authority.
/// Execution-time permission checks still gate risky tools.
///
/// If `caller_tool_ids` is empty, the function falls back to the registry's
/// "generalist" agent tool set for backward compatibility.
pub(crate) fn resolve_adhoc_agent(
    agent_registry: &AgentRegistry,
    name: Option<&str>,
    instructions: &str,
    requested_tools: &[String],
    caller_tool_ids: &[String],
    explicit_model: Option<&str>,
    explicit_max_steps: Option<u64>,
) -> Result<ResolvedAgent> {
    if instructions.trim().is_empty() {
        anyhow::bail!("Ad-hoc agent requires non-empty 'instructions'");
    }

    // Ceiling: the caller's tools, minus delegation tools. Fall back to the
    // generalist agent's tools only when no caller ceiling is provided.
    let ceiling: Vec<String> = if caller_tool_ids.is_empty() {
        agent_registry
            .get("generalist")
            .map(|a| a.tool_ids.clone())
            .unwrap_or_default()
    } else {
        caller_tool_ids.to_vec()
    }
    .into_iter()
    .filter(|t| t != "spawn_agent" && t != "handoff_to_agent")
    .collect();

    let tool_ids = if requested_tools.is_empty() {
        ceiling
    } else {
        requested_tools
            .iter()
            .filter(|t| ceiling.contains(t))
            .cloned()
            .collect()
    };

    let agent = Agent {
        id: format!("adhoc-{}", &uuid::Uuid::new_v4().to_string()[..8]),
        name: name.unwrap_or("Ad-hoc Agent").to_string(),
        instructions: instructions.to_string(),
        tool_ids,
        model_override: None,
        max_iterations: explicit_max_steps.map(|s| s as usize),
        context_window: None,
        max_messages_in_memory: None,
        description: Some("LLM-defined ad-hoc sub-agent".to_string()),
        model_tier: crate::agent::types::ModelTier::default(),
    };

    let model = explicit_model
        .map(str::to_string)
        .unwrap_or_default();
    let effective_max_steps = explicit_max_steps.map(|s| s as usize).unwrap_or(10).max(1);

    Ok(ResolvedAgent {
        agent,
        model,
        effective_max_steps,
        effective_context_window: None,
        effective_max_messages: None,
    })
}

/// Build structured handoff context for a child agent.
pub(crate) fn build_subagent_handoff(
    resolved: &ResolvedAgent,
    task: &str,
    caller_context: &str,
    success_criteria: Option<&str>,
    constraints: &[String],
    relevant_files: &[String],
    spawn_depth: u32,
) -> HandoffContext {
    build_handoff_context(HandoffContextInput {
        agent_name: &resolved.agent.name,
        agent_instructions: &resolved.agent.instructions,
        task,
        caller_context,
        success_criteria,
        constraints,
        relevant_files,
        spawn_depth,
    })
}

/// Build the initial child message list from structured handoff context.
pub(crate) fn build_child_messages_from_handoff(handoff: &HandoffContext) -> Vec<ChatMessage> {
    handoff_to_messages(handoff)
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
    let ChildRunnerParams {
        app,
        tool_registry,
        agent_registry,
        hook_registry,
        permissions,
        parent_depth,
        resolved,
        allowed_tools,
    } = params;
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
    } else if !resolved.agent.tool_ids.is_empty() {
        runner = runner.with_allowed_tools(Arc::new(tokio::sync::Mutex::new(
            resolved.agent.tool_ids.iter().cloned().collect(),
        )));
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

#[cfg(test)]
mod tests {
    use super::*;

    fn registry_with_generalist() -> AgentRegistry {
        let mut reg = AgentRegistry::new();
        reg.register(Agent {
            id: "generalist".to_string(),
            name: "ZEN".to_string(),
            instructions: "coordinator".to_string(),
            tool_ids: vec![
                "web_search".to_string(),
                "write_file".to_string(),
                "run_command".to_string(),
                "spawn_agent".to_string(),
                "handoff_to_agent".to_string(),
            ],
            model_override: None,
            max_iterations: None,
            context_window: None,
            max_messages_in_memory: None,
            description: None,
            model_tier: crate::agent::types::ModelTier::default(),
        });
        reg
    }

    #[test]
    fn adhoc_inherits_ceiling_minus_delegation_tools() {
        let reg = registry_with_generalist();
        let caller_tools: Vec<String> = reg
            .get("generalist")
            .map(|a| a.tool_ids.clone())
            .unwrap_or_default();
        let resolved =
            resolve_adhoc_agent(&reg, None, "do a thing", &[], &caller_tools, None, None).unwrap();

        // Inherits coordinator tools but never delegation tools.
        assert!(resolved.agent.tool_ids.contains(&"web_search".to_string()));
        assert!(resolved.agent.tool_ids.contains(&"write_file".to_string()));
        assert!(!resolved.agent.tool_ids.contains(&"spawn_agent".to_string()));
        assert!(!resolved
            .agent
            .tool_ids
            .contains(&"handoff_to_agent".to_string()));
    }

    #[test]
    fn adhoc_requested_tools_are_intersected_with_ceiling() {
        let reg = registry_with_generalist();
        let caller_tools: Vec<String> = reg
            .get("generalist")
            .map(|a| a.tool_ids.clone())
            .unwrap_or_default();
        let requested = vec![
            "web_search".to_string(),
            // Not in the ceiling — must be dropped, not granted.
            "delete_database".to_string(),
            // Delegation tool — never grantable even if requested.
            "spawn_agent".to_string(),
        ];
        let resolved =
            resolve_adhoc_agent(&reg, Some("Scout"), "scout", &requested, &caller_tools, None, None).unwrap();

        assert_eq!(resolved.agent.tool_ids, vec!["web_search".to_string()]);
        assert_eq!(resolved.agent.name, "Scout");
    }

    #[test]
    fn adhoc_requires_instructions() {
        let reg = registry_with_generalist();
        let caller_tools: Vec<String> = reg
            .get("generalist")
            .map(|a| a.tool_ids.clone())
            .unwrap_or_default();
        assert!(resolve_adhoc_agent(&reg, None, "   ", &[], &caller_tools, None, None).is_err());
    }
}
