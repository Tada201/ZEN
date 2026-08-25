//! Typed prompt injection fragments for skills (replaces `push_str` chain).
//!
//! Two roles:
//! - `SkillsCatalogFragment` (System role) — the `## Skills` catalog block.
//! - `SkillInstructionsFragment` (User role) — wraps full SKILL.md body when invoked.
//!
//! Middleware writes the catalog; chat dispatch writes invoked bodies.

use std::fmt::Write;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FragmentRole {
    System,
    Developer,
    User,
}

pub trait ContextualFragment: Send + Sync {
    fn role(&self) -> FragmentRole;
    fn stable_id(&self) -> &'static str;
    fn body(&self) -> String;
}

#[derive(Debug, Clone)]
pub struct SkillsCatalogFragment {
    pub skill_lines: Vec<String>,
    pub skill_root_lines: Vec<String>,
}

impl SkillsCatalogFragment {
    pub fn empty() -> Self {
        Self {
            skill_lines: vec![],
            skill_root_lines: vec![],
        }
    }

    pub fn is_empty(&self) -> bool {
        self.skill_lines.is_empty()
    }
}

impl ContextualFragment for SkillsCatalogFragment {
    fn role(&self) -> FragmentRole {
        FragmentRole::System
    }
    fn stable_id(&self) -> &'static str {
        "skills_catalog"
    }
    fn body(&self) -> String {
        let mut out = String::from("\n\n## Skills\n");
        out.push_str(
            "A skill is a set of instructions provided through a `SKILL.md` source. \
             The catalog below lists skills available at session start. Skill bodies are \
             NOT pre-loaded — invoke a skill (slash command, $name mention, or skill tool) \
             to read its full content before acting.\n",
        );

        if !self.skill_root_lines.is_empty() {
            out.push_str("\n### Skill roots\n");
            for line in &self.skill_root_lines {
                let _ = writeln!(out, "- {line}");
            }
        }

        out.push_str("\n### Available skills\n");
        if self.skill_lines.is_empty() {
            out.push_str("(no skills detected — add SKILL.md files to `.agents/skills/` or `~/.zen/skills/`)\n");
        } else {
            for line in &self.skill_lines {
                let _ = writeln!(out, "{line}");
            }
        }

        out.push_str(
            "\n### How to use skills\n\
             - Trigger rules: If the user names a skill (`$SkillName` or `/skill-name`) OR the \
             task clearly matches a skill's description shown above, you must invoke that skill \
             for that turn. The `skill` tool has three actions: `list` (enumerate), \
             `load` (read full SKILL.md body), and `execute` (expand prompt template with args).\n\
             - Progressive disclosure: read SKILL.md fully before acting on its instructions.\n\
             - Do not delegate reading or summarizing skill instructions to a subagent — the \
             parent agent must read the skill directly.\n",
        );
        out
    }
}

#[derive(Debug, Clone)]
pub struct SkillInstructionsFragment {
    pub name: String,
    pub path: String,
    pub contents: String,
}

impl ContextualFragment for SkillInstructionsFragment {
    fn role(&self) -> FragmentRole {
        FragmentRole::User
    }
    fn stable_id(&self) -> &'static str {
        "skill_instructions"
    }
    fn body(&self) -> String {
        // P0 IPI defence: SKILL.md bodies are untrusted file content.
        // Route them through the shared safety wrapper so they always
        // land inside a tagged envelope with an explicit system
        // reminder, never as raw text in the LLM context.
        crate::prompt_safety::wrap_skill_body(&self.name, &self.path, &self.contents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_body_lists_skills() {
        let cat = SkillsCatalogFragment {
            skill_lines: vec!["- root-cause-first: debug (file: r0/rcf/SKILL.md)".into()],
            skill_root_lines: vec![],
        };
        let body = cat.body();
        assert!(body.contains("## Skills"));
        assert!(body.contains("root-cause-first"));
        assert!(body.contains("Do not delegate"));
    }

    #[test]
    fn catalog_empty_state_handled() {
        let cat = SkillsCatalogFragment::empty();
        let body = cat.body();
        assert!(body.contains("no skills detected"));
    }

    #[test]
    fn instructions_fragment_wraps_body() {
        let frag = SkillInstructionsFragment {
            name: "x".into(),
            path: "/a/b/SKILL.md".into(),
            contents: "# Body\ndo stuff".into(),
        };
        let body = frag.body();
        assert!(body.contains("<skill name=\"x\""));
        assert!(body.contains("path=\"/a/b/SKILL.md\""));
        assert!(body.contains("do stuff"));
        assert!(body.contains("<system_reminder>"));
        assert!(body.ends_with("</skill>\n"));
    }
}
