//! Shared helper for constructing child runners and delegation prompts.
//!
//! Shared setup for child-agent execution: look up the agent, resolve the model,
//! build the delegation prompt, fetch parent context, and create a bounded
//! child `Runner`. The deprecated delegate alias reuses this path.

use anyhow::Result;

use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::agent::hooks::HookRegistry;
use crate::agent::runner::Runner;
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
    pub model_provider: Option<String>,
    pub effective_max_steps: usize,
    pub effective_context_window: Option<usize>,
    pub effective_max_messages: Option<usize>,
    pub inject_agents_md: bool,
}

/// Treat blank strings and the `inherit` sentinel as "no selection" so a child
/// never inherits an unusable model id. Callers pass values straight from tool
/// arguments and agent JSON, both of which can be empty or null.
fn selected_model(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|model| !model.is_empty() && !model.eq_ignore_ascii_case("inherit"))
        .map(str::to_string)
}

/// Map a retired built-in agent id onto its current replacement so explicit
/// `spawn_agent { agent_id: "researcher" }` calls (from older prompts, persisted
/// plans, or user habit) keep working after the roster was trimmed to
/// generalist / explore / voice_display. Unknown ids pass through unchanged and
/// still produce the normal "not found" error.
fn canonical_agent_id(agent_id: &str) -> &str {
    match agent_id {
        // ZEN-DOCS / research specialist folded into the read-only Explore agent.
        "researcher" | "ZEN-DOCS" => "explore",
        // ZEN-TAC operational specialist retired; general coordinator absorbs it.
        "operational_expert" | "ZEN-TAC" => "generalist",
        other => other,
    }
}

/// Resolve which model and iteration limit to use for a given agent.
///
/// Priority: explicit override > agent JSON > `fallback_model` (the model the
/// parent turn is running on). Built-in profiles ship with `model_override:
/// null`, so without the fallback a child would launch with an empty model id
/// and the provider would reject the request.
pub(crate) fn resolve_agent(
    agent_registry: &AgentRegistry,
    agent_id: &str,
    explicit_model: Option<&str>,
    fallback_model: Option<&str>,
    explicit_max_steps: Option<u64>,
) -> Result<ResolvedAgent> {
    let agent_id = canonical_agent_id(agent_id);
    let profile = agent_registry.get_profile(agent_id).ok_or_else(|| {
        anyhow::anyhow!(
            "Agent '{}' not found. Available: {:?}",
            agent_id,
            agent_registry.list().into_iter().map(|a| a.id).collect::<Vec<_>>()
        )
    })?;
    if !profile.model_invocable {
        anyhow::bail!("Agent '{}' is not available for model invocation", agent_id);
    }
    let explicit = selected_model(explicit_model);
    // A profile's paired provider only applies to the profile's own model. When
    // the caller names a model explicitly, or the child falls back to the
    // parent's model, keep the parent's active provider instead.
    let model_provider = if explicit.is_some() {
        None
    } else {
        profile.model_provider.clone()
    };
    let agent = profile.agent;

    let model = explicit
        .or_else(|| selected_model(agent.model_override.as_deref()))
        .or_else(|| selected_model(fallback_model))
        .ok_or_else(|| {
            anyhow::anyhow!(
                "No model configured for agent '{}'. Select a model in Settings → Models, \
                 set the agent's model override, or pass 'model' in the spawn request.",
                agent_id
            )
        })?;

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
        model_provider,
        effective_max_steps,
        effective_context_window,
        effective_max_messages,
        inject_agents_md: profile.inject_agents_md,
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
#[allow(clippy::too_many_arguments)] // restructure into a params struct when agent moves to zen-agent (Phase 11)
pub(crate) fn resolve_adhoc_agent(
    agent_registry: &AgentRegistry,
    name: Option<&str>,
    instructions: &str,
    requested_tools: &[String],
    caller_tool_ids: &[String],
    explicit_model: Option<&str>,
    fallback_model: Option<&str>,
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
    .filter(|t| t != "spawn_agent")
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

    let model = selected_model(explicit_model)
        .or_else(|| selected_model(fallback_model))
        .ok_or_else(|| {
            anyhow::anyhow!(
                "No model configured for the ad-hoc sub-agent. Select a model in \
                 Settings → Models or pass 'model' in the spawn request."
            )
        })?;
    let effective_max_steps = explicit_max_steps.map(|s| s as usize).unwrap_or(10).max(1);

    Ok(ResolvedAgent {
        agent,
        model,
        model_provider: None,
        effective_max_steps,
        effective_context_window: None,
        effective_max_messages: None,
        inject_agents_md: false,
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
) -> HandoffContext {
    build_handoff_context(HandoffContextInput {
        agent_name: &resolved.agent.name,
        agent_instructions: &resolved.agent.instructions,
        task,
        caller_context,
        success_criteria,
        constraints,
        relevant_files,
    })
}

/// Build the initial child message list from structured handoff context.
pub(crate) fn build_child_messages_from_handoff(handoff: &HandoffContext) -> Vec<ChatMessage> {
    handoff_to_messages(handoff)
}

/// Build a fully configured child `Runner` with bounded tool
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
        app.state::<crate::services::agent_context::AgentContext>().inner().clone(),
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

    let inherited_tools = allowed_tools
        .as_ref()
        .and_then(|allowed| allowed.try_lock().ok().map(|guard| guard.iter().cloned().collect::<std::collections::HashSet<_>>()));
    let configured_tools: std::collections::HashSet<String> = resolved.agent.tool_ids.iter().cloned().collect();
    let mut effective_tools = match inherited_tools {
        // An empty root ceiling means "use the profile's configured tools".
        Some(inherited) if !inherited.is_empty() => inherited
            .into_iter()
            .filter(|tool| configured_tools.contains(tool))
            .collect(),
        _ => configured_tools,
    };
    effective_tools.remove("spawn_agent");
    runner = runner.with_delegation_allowed(false);
    runner = runner.with_allowed_tools(Arc::new(tokio::sync::Mutex::new(effective_tools)));

    Ok(runner)
}

/// Generate a unique memory scope ID for a subagent task.
/// Add the workspace-root AGENTS.md to a profile only when the user enabled
/// instruction injection. The file is bounded and read by the backend so the
/// frontend never reads arbitrary workspace paths.
pub(crate) async fn inject_workspace_agents_md(app: &AppHandle, resolved: &mut ResolvedAgent) {
    if !resolved.inject_agents_md {
        return;
    }
    let state = app.state::<AppState>();
    let workspace = state.workspace_folder.read().await.clone();
    let path = workspace.join("AGENTS.md");
    let Ok(content) = tokio::fs::read_to_string(path).await else {
        return;
    };
    let content = content.trim();
    if content.is_empty() {
        return;
    }
    let bounded = content.chars().take(32_000).collect::<String>();
    resolved.agent.instructions = format!("{}\n\n## Workspace AGENTS.md\n{}", resolved.agent.instructions, bounded);
}

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

#[cfg(test)]
mod tests {
    use super::*;

    fn registry_with_generalist() -> AgentRegistry {
        let reg = AgentRegistry::new();
        reg.register(Agent {
            id: "generalist".to_string(),
            name: "ZEN".to_string(),
            instructions: "coordinator".to_string(),
            tool_ids: vec![
                "web_search".to_string(),
                "write_file".to_string(),
                "run_command".to_string(),
                "spawn_agent".to_string(),
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
            resolve_adhoc_agent(&reg, None, "do a thing", &[], &caller_tools, None, Some("parent-model"), None).unwrap();

        // Inherits coordinator tools but never delegation tools.
        assert!(resolved.agent.tool_ids.contains(&"web_search".to_string()));
        assert!(resolved.agent.tool_ids.contains(&"write_file".to_string()));
        assert!(!resolved.agent.tool_ids.contains(&"spawn_agent".to_string()));
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
            resolve_adhoc_agent(&reg, Some("Scout"), "scout", &requested, &caller_tools, None, Some("parent-model"), None).unwrap();

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
        assert!(resolve_adhoc_agent(&reg, None, "   ", &[], &caller_tools, None, Some("parent-model"), None).is_err());
    }

    #[test]
    fn builtin_profile_inherits_parent_model_when_override_is_null() {
        let reg = registry_with_generalist();
        let resolved = resolve_agent(&reg, "generalist", None, Some("parent-model"), None).unwrap();
        assert_eq!(resolved.model, "parent-model");
    }

    #[test]
    fn blank_and_inherit_sentinels_never_become_the_model() {
        let reg = registry_with_generalist();
        let resolved = resolve_agent(&reg, "generalist", Some("  "), Some("parent-model"), None).unwrap();
        assert_eq!(resolved.model, "parent-model");

        let resolved = resolve_agent(&reg, "generalist", Some("inherit"), Some("parent-model"), None).unwrap();
        assert_eq!(resolved.model, "parent-model");
    }

    #[test]
    fn spawn_fails_when_no_model_is_available_anywhere() {
        let reg = registry_with_generalist();
        assert!(resolve_agent(&reg, "generalist", None, None, None).is_err());
        let caller_tools: Vec<String> = reg
            .get("generalist")
            .map(|a| a.tool_ids.clone())
            .unwrap_or_default();
        assert!(resolve_adhoc_agent(&reg, None, "scout", &[], &caller_tools, None, None, None).is_err());
    }

    #[test]
    fn retired_agent_ids_alias_onto_current_profiles() {
        assert_eq!(canonical_agent_id("researcher"), "explore");
        assert_eq!(canonical_agent_id("ZEN-DOCS"), "explore");
        assert_eq!(canonical_agent_id("operational_expert"), "generalist");
        assert_eq!(canonical_agent_id("ZEN-TAC"), "generalist");
        // Unknown / current ids pass through untouched.
        assert_eq!(canonical_agent_id("explore"), "explore");
        assert_eq!(canonical_agent_id("generalist"), "generalist");
        assert_eq!(canonical_agent_id("nonexistent"), "nonexistent");
    }
}
