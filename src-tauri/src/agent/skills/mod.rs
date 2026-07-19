//! Skill module: discovery, manager, render, fragment injection.
//!
//! Two-tier model (Codex-derived):
//! - Catalog (metadata only) injected into system prompt via middleware, capped.
//! - Body (full SKILL.md) loaded only on explicit invocation.
//!
//! Public surface re-exports the parts the rest of the agent crate needs.

pub mod discovery;
pub mod fragment;
pub mod injection;
pub mod manager;
pub mod render;
pub mod slash;
pub mod types;

pub use discovery::{
    load_skills_from_roots, skill_roots, SkillRoot, AGENTS_DIR_NAME, SKILLS_DIR_NAME,
    SKILLS_FILENAME, ZEN_HOME_DIR,
};
pub use fragment::{ContextualFragment, FragmentRole, SkillInstructionsFragment, SkillsCatalogFragment};
pub use injection::{extract_skill_mentions, SkillMention, MENTION_SIGIL};
pub use manager::{ConfigSkillsCacheKey, SharedSkillsManager, SkillsManager};
pub use render::{
    default_skill_metadata_budget, render_available_skills, SkillMetadataBudget, SkillRenderOutcome,
};
pub use slash::{
    parse_slash_command, suggest_slash_commands, BuiltinCommand, SlashCommand, SlashSuggestion,
    SlashSuggestionKind,
};
pub use types::{
    is_valid_skill_name, parse_frontmatter, skill_name_from_dir, split_frontmatter,
    SkillFrontmatter, SkillLoadOutcome, SkillMetadata, SkillScope,
};
