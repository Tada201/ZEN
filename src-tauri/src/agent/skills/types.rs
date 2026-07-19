//! Skill data model: metadata, scope, frontmatter, load outcome.
//!
//! Mirrors Codex's skill metadata shape (name/description/scope/path) without
//! the sidecar `openai.yaml` (icons, plugin policy) — YAGNI for ZEN.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SkillScope {
    /// `~/.zen/skills/` - lowest precedence, available across projects.
    User = 0,
    /// Workspace `.agents/skills/` - highest precedence for project skills.
    Repo = 1,
    /// Bundled compiled skills (future).
    System = 2,
}

impl SkillScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            SkillScope::User => "user",
            SkillScope::Repo => "repo",
            SkillScope::System => "system",
        }
    }
}

#[derive(Debug, Clone)]
pub struct SkillMetadata {
    pub name: String,
    pub description: String,
    pub short_description: Option<String>,
    pub scope: SkillScope,
    pub path: PathBuf,
    pub allow_implicit_invocation: bool,
    pub tools_required: Vec<String>,
    pub invocation_syntax: String,
}

#[derive(Debug, Clone, Default)]
pub struct SkillFrontmatter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub short_description: Option<String>,
    pub invocation_syntax: Option<String>,
    pub allow_implicit_invocation: Option<bool>,
    pub requires_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct SkillLoadOutcome {
    pub skills: Vec<SkillMetadata>,
    pub disabled_paths: HashSet<PathBuf>,
    pub scanned_at: Option<SystemTime>,
}

impl SkillLoadOutcome {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn find_by_name(&self, name: &str) -> Option<&SkillMetadata> {
        self.skills.iter().find(|s| s.name == name)
    }

    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }

    pub fn len(&self) -> usize {
        self.skills.len()
    }
}

/// Strip YAML frontmatter from a SKILL.md body. Returns (frontmatter_str, body_str).
///
/// Only recognizes the simple `key: value` / `key: [a, b]` shape used by Codex-style
/// skills. Returns (empty, content) when no `---` opener is found.
pub fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    let trimmed = content.trim_start_matches('\n');
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_open = &trimmed[3..];
    // Must be followed by newline
    let after_open = after_open.strip_prefix('\n')?;
    let close_idx = after_open.find("\n---")?;
    let fm = &after_open[..close_idx];
    let body_start = close_idx + 4;
    let body = after_open[body_start..].trim_start_matches('\n');
    Some((fm, body))
}

/// Minimal YAML-ish parser for our frontmatter. Supports:
/// - `key: value` (string trimmed)
/// - `key: [a, b, c]` (list of strings)
/// - `key:` (empty -> None)
/// - `# comments` (skipped)
///
/// Anything more complex fails closed: returns Ok with what was parsed.
pub fn parse_frontmatter(fm: &str) -> SkillFrontmatter {
    let mut out = SkillFrontmatter::default();
    for raw_line in fm.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let key = k.trim();
        let value = v.trim();
        match key {
            "name" => out.name = Some(value.to_string()),
            "description" => out.description = Some(value.to_string()),
            "short-description" | "short_description" => {
                out.short_description = Some(value.to_string());
            }
            "invocation-syntax" | "invocation_syntax" => {
                out.invocation_syntax = Some(value.to_string());
            }
            "allow-implicit-invocation" | "allow_implicit_invocation" => {
                out.allow_implicit_invocation = match value.to_ascii_lowercase().as_str() {
                    "true" | "yes" | "1" | "on" => Some(true),
                    "false" | "no" | "0" | "off" => Some(false),
                    _ => None,
                };
            }
            "requires-tools" | "requires_tools" => {
                out.requires_tools = parse_inline_list(value);
            }
            _ => {} // unknown key, ignore
        }
    }
    out
}

fn parse_inline_list(value: &str) -> Option<Vec<String>> {
    let value = value.trim();
    let inner = value.strip_prefix('[')?.strip_suffix(']')?;
    let items: Vec<String> = inner
        .split(',')
        .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if items.is_empty() {
        None
    } else {
        Some(items)
    }
}

/// Validate a skill name: kebab-case, 1-64 chars, matches Codex regex.
pub fn is_valid_skill_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
}

/// Derive skill name from directory path (basename).
pub fn skill_name_from_dir(dir: &Path) -> Option<String> {
    let name = dir.file_name()?.to_str()?;
    if is_valid_skill_name(name) {
        Some(name.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_frontmatter_basic() {
        let content = "---\nname: test\ndescription: hello\n---\n# body\nline 2";
        let (fm, body) = split_frontmatter(content).unwrap();
        assert_eq!(fm, "name: test\ndescription: hello");
        assert_eq!(body, "# body\nline 2");
    }

    #[test]
    fn split_frontmatter_none_when_missing() {
        let content = "# just a doc\nno frontmatter";
        assert!(split_frontmatter(content).is_none());
    }

    #[test]
    fn parse_frontmatter_full() {
        let fm = r#"
name: root-cause-first
description: Trace bugs from mechanism, not symptoms.
short-description: debug without band-aids
allow_implicit_invocation: true
requires-tools: [bash, fs_read]
invocation_syntax: "/rcf"
"#;
        let parsed = parse_frontmatter(fm);
        assert_eq!(parsed.name.as_deref(), Some("root-cause-first"));
        assert_eq!(
            parsed.description.as_deref(),
            Some("Trace bugs from mechanism, not symptoms.")
        );
        assert_eq!(parsed.short_description.as_deref(), Some("debug without band-aids"));
        assert_eq!(parsed.allow_implicit_invocation, Some(true));
        assert_eq!(
            parsed.requires_tools,
            Some(vec!["bash".to_string(), "fs_read".to_string()])
        );
        assert_eq!(parsed.invocation_syntax.as_deref(), Some("/rcf"));
    }

    #[test]
    fn parse_frontmatter_handles_disabled_flag() {
        let fm = "name: x\nallow_implicit_invocation: false\n";
        let parsed = parse_frontmatter(fm);
        assert_eq!(parsed.allow_implicit_invocation, Some(false));
    }

    #[test]
    fn is_valid_skill_name_checks() {
        assert!(is_valid_skill_name("root-cause-first"));
        assert!(is_valid_skill_name("a"));
        assert!(is_valid_skill_name("foo123"));
        assert!(!is_valid_skill_name("-leading"));
        assert!(!is_valid_skill_name("trailing-"));
        assert!(!is_valid_skill_name("double--dash"));
        assert!(!is_valid_skill_name("UPPER"));
        assert!(!is_valid_skill_name("with space"));
        assert!(!is_valid_skill_name(""));
    }
}
