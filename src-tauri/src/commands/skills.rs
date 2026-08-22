//! Tauri IPC commands for the skills system.
//!
//! Exposes:
//! - `list_skills` - enumerate currently-discovered skills (metadata only)
//! - `load_skill` - read the full body of a single skill
//! - `set_skill_enabled` - toggle a skill's enabled state (persisted in settings)
//! - `suggest_slash` - autocomplete suggestions for the chat input popover

use crate::agent::skills::{
    is_valid_skill_name, parse_slash_command, suggest_slash_commands, BuiltinCommand, SlashCommand,
    SlashSuggestionKind, AGENTS_DIR_NAME, SKILLS_DIR_NAME, SKILLS_FILENAME, ZEN_HOME_DIR,
};
use crate::commands::AppState;
use crate::error::{ZenError, ZenResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Sentinel prefix so the frontend can detect an unconfirmed overwrite and
/// re-issue with `overwrite: true`.
pub const SKILL_EXISTS_PREFIX: &str = "skill-exists:";

/// Resolve the discovery cwd from the frontend-supplied workspace root
/// (the chat the composer belongs to), falling back to the process cwd.
fn resolve_cwd(workspace_root: Option<&str>) -> PathBuf {
    workspace_root
        .and_then(|root| {
            crate::workspace::canonicalize_workspace_root(std::path::Path::new(root)).ok()
        })
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

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
pub async fn list_skills(
    app: AppHandle,
    workspace_root: Option<String>,
) -> ZenResult<Vec<SkillListItem>> {
    let state = app.state::<AppState>();
    let cwd = resolve_cwd(workspace_root.as_deref());
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
pub async fn load_skill(
    app: AppHandle,
    name: String,
    workspace_root: Option<String>,
) -> ZenResult<SkillLoadResult> {
    let state = app.state::<AppState>();
    let cwd = resolve_cwd(workspace_root.as_deref());
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
pub async fn suggest_slash(
    app: AppHandle,
    query: String,
    workspace_root: Option<String>,
) -> ZenResult<Vec<SlashSuggestionDto>> {
    let state = app.state::<AppState>();
    let cwd = resolve_cwd(workspace_root.as_deref());
    let skills = state.skills_manager.enabled_skills_for_cwd(&cwd).await.skills;
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
pub async fn parse_slash(
    app: AppHandle,
    input: String,
    workspace_root: Option<String>,
) -> ZenResult<SlashParseResult> {
    let state = app.state::<AppState>();
    let cwd = resolve_cwd(workspace_root.as_deref());
    let skills = state.skills_manager.enabled_skills_for_cwd(&cwd).await.skills;
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
        BuiltinCommand::Goal => "goal",
        BuiltinCommand::Compact => "compact",
    }
}

/// Resolve the `<name>/` target dir for a save, given scope + workspace root.
/// `repo` writes under `<workspace>/.agents/skills/`; `user` under
/// `<home>/.zen/skills/`. Rejects any resolved path that escapes its root.
fn resolve_skill_dir(
    scope: &str,
    name: &str,
    workspace_root: Option<&str>,
    home_dir: &Path,
) -> ZenResult<PathBuf> {
    let root = match scope {
        "repo" => {
            let ws = workspace_root
                .and_then(|r| crate::workspace::canonicalize_workspace_root(Path::new(r)).ok())
                .ok_or_else(|| {
                    ZenError::Custom("open a workspace to save a project skill".into())
                })?;
            ws.join(AGENTS_DIR_NAME).join(SKILLS_DIR_NAME)
        }
        "user" => home_dir.join(ZEN_HOME_DIR).join(SKILLS_DIR_NAME),
        other => return Err(ZenError::Custom(format!("invalid skill scope: {other}"))),
    };
    let target = root.join(name);
    // Belt-and-suspenders: `name` is kebab-validated (no separators), but assert
    // the join stays under the intended root before writing.
    if !target.starts_with(&root) {
        return Err(ZenError::Custom("resolved skill path escapes its root".into()));
    }
    Ok(target)
}

/// Compose a deterministic `SKILL.md`: YAML frontmatter (only emitting optional
/// keys when set) followed by the body.
fn compose_skill_md(
    name: &str,
    description: &str,
    allow_implicit_invocation: bool,
    requires_tools: &[String],
    invocation_syntax: Option<&str>,
    body: &str,
) -> String {
    let mut out = String::from("---\n");
    out.push_str(&format!("name: {name}\n"));
    // Quote the description so colons/special chars stay valid YAML.
    out.push_str(&format!("description: {}\n", yaml_scalar(description)));
    out.push_str(&format!(
        "allow_implicit_invocation: {allow_implicit_invocation}\n"
    ));
    if let Some(syntax) = invocation_syntax.filter(|s| !s.trim().is_empty()) {
        out.push_str(&format!("invocation-syntax: {}\n", yaml_scalar(syntax)));
    }
    let tools: Vec<&String> = requires_tools.iter().filter(|t| !t.trim().is_empty()).collect();
    if !tools.is_empty() {
        // Inline list form: the frontmatter parser (`parse_frontmatter`) only
        // reads `[a, b, c]`, not YAML block lists, so keep this on one line.
        let rendered = tools
            .iter()
            .map(|t| yaml_scalar(t))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("requires-tools: [{rendered}]\n"));
    }
    out.push_str("---\n\n");
    out.push_str(body.trim_end());
    out.push('\n');
    out
}

/// Minimal YAML scalar quoting: double-quote when the value contains characters
/// that would otherwise change YAML meaning.
fn yaml_scalar(v: &str) -> String {
    let needs_quote = v.is_empty()
        || v.starts_with(|c: char| c.is_whitespace())
        || v.ends_with(|c: char| c.is_whitespace())
        || v.contains([':', '#', '"', '\'', '\n', '[', ']', '{', '}', '&', '*', '!', '|', '>', '%', '@', '`']);
    if needs_quote {
        // Double-quoted YAML: escape backslash/quote, and fold real newlines and
        // tabs to their `\n`/`\t` escapes so the scalar stays on one line.
        format!(
            "\"{}\"",
            v.replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\r', "")
                .replace('\n', "\\n")
                .replace('\t', "\\t")
        )
    } else {
        v.to_string()
    }
}

/// Create or edit a skill by writing its `SKILL.md`. Returns the written path.
///
/// On an existing file without `overwrite`, returns an error prefixed with
/// [`SKILL_EXISTS_PREFIX`] so the UI can prompt for confirmation.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_skill(
    app: AppHandle,
    name: String,
    description: String,
    body: String,
    scope: String,
    allow_implicit_invocation: bool,
    requires_tools: Vec<String>,
    invocation_syntax: Option<String>,
    workspace_root: Option<String>,
    overwrite: bool,
) -> ZenResult<String> {
    if !is_valid_skill_name(&name) {
        return Err(ZenError::Custom(format!(
            "invalid skill name '{name}': use kebab-case (lowercase letters, digits, single dashes)"
        )));
    }
    if description.trim().is_empty() {
        return Err(ZenError::Custom("description is required".into()));
    }

    let state = app.state::<AppState>();
    let dir = resolve_skill_dir(
        &scope,
        &name,
        workspace_root.as_deref(),
        state.skills_manager.home_dir(),
    )?;
    let file = dir.join(SKILLS_FILENAME);

    if file.exists() && !overwrite {
        return Err(ZenError::Custom(format!(
            "{SKILL_EXISTS_PREFIX}{} already exists",
            file.display()
        )));
    }

    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| ZenError::Custom(format!("create {}: {}", dir.display(), e)))?;
    let contents = compose_skill_md(
        &name,
        description.trim(),
        allow_implicit_invocation,
        &requires_tools,
        invocation_syntax.as_deref(),
        &body,
    );
    tokio::fs::write(&file, contents)
        .await
        .map_err(|e| ZenError::Custom(format!("write {}: {}", file.display(), e)))?;

    // Drop the cached catalog so the new/edited skill surfaces immediately
    // rather than after the discovery TTL.
    state.skills_manager.clear_cache().await;
    Ok(file.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root() -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let p = std::env::temp_dir().join(format!("zen_save_skill_{nanos}"));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn resolve_repo_scope_under_workspace() {
        let ws = tmp_root();
        let dir = resolve_skill_dir("repo", "my-skill", Some(ws.to_str().unwrap()), Path::new("/home"))
            .unwrap();
        assert!(dir.ends_with(Path::new(".agents").join("skills").join("my-skill")));
        assert!(dir.starts_with(ws.canonicalize().unwrap()));
    }

    #[test]
    fn resolve_user_scope_under_home() {
        let dir = resolve_skill_dir("user", "my-skill", None, Path::new("/home/u")).unwrap();
        assert_eq!(dir, Path::new("/home/u/.zen/skills/my-skill"));
    }

    #[test]
    fn repo_scope_requires_workspace() {
        assert!(resolve_skill_dir("repo", "x", None, Path::new("/home")).is_err());
    }

    #[test]
    fn rejects_unknown_scope() {
        assert!(resolve_skill_dir("bogus", "x", None, Path::new("/home")).is_err());
    }

    #[test]
    fn compose_omits_empty_optionals() {
        let md = compose_skill_md("foo", "does foo", false, &[], None, "body here");
        assert!(md.contains("name: foo"));
        assert!(md.contains("description: does foo"));
        assert!(md.contains("allow_implicit_invocation: false"));
        assert!(!md.contains("requires-tools"));
        assert!(!md.contains("invocation-syntax"));
        assert!(md.trim_end().ends_with("body here"));
    }

    #[test]
    fn compose_emits_and_quotes_optionals() {
        let md = compose_skill_md(
            "foo",
            "has: colon",
            true,
            &["read".into(), "write".into()],
            Some("/foo <arg>"),
            "body",
        );
        assert!(md.contains("description: \"has: colon\""));
        assert!(md.contains("requires-tools: [read, write]"));
        assert!(md.contains("invocation-syntax: \"/foo <arg>\""));
    }
}
