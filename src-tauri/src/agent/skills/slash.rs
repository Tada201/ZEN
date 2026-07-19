//! Slash command parser for chat input.
//!
//! Intercepts `/skill-name args` and `/builtin` patterns at the start of user input.
//! Skill names match `SkillsManager` results; builtins are hardcoded.

use crate::agent::skills::types::SkillMetadata;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuiltinCommand {
    Clear,
    Help,
    Skills,
    Settings,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlashCommand {
    Skill { name: String, args: String },
    Builtin(BuiltinCommand),
    /// Command starts with `/` but the name is neither a known skill nor a builtin.
    Unknown(String),
    /// Not a slash command (no leading `/`).
    NotCommand,
}

pub fn parse_slash_command(input: &str, available_skills: &[SkillMetadata]) -> SlashCommand {
    let trimmed = input.trim_start();
    if !trimmed.starts_with('/') {
        return SlashCommand::NotCommand;
    }
    let body = &trimmed[1..];
    let (cmd, args) = match body.find(char::is_whitespace) {
        Some(i) => (&body[..i], body[i..].trim_start().to_string()),
        None => (body, String::new()),
    };

    if cmd.is_empty() {
        return SlashCommand::NotCommand; // bare `/` is not a command
    }

    // Skills first (exact kebab-case match).
    if let Some(skill) = available_skills.iter().find(|s| s.name == cmd) {
        return SlashCommand::Skill {
            name: skill.name.clone(),
            args,
        };
    }

    match cmd {
        "clear" => SlashCommand::Builtin(BuiltinCommand::Clear),
        "help" => SlashCommand::Builtin(BuiltinCommand::Help),
        "skills" => SlashCommand::Builtin(BuiltinCommand::Skills),
        "settings" => SlashCommand::Builtin(BuiltinCommand::Settings),
        other => SlashCommand::Unknown(other.to_string()),
    }
}

/// Suggestions for the autocomplete popover. Filters when the query is non-empty.
pub fn suggest_slash_commands(query: &str, available_skills: &[SkillMetadata]) -> Vec<SlashSuggestion> {
    let query = query.trim_start_matches('/').to_ascii_lowercase();
    let mut out: Vec<SlashSuggestion> = BUILTINS
        .iter()
        .filter(|b| query.is_empty() || b.name.starts_with(&query))
        .map(|b| SlashSuggestion {
            name: b.name.to_string(),
            kind: SlashSuggestionKind::Builtin,
            description: b.description.to_string(),
            invocation_syntax: format!("/{}", b.name),
        })
        .collect();

    let mut skill_suggestions: Vec<SlashSuggestion> = available_skills
        .iter()
        .filter(|s| query.is_empty() || s.name.to_ascii_lowercase().starts_with(&query))
        .map(|s| SlashSuggestion {
            name: s.name.clone(),
            kind: SlashSuggestionKind::Skill,
            description: s.description.clone(),
            invocation_syntax: s.invocation_syntax.clone(),
        })
        .collect();

    out.append(&mut skill_suggestions);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out.truncate(10);
    out
}

#[derive(Debug, Clone)]
pub struct SlashSuggestion {
    pub name: String,
    pub kind: SlashSuggestionKind,
    pub description: String,
    pub invocation_syntax: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlashSuggestionKind {
    Skill,
    Builtin,
}

struct BuiltinDef {
    name: &'static str,
    description: &'static str,
}

const BUILTINS: &[BuiltinDef] = &[
    BuiltinDef { name: "clear", description: "Clear the current chat" },
    BuiltinDef { name: "help", description: "Show available slash commands" },
    BuiltinDef { name: "skills", description: "Open the skills registry" },
    BuiltinDef { name: "settings", description: "Open app settings" },
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::skills::types::{SkillMetadata, SkillScope};
    use std::path::PathBuf;

    fn mk(name: &str) -> SkillMetadata {
        SkillMetadata {
            name: name.to_string(),
            description: format!("{} skill", name),
            short_description: None,
            scope: SkillScope::Repo,
            path: PathBuf::from(format!("/skills/{}/SKILL.md", name)),
            allow_implicit_invocation: true,
            tools_required: vec![],
            invocation_syntax: format!("/{}", name),
        }
    }

    #[test]
    fn parses_skill_with_args() {
        let skills = vec![mk("root-cause-first")];
        let cmd = parse_slash_command("/root-cause-first bug in auth", &skills);
        match cmd {
            SlashCommand::Skill { name, args } => {
                assert_eq!(name, "root-cause-first");
                assert_eq!(args, "bug in auth");
            }
            _ => panic!("expected Skill"),
        }
    }

    #[test]
    fn parses_skill_no_args() {
        let skills = vec![mk("foo")];
        let cmd = parse_slash_command("/foo", &skills);
        assert_eq!(cmd, SlashCommand::Skill { name: "foo".into(), args: "".into() });
    }

    #[test]
    fn parses_builtin_clear() {
        let cmd = parse_slash_command("/clear", &[]);
        assert_eq!(cmd, SlashCommand::Builtin(BuiltinCommand::Clear));
    }

    #[test]
    fn parses_builtin_help() {
        let cmd = parse_slash_command("/help", &[]);
        assert_eq!(cmd, SlashCommand::Builtin(BuiltinCommand::Help));
    }

    #[test]
    fn unknown_slash_returns_unknown() {
        let cmd = parse_slash_command("/doesnotexist", &[]);
        assert_eq!(cmd, SlashCommand::Unknown("doesnotexist".into()));
    }

    #[test]
    fn plain_text_returns_not_command() {
        let cmd = parse_slash_command("hello world", &[]);
        assert_eq!(cmd, SlashCommand::NotCommand);
    }

    #[test]
    fn bare_slash_returns_not_command() {
        let cmd = parse_slash_command("/", &[]);
        assert_eq!(cmd, SlashCommand::NotCommand);
    }

    #[test]
    fn skill_takes_precedence_over_builtin() {
        // If a user has a skill named "skills", it beats the builtin.
        let skills = vec![mk("skills")];
        let cmd = parse_slash_command("/skills list", &skills);
        assert_eq!(
            cmd,
            SlashCommand::Skill { name: "skills".into(), args: "list".into() }
        );
    }

    #[test]
    fn suggestions_filter_by_query() {
        let skills = vec![mk("root-cause-first"), mk("brainstorming")];
        let s = suggest_slash_commands("/root", &skills);
        assert!(s.iter().any(|x| x.name == "root-cause-first"));
        assert!(!s.iter().any(|x| x.name == "brainstorming"));
    }

    #[test]
    fn empty_query_returns_all() {
        let skills = vec![mk("foo")];
        let s = suggest_slash_commands("/", &skills);
        assert!(s.len() >= 5); // 4 builtins + foo
    }
}
