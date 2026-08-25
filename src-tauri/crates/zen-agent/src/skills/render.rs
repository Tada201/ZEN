//! Token-budget catalog rendering for the skills section of the system prompt.
//!
//! Strategy (Codex-derived, simplified):
//! 1. Try full plan (absolute paths + descriptions). If fits, emit all.
//! 2. Else strip descriptions greedily: short first, surplus to long.
//! 3. Else drop lines by scope priority (System > Repo > User).
//!
//! 2% of context window, with 8000-char fallback when no window known.

use super::types::SkillLoadOutcome;

pub const DEFAULT_SKILL_METADATA_CHAR_BUDGET: usize = 8_000;
pub const SKILL_METADATA_CONTEXT_WINDOW_PERCENT: usize = 2;
pub const APPROX_BYTES_PER_TOKEN: usize = 4;

#[derive(Debug, Clone, Copy)]
pub enum SkillMetadataBudget {
    Tokens(i64),
    Characters(usize),
}

impl SkillMetadataBudget {
    pub fn chars(&self) -> usize {
        match self {
            SkillMetadataBudget::Tokens(n) => ((*n).max(1) as usize) * APPROX_BYTES_PER_TOKEN,
            SkillMetadataBudget::Characters(n) => *n,
        }
    }
}

pub fn default_skill_metadata_budget(context_window: Option<i64>) -> SkillMetadataBudget {
    match context_window {
        Some(w) if w > 0 => {
            let tokens = (w * SKILL_METADATA_CONTEXT_WINDOW_PERCENT as i64) / 100;
            SkillMetadataBudget::Tokens(tokens.max(1))
        }
        _ => SkillMetadataBudget::Characters(DEFAULT_SKILL_METADATA_CHAR_BUDGET),
    }
}

#[derive(Debug, Clone)]
pub struct SkillRenderOutcome {
    /// Lines in the form `- name: description (file: path)`.
    pub lines: Vec<String>,
    /// Path aliases for the "Skill roots" section. Empty unless aliasing is needed.
    pub root_lines: Vec<String>,
    /// True when descriptions were truncated or skills were dropped.
    pub truncated: bool,
    pub warning_message: Option<String>,
}

pub const SKILL_DESCRIPTION_TRUNCATED_WARNING: &str =
    "Skill descriptions were shortened to fit the skills context budget.";

pub fn render_available_skills(
    outcome: &SkillLoadOutcome,
    budget: SkillMetadataBudget,
) -> SkillRenderOutcome {
    if outcome.skills.is_empty() {
        return SkillRenderOutcome {
            lines: vec![],
            root_lines: vec![],
            truncated: false,
            warning_message: None,
        };
    }

    let budget_chars = budget.chars();
    let mut sorted = outcome.skills.clone();
    // Visibility order: System first, then Repo, then User.
    sorted.sort_by(|a, b| b.scope.cmp(&a.scope).then_with(|| a.name.cmp(&b.name)));

    // Pass 1: full descriptions.
    let full_lines: Vec<String> = sorted.iter().map(format_full_line).collect();
    let full_cost: usize = full_lines.iter().map(|l| l.len() + 1).sum();

    if full_cost <= budget_chars {
        return SkillRenderOutcome {
            lines: full_lines,
            root_lines: vec![],
            truncated: false,
            warning_message: None,
        };
    }

    // Pass 2: drop descriptions greedily. Keep name + path only.
    let min_lines: Vec<String> = sorted.iter().map(format_min_line).collect();
    let min_cost: usize = min_lines.iter().map(|l| l.len() + 1).sum();

    if min_cost > budget_chars {
        // Drop from the back (lowest priority) until under budget.
        let mut kept = Vec::new();
        let mut used = 0usize;
        for (i, line) in min_lines.iter().enumerate() {
            let line_cost = line.len() + 1;
            if used + line_cost > budget_chars {
                break;
            }
            used += line_cost;
            kept.push((i, line.clone()));
        }
        // Re-sort kept back to display order.
        kept.sort_by_key(|(i, _)| *i);
        let lines: Vec<String> = kept.into_iter().map(|(_, l)| l).collect();
        return SkillRenderOutcome {
            lines,
            root_lines: vec![],
            truncated: true,
            warning_message: Some(SKILL_DESCRIPTION_TRUNCATED_WARNING.to_string()),
        };
    }

    // Pass 3: redistribute surplus chars across descriptions.
    let surplus = budget_chars - min_cost;
    let mut desc_budgets = vec![0usize; sorted.len()];
    distribute_description_budget(&sorted, surplus, &mut desc_budgets);

    let mut lines = Vec::with_capacity(sorted.len());
    for (i, skill) in sorted.iter().enumerate() {
        let desc = truncate_chars(&skill.description, desc_budgets[i]);
        lines.push(format!("- {}: {} (file: {})", skill.name, desc, skill.path.display()));
    }

    SkillRenderOutcome {
        lines,
        root_lines: vec![],
        truncated: true,
        warning_message: Some(SKILL_DESCRIPTION_TRUNCATED_WARNING.to_string()),
    }
}

fn format_full_line(skill: &super::types::SkillMetadata) -> String {
    format!(
        "- {}: {} (file: {})",
        skill.name,
        skill.description,
        skill.path.display()
    )
}

fn format_min_line(skill: &super::types::SkillMetadata) -> String {
    format!("- {} (file: {})", skill.name, skill.path.display())
}

fn distribute_description_budget(
    skills: &[super::types::SkillMetadata],
    total: usize,
    out: &mut [usize],
) {
    // Greedy: short descriptions first, then surplus to long.
    let mut indices: Vec<usize> = (0..skills.len()).collect();
    indices.sort_by_key(|&i| skills[i].description.len());
    let mut remaining = total;
    for &i in &indices {
        if remaining == 0 {
            break;
        }
        let natural = skills[i].description.len();
        // Give each a baseline proportional share.
        let share = (natural / 4).max(40);
        let alloc = share.min(remaining).min(natural);
        out[i] = alloc;
        remaining = remaining.saturating_sub(alloc);
    }
}

fn truncate_chars(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if s.len() <= max {
        return s.to_string();
    }
    // Truncate at char boundary.
    let mut out = String::new();
    for (i, c) in s.char_indices() {
        if i >= max.saturating_sub(1) {
            out.push('…');
            break;
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::types::{SkillMetadata, SkillScope};
    use std::path::PathBuf;

    fn mk(name: &str, desc: &str, scope: SkillScope) -> SkillMetadata {
        SkillMetadata {
            name: name.to_string(),
            description: desc.to_string(),
            short_description: None,
            scope,
            path: PathBuf::from(format!("/skills/{name}/SKILL.md")),
            allow_implicit_invocation: true,
            tools_required: vec![],
            invocation_syntax: format!("/{name}"),
        }
    }

    #[test]
    fn empty_outcome_returns_empty() {
        let outcome = SkillLoadOutcome::empty();
        let r = render_available_skills(&outcome, SkillMetadataBudget::Characters(1000));
        assert!(r.lines.is_empty());
    }

    #[test]
    fn fits_within_budget_no_truncation() {
        let outcome = SkillLoadOutcome {
            skills: vec![
                mk("a", "short desc", SkillScope::Repo),
                mk("b", "another short", SkillScope::Repo),
            ],
            disabled_paths: Default::default(),
            scanned_at: None,
        };
        let r = render_available_skills(&outcome, SkillMetadataBudget::Characters(10_000));
        assert!(!r.truncated);
        assert_eq!(r.lines.len(), 2);
    }

    #[test]
    fn description_truncated_when_budget_tight() {
        let outcome = SkillLoadOutcome {
            skills: vec![mk(
                "verbose",
                "a".repeat(500).as_str(),
                SkillScope::Repo,
            )],
            disabled_paths: Default::default(),
            scanned_at: None,
        };
        // Budget small enough that 500-char desc won't all fit even after redistribution.
        let r = render_available_skills(&outcome, SkillMetadataBudget::Characters(120));
        assert!(r.truncated);
        assert!(r.lines[0].contains("verbose"));
    }

    #[test]
    fn scope_visibility_order_system_first() {
        let outcome = SkillLoadOutcome {
            skills: vec![
                mk("user-skill", "u", SkillScope::User),
                mk("repo-skill", "r", SkillScope::Repo),
                mk("system-skill", "s", SkillScope::System),
            ],
            disabled_paths: Default::default(),
            scanned_at: None,
        };
        let r = render_available_skills(&outcome, SkillMetadataBudget::Characters(10_000));
        assert!(r.lines[0].starts_with("- system-skill"));
        assert!(r.lines[2].starts_with("- user-skill"));
    }

    #[test]
    fn drops_lowest_priority_when_overflowed() {
        // 5 skills, budget only fits 2 min-lines (~50 chars each).
        let outcome = SkillLoadOutcome {
            skills: (0..5)
                .map(|i| mk(&format!("s{i}"), "desc", SkillScope::User))
                .collect(),
            disabled_paths: Default::default(),
            scanned_at: None,
        };
        let r = render_available_skills(&outcome, SkillMetadataBudget::Characters(80));
        assert!(r.truncated);
        assert!(r.lines.len() < 5);
    }

    #[test]
    fn default_budget_uses_context_window_percent() {
        let b = default_skill_metadata_budget(Some(100_000));
        if let SkillMetadataBudget::Tokens(t) = b {
            assert_eq!(t, 2000); // 2% of 100k
        } else {
            panic!("expected Tokens budget");
        }
    }

    #[test]
    fn default_budget_fallback_chars_when_no_window() {
        let b = default_skill_metadata_budget(None);
        if let SkillMetadataBudget::Characters(c) = b {
            assert_eq!(c, DEFAULT_SKILL_METADATA_CHAR_BUDGET);
        } else {
            panic!("expected Characters budget");
        }
    }
}
