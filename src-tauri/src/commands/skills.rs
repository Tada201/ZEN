//! Tauri IPC commands for the skills system.
//!
//! Exposes:
//! - `list_skills` - enumerate currently-discovered skills (metadata only)
//! - `load_skill` - read the full body of a single skill
//! - `set_skill_enabled` - toggle a skill's enabled state (persisted in settings)
//! - `suggest_slash` - autocomplete suggestions for the chat input popover

use crate::agent::skills::{
    parse_slash_command, suggest_slash_commands, BuiltinCommand, SlashCommand, SlashSuggestionKind,
};
use crate::commands::AppState;
use crate::error::ZenResult;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct SkillListItem {
    pub name: String,
    pub description: String,
    pub short_description: Option<String>,
    pub scope: String,
    /// Frontmatter-driven capability from `SKILL.md`. Independent of the
    /// runtime toggle below.
    pub allow_implicit_invocation: bool,
    pub invocation_syntax: String,
    pub tools_required: Vec<String>,
    /// Runtime enabled state. Derived from the persisted settings key
    /// `skill:<name>:enabled` (set by `set_skill_enabled`) with a fallback
    /// to the `SkillsManager`'s default-enabled state. The frontend binds
    /// the switch and styling to this field, NOT to `allow_implicit_invocation`.
    pub enabled: bool,
}

#[tauri::command]
pub async fn list_skills(app: AppHandle) -> ZenResult<Vec<SkillListItem>> {
    let state = app.state::<AppState>();
    let cwd = std::env::current_dir().unwrap_or_default();
    let outcome = state.skills_manager.skills_for_cwd(&cwd, false).await;
    let mut items = Vec::with_capacity(outcome.skills.len());
    for s in outcome.skills.iter() {
        // Get the persisted runtime toggle (the source of truth —
        // set_skill_enabled writes here). Fall back to the manager's
        // default when no setting has been written yet so a freshly
        // loaded catalog still returns `enabled: true`. Sequential
        // `await` because `.iter().map()` closures can't carry an
        // `await`; skill catalogs are small enough that the round-trips
        // are cheap.
        let key = format!("skill:{}:enabled", s.name);
        let persisted = state.settings_manager.get(&key).await.ok().flatten();
        let enabled = match persisted.as_deref() {
            Some("false") => false,
            Some("true") => true,
            _ => state.skills_manager.is_skill_enabled(s),
        };
        items.push(SkillListItem {
            name: s.name.clone(),
            description: s.description.clone(),
            short_description: s.short_description.clone(),
            scope: s.scope.as_str().to_string(),
            allow_implicit_invocation: s.allow_implicit_invocation,
            invocation_syntax: s.invocation_syntax.clone(),
            tools_required: s.tools_required.clone(),
            enabled,
        });
    }
    Ok(items)
}

#[derive(Debug, Serialize)]
pub struct SkillLoadResult {
    pub name: String,
    pub description: String,
    pub scope: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub async fn load_skill(app: AppHandle, name: String) -> ZenResult<SkillLoadResult> {
    let state = app.state::<AppState>();
    let cwd = std::env::current_dir().unwrap_or_default();
    let outcome = state.skills_manager.skills_for_cwd(&cwd, false).await;
    let skill = outcome
        .find_by_name(&name)
        .ok_or_else(|| crate::error::ZenError::Custom(format!("skill not found: {name}")))?;
    let content = tokio::fs::read_to_string(&skill.path)
        .await
        .map_err(|e| crate::error::ZenError::Custom(format!("read {}: {}", skill.path.display(), e)))?;
    Ok(SkillLoadResult {
        name: skill.name.clone(),
        description: skill.description.clone(),
        scope: skill.scope.as_str().to_string(),
        path: skill.path.display().to_string(),
        content,
    })
}

#[tauri::command]
pub async fn set_skill_enabled(
    app: AppHandle,
    name: String,
    enabled: bool,
) -> ZenResult<()> {
    // Stored in settings map keyed by "skill:<name>:enabled".
    let state = app.state::<AppState>();
    let key = format!("skill:{name}:enabled");
    state.settings_manager.set(key, enabled.to_string()).await?;
    state.skills_manager.set_skill_enabled_state(&name, enabled).await;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SlashSuggestionDto {
    Skill {
        name: String,
        description: String,
        invocation_syntax: String,
    },
    Builtin {
        name: String,
        description: String,
        invocation_syntax: String,
    },
}

#[tauri::command]
pub async fn suggest_slash(app: AppHandle, query: String) -> ZenResult<Vec<SlashSuggestionDto>> {
    let state = app.state::<AppState>();
    let cwd = std::env::current_dir().unwrap_or_default();
    let skills = state.skills_manager.list(&cwd).await;
    let suggestions = suggest_slash_commands(&query, &skills);
    Ok(suggestions
        .into_iter()
        .map(|s| match s.kind {
            SlashSuggestionKind::Skill => SlashSuggestionDto::Skill {
                name: s.name,
                description: s.description,
                invocation_syntax: s.invocation_syntax,
            },
            SlashSuggestionKind::Builtin => SlashSuggestionDto::Builtin {
                name: s.name,
                description: s.description,
                invocation_syntax: s.invocation_syntax,
            },
        })
        .collect())
}

/// Resolve a `/command args` string against available skills and builtins.
/// Returns the structured result so the frontend can render appropriate UX
/// (replace text, run builtin locally, or forward to backend).
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SlashParseResult {
    NotCommand,
    Skill { name: String, args: String },
    Builtin { name: String },
    Unknown { name: String },
}

#[tauri::command]
pub async fn parse_slash(app: AppHandle, input: String) -> ZenResult<SlashParseResult> {
    let state = app.state::<AppState>();
    let cwd = std::env::current_dir().unwrap_or_default();
    let skills = state.skills_manager.list(&cwd).await;
    let parsed = parse_slash_command(&input, &skills);
    Ok(match parsed {
        SlashCommand::NotCommand => SlashParseResult::NotCommand,
        SlashCommand::Skill { name, args } => SlashParseResult::Skill { name, args },
        SlashCommand::Builtin(b) => SlashParseResult::Builtin {
            name: builtin_name(b).to_string(),
        },
        SlashCommand::Unknown(name) => SlashParseResult::Unknown { name },
    })
}

fn builtin_name(b: BuiltinCommand) -> &'static str {
    match b {
        BuiltinCommand::Clear => "clear",
        BuiltinCommand::Help => "help",
        BuiltinCommand::Skills => "skills",
        BuiltinCommand::Settings => "settings",
    }
}
