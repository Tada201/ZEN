//! `$skill-name` mention parser.
//!
//! Extracts unambiguous skill mentions from user input. A mention is only counted
//! when exactly one available skill has the given name (Codex rule — prevents
//! accidental matches against connector slugs or other system names).

use super::types::SkillMetadata;

pub const MENTION_SIGIL: char = '$';

#[derive(Debug, Clone)]
pub struct SkillMention {
    pub name: String,
}

pub fn extract_skill_mentions(user_input: &str, available: &[SkillMetadata]) -> Vec<SkillMention> {
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut found: std::collections::HashMap<String, SkillMention> = std::collections::HashMap::new();

    for name in candidate_names(user_input) {
        let n_matches = available.iter().filter(|s| s.name == name).count();
        if n_matches != 1 {
            // Skip ambiguous (multiple matches) and unknown (zero matches).
            continue;
        }
        *counts.entry(name.clone()).or_insert(0) += 1;
        found.entry(name.clone()).or_insert(SkillMention { name });
    }

    let mut out: Vec<SkillMention> = found.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Scan for `$name` tokens. A name is kebab-case ASCII after the sigil,
/// terminated by whitespace, punctuation, or end-of-string.
fn candidate_names(input: &str) -> Vec<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == MENTION_SIGIL as u8 {
            // Skip if escaped: `\$foo`
            if i > 0 && bytes[i - 1] == b'\\' {
                i += 1;
                continue;
            }
            // Read until whitespace, comma, semicolon, paren, or EOL.
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() {
                let c = bytes[end];
                if c.is_ascii_whitespace() || c == b',' || c == b';' || c == b')' || c == b']' || c == b'}' || c == b'.' {
                    break;
                }
                end += 1;
            }
            if end > start {
                if let Ok(s) = std::str::from_utf8(&bytes[start..end]) {
                    if !s.is_empty() && s.len() <= 64 {
                        out.push(s.to_string());
                    }
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::types::{SkillMetadata, SkillScope};
    use std::path::PathBuf;

    fn mk(name: &str) -> SkillMetadata {
        SkillMetadata {
            name: name.to_string(),
            description: String::new(),
            short_description: None,
            scope: SkillScope::Repo,
            path: PathBuf::from(format!("/skills/{name}/SKILL.md")),
            allow_implicit_invocation: true,
            tools_required: vec![],
            invocation_syntax: format!("/{name}"),
        }
    }

    #[test]
    fn extracts_unambiguous_mention() {
        let available = vec![mk("root-cause-first"), mk("brainstorming")];
        let got = extract_skill_mentions("debug this with $root-cause-first", &available);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].name, "root-cause-first");
    }

    #[test]
    fn skips_ambiguous_name() {
        let available = vec![mk("foo"), mk("foo")];
        let got = extract_skill_mentions("$foo please", &available);
        assert!(got.is_empty(), "ambiguous matches are skipped");
    }

    #[test]
    fn skips_unknown_name() {
        let available = vec![mk("foo")];
        let got = extract_skill_mentions("$bar please", &available);
        assert!(got.is_empty());
    }

    #[test]
    fn dedup_repeated_mentions() {
        let available = vec![mk("foo")];
        let got = extract_skill_mentions("$foo and $foo again", &available);
        assert_eq!(got.len(), 1);
    }

    #[test]
    fn handles_punctuation_terminator() {
        let available = vec![mk("foo")];
        let got = extract_skill_mentions("$foo, please", &available);
        assert_eq!(got.len(), 1);
    }

    #[test]
    fn escaped_sigil_skipped() {
        let available = vec![mk("foo")];
        let got = extract_skill_mentions(r"\$foo please", &available);
        assert!(got.is_empty());
    }
}
