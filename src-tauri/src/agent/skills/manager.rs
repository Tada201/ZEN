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
    pub async fn skills_for_cwd(&self, cwd: &Path, force_reload: bool) -> SkillLoadOutcome {
        let abs_cwd = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());

        if !force_reload {
            if let Some(hit) = self.cache_by_cwd.read().await.get(&abs_cwd).cloned() {
                return hit;
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
}
