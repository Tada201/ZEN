//! SkillsManager: cached skill loader with cwd-keyed + config-keyed caches.
//!
//! Mirrors Codex's SkillsManager surface (sans `set_extra_roots` plugins side).
//! Provides `is_skill_enabled` and `is_skill_allowed_for_implicit_invocation`
//! gating helpers that future disable-config layers can hook into.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::sync::RwLock;

use super::discovery::{load_skills_from_roots, skill_roots, SkillRoot};
use super::types::{SkillLoadOutcome, SkillMetadata};

/// How long a cached skill scan stays fresh. Short enough that an
/// author/test loop (edit SKILL.md → next turn) picks up changes,
/// long enough to keep per-turn discovery off the filesystem.
pub const SKILLS_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(5);

#[derive(Debug, Clone, Default, Hash, PartialEq, Eq)]
pub struct ConfigSkillsCacheKey {
    pub cwd: PathBuf,
    pub home_dir: PathBuf,
    pub disabled_paths: Vec<PathBuf>,
}

pub struct SkillsManager {
    home_dir: PathBuf,
    extra_roots: RwLock<Vec<SkillRoot>>,
    cache_by_cwd: RwLock<HashMap<PathBuf, SkillLoadOutcome>>,
    cache_by_config: RwLock<HashMap<ConfigSkillsCacheKey, SkillLoadOutcome>>,
    disabled_names: RwLock<HashSet<String>>,
}

impl SkillsManager {
    pub fn new(home_dir: PathBuf) -> Self {
        Self {
            home_dir,
            extra_roots: RwLock::new(Vec::new()),
            cache_by_cwd: RwLock::new(HashMap::new()),
            cache_by_config: RwLock::new(HashMap::new()),
            disabled_names: RwLock::new(HashSet::new()),
        }
    }

    pub fn home_dir(&self) -> &Path {
        &self.home_dir
    }

    /// Resolve all roots (default + extra) for the given cwd.
    pub async fn roots_for(&self, cwd: &Path) -> Vec<SkillRoot> {
        let mut roots = skill_roots(cwd, &self.home_dir);
        let extras = self.extra_roots.read().await;
        roots.extend(extras.iter().cloned());
        roots
    }

    /// Load skills for a cwd, with cache. `force_reload` bypasses both caches.
    /// Cache entries expire after [`SKILLS_CACHE_TTL`] so authored/edited
    /// SKILL.md files surface without an app restart (no watcher needed).
    pub async fn skills_for_cwd(&self, cwd: &Path, force_reload: bool) -> SkillLoadOutcome {
        let abs_cwd = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());

        if !force_reload {
            if let Some(hit) = self.cache_by_cwd.read().await.get(&abs_cwd).cloned() {
                let fresh = hit
                    .scanned_at
                    .and_then(|t| t.elapsed().ok())
                    .is_some_and(|age| age < SKILLS_CACHE_TTL);
                if fresh {
                    return hit;
                }
            }
        }

        let roots = self.roots_for(&abs_cwd).await;
        let outcome = load_skills_from_roots(&roots);

        self.cache_by_cwd
            .write()
            .await
            .insert(abs_cwd, outcome.clone());
        outcome
    }

    /// Cache by config key — useful when extra_roots or disabled_paths change.
    pub async fn skills_for_config(&self, key: ConfigSkillsCacheKey) -> SkillLoadOutcome {
        if let Some(hit) = self.cache_by_config.read().await.get(&key).cloned() {
            return hit;
        }
        let roots = self.roots_for(&key.cwd).await;
        let mut outcome = load_skills_from_roots(&roots);
        // Apply disabled filter (post-merge).
        outcome
            .skills
            .retain(|s| !key.disabled_paths.contains(&s.path));
        outcome.disabled_paths = key.disabled_paths.iter().cloned().collect();

        self.cache_by_config
            .write()
            .await
            .insert(key, outcome.clone());
        outcome
    }

    pub async fn set_extra_roots(&self, roots: Vec<SkillRoot>) {
        *self.extra_roots.write().await = roots;
        self.clear_cache().await;
    }

    pub async fn clear_cache(&self) {
        self.cache_by_cwd.write().await.clear();
        self.cache_by_config.write().await.clear();
    }

    /// Currently-loaded skills for cwd. Convenience wrapper.
    pub async fn list(&self, cwd: &Path) -> Vec<SkillMetadata> {
        self.skills_for_cwd(cwd, false).await.skills
    }

    /// Enabled-only skills for cwd. The runtime toggle (`set_skill_enabled_state`,
    /// persisted as `skill:<name>:enabled`) removes a skill from every place the
    /// agent can reach it — catalog, slash autocomplete/parse, and mention/slash
    /// preload — while `list`/`skills_for_cwd` stay unfiltered so the registry UI
    /// can still render disabled skills with their toggle.
    pub async fn enabled_skills_for_cwd(&self, cwd: &Path) -> SkillLoadOutcome {
        let mut outcome = self.skills_for_cwd(cwd, false).await;
        outcome.skills.retain(|s| self.is_skill_enabled(s));
        outcome
    }

    pub fn is_skill_enabled(&self, skill: &SkillMetadata) -> bool {
        // Lock-free read: if another task holds the write lock, fall back
        // to default-enabled (the skill catalog has not yet been disabled).
        // The legacy `blocking_read()` panicked on `TryLockError`, which
        // could deadlock the runtime thread under contention.
        !self.disabled_names.try_read().ok().is_some_and(|s| s.contains(&skill.name))
    }

    pub fn is_skill_allowed_for_implicit_invocation(&self, skill: &SkillMetadata) -> bool {
        self.is_skill_enabled(skill) && skill.allow_implicit_invocation
    }

    /// Toggle a single skill's enabled state. Clears cache on change.
    pub async fn set_skill_enabled_state(&self, name: &str, enabled: bool) {
        if enabled {
            self.disabled_names.write().await.remove(name);
        } else {
            self.disabled_names.write().await.insert(name.to_string());
        }
        self.clear_cache().await;
    }

    /// Bulk-set disabled names (e.g. from persisted settings on startup).
    pub async fn set_disabled_names(&self, names: impl IntoIterator<Item = String>) {
        let set: HashSet<String> = names.into_iter().collect();
        *self.disabled_names.write().await = set;
        self.clear_cache().await;
    }
}

/// Shared handle.
pub type SharedSkillsManager = Arc<SkillsManager>;

/// Resolve the directory a skill lookup should scan for a given chat: the
/// chat's captured workspace root when set (canonicalized), else the process
/// cwd. Agent tools only know their chat_id, so this is the bridge from
/// chat → discovery root.
pub async fn cwd_for_chat(app: &tauri::AppHandle, chat_id: &str) -> PathBuf {
    use tauri::Manager;
    let fallback = || std::env::current_dir().unwrap_or_default();
    let Some(state) = app.try_state::<crate::commands::AppState>() else {
        return fallback();
    };
    let Ok(db) = state.db().await else {
        return fallback();
    };
    crate::db::queries::get_chat(&db, chat_id)
        .await
        .ok()
        .and_then(|chat| chat.workspace_root)
        .and_then(|root| {
            crate::workspace::canonicalize_workspace_root(std::path::Path::new(&root)).ok()
        })
        .unwrap_or_else(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_skill(root: &Path, name: &str, desc: &str) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(super::super::discovery::SKILLS_FILENAME),
            format!("---\nname: {}\ndescription: {}\n---\n", name, desc),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn manager_caches_by_cwd() {
        let tmp = std::env::temp_dir().join(format!(
            "zen_skills_mgr_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&tmp).unwrap();

        let home = tmp.join("home");
        let project = tmp.join("project");
        fs::create_dir_all(home.join(".zen/skills")).unwrap();
        fs::create_dir_all(project.join(".agents/skills")).unwrap();
        write_skill(&home.join(".zen/skills"), "shared", "user-shared");
        write_skill(&project.join(".agents/skills"), "local", "repo-local");

        let mgr = SkillsManager::new(home.clone());
        let first = mgr.skills_for_cwd(&project, false).await;
        let second = mgr.skills_for_cwd(&project, false).await;
        // Same outcome (cache hit returns same data, same pointers within struct).
        assert_eq!(first.skills.len(), second.skills.len());
        assert_eq!(first.skills.len(), 2);

        fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn enabled_filter_drops_disabled_skill() {
        let tmp = std::env::temp_dir().join(format!(
            "zen_skills_enabled_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let home = tmp.join("home");
        fs::create_dir_all(home.join(".zen/skills")).unwrap();
        write_skill(&home.join(".zen/skills"), "keep", "stays");
        write_skill(&home.join(".zen/skills"), "drop", "gets-disabled");

        let mgr = SkillsManager::new(home.clone());
        mgr.set_skill_enabled_state("drop", false).await;

        let all = mgr.skills_for_cwd(&home, false).await;
        assert_eq!(all.skills.len(), 2, "unfiltered list keeps both for the UI");
        let enabled = mgr.enabled_skills_for_cwd(&home).await;
        assert_eq!(enabled.skills.len(), 1);
        assert_eq!(enabled.skills[0].name, "keep");

        fs::remove_dir_all(&tmp).ok();
    }
}
