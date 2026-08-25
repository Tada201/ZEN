//! Skill discovery: two roots + ancestor walk, BFS scan, dedup by scope.
//!
//! Mirrors Codex's loader surface (sans plugin roots / sidecar / `allow_implicit_invocation`
//! default-from-frontmatter). Stripped to the parts ZEN needs.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::types::{
    parse_frontmatter, skill_name_from_dir, split_frontmatter, SkillLoadOutcome, SkillMetadata,
    SkillScope,
};

pub const SKILLS_FILENAME: &str = "SKILL.md";
pub const AGENTS_DIR_NAME: &str = ".agents";
pub const SKILLS_DIR_NAME: &str = "skills";
pub const ZEN_HOME_DIR: &str = ".zen";
pub const MAX_SCAN_DEPTH: usize = 6;
pub const MAX_SKILLS_DIRS_PER_ROOT: usize = 2000;

#[derive(Debug, Clone)]
pub struct SkillRoot {
    pub path: PathBuf,
    pub scope: SkillScope,
}

impl SkillRoot {
    pub fn new(path: PathBuf, scope: SkillScope) -> Self {
        Self { path, scope }
    }
}

/// Resolve all skill roots for a given cwd. Order: User first (lowest precedence),
/// then Repo (workspace ancestor walk from cwd up to project root).
pub fn skill_roots(cwd: &Path, home_dir: &Path) -> Vec<SkillRoot> {
    let mut roots = Vec::new();

    // User home (~/.zen/skills/)
    let user_root = home_dir.join(ZEN_HOME_DIR).join(SKILLS_DIR_NAME);
    roots.push(SkillRoot::new(user_root, SkillScope::User));

    // Workspace ancestor walk: from project_root down to cwd (Codex-style).
    if let Some(project_root) = find_project_root(cwd) {
        for dir in dirs_between_project_root_and_cwd(cwd, &project_root) {
            let repo_skills = dir.join(AGENTS_DIR_NAME).join(SKILLS_DIR_NAME);
            roots.push(SkillRoot::new(repo_skills, SkillScope::Repo));
        }
    }

    roots
}

/// Find the project root by walking up from `cwd` looking for `.git` or `AGENTS.md`.
fn find_project_root(cwd: &Path) -> Option<PathBuf> {
    const MARKERS: &[&str] = &[".git", "AGENTS.md"];
    let mut dir = cwd.to_path_buf();
    loop {
        for marker in MARKERS {
            if dir.join(marker).exists() {
                return Some(dir);
            }
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Return dirs from `project_root` down to and including `cwd` (inclusive).
/// Stops at filesystem root. Includes `project_root` itself (Codex includes it).
fn dirs_between_project_root_and_cwd(cwd: &Path, project_root: &Path) -> Vec<PathBuf> {
    let cwd_abs = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let root_abs = project_root.canonicalize().unwrap_or_else(|_| project_root.to_path_buf());

    let mut dirs = Vec::new();
    let mut dir = cwd_abs;
    loop {
        dirs.push(dir.clone());
        if dir == root_abs {
            break;
        }
        if !dir.pop() {
            break;
        }
    }
    dirs.reverse();
    dirs
}

/// BFS-scan each root up to MAX_SCAN_DEPTH, looking for `<dir>/SKILLS_FILENAME` files.
/// Returns merged outcome with dedup by `path` (Repo scope wins over User).
pub fn load_skills_from_roots(roots: &[SkillRoot]) -> SkillLoadOutcome {
    let mut by_path: HashMap<PathBuf, SkillMetadata> = HashMap::new();
    let mut scanned_dirs = 0usize;

    for root in roots {
        if !root.path.exists() {
            continue;
        }
        let found = scan_root(&root.path, root.scope, &mut scanned_dirs);
        for (path, mut skill) in found {
            // Dedup: if existing entry has lower scope number (=higher priority), keep it.
            // SkillScope is ordered User(0) < Repo(1) < System(2); Repo wins.
            if let Some(existing) = by_path.get(&path) {
                if existing.scope >= skill.scope {
                    continue;
                }
            }
            skill.path = path.clone();
            by_path.insert(path, skill);
        }
    }

    let mut skills: Vec<SkillMetadata> = by_path.into_values().collect();
    // Stable order: scope asc (User first), then name asc.
    skills.sort_by(|a, b| a.scope.cmp(&b.scope).then_with(|| a.name.cmp(&b.name)));

    SkillLoadOutcome {
        skills,
        disabled_paths: Default::default(),
        scanned_at: Some(std::time::SystemTime::now()),
    }
}

fn scan_root(
    root: &Path,
    scope: SkillScope,
    scanned_dirs: &mut usize,
) -> Vec<(PathBuf, SkillMetadata)> {
    let mut out = Vec::new();
    let mut queue = std::collections::VecDeque::new();
    queue.push_back((root.to_path_buf(), 0usize));

    while let Some((dir, depth)) = queue.pop_front() {
        if *scanned_dirs >= MAX_SKILLS_DIRS_PER_ROOT {
            break;
        }
        if depth > MAX_SCAN_DEPTH {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        *scanned_dirs += 1;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            // Look for <skill-name>/SKILLS_FILENAME
            let skill_md = path.join(SKILLS_FILENAME);
            if skill_md.is_file() {
                if let Some(meta) = parse_skill_md(&skill_md, scope) {
                    out.push((skill_md, meta));
                }
            }
            // Recurse (BFS) up to depth limit
            if depth < MAX_SCAN_DEPTH {
                queue.push_back((path, depth + 1));
            }
        }
    }
    out
}

/// Parse a single SKILLS_FILENAME file into metadata. Returns None on any error.
fn parse_skill_md(path: &Path, scope: SkillScope) -> Option<SkillMetadata> {
    let content = std::fs::read_to_string(path).ok()?;

    let (fm_text, _body) = split_frontmatter(&content)?;
    let fm = parse_frontmatter(fm_text);

    // Dir name is authoritative (Codex invariant: dir_name == frontmatter.name).
    let dir = path.parent()?;
    let dir_name = skill_name_from_dir(dir)?;
    let name = fm.name.unwrap_or_else(|| dir_name.clone());
    if name != dir_name {
        // Mismatch — skip; strict parity with Codex invariant.
        return None;
    }
    let description = fm.description?;
    if description.is_empty() {
        return None;
    }

    Some(SkillMetadata {
        name,
        description,
        short_description: fm.short_description,
        scope,
        path: path.to_path_buf(),
        allow_implicit_invocation: fm.allow_implicit_invocation.unwrap_or(true),
        tools_required: fm.requires_tools.unwrap_or_default(),
        invocation_syntax: fm
            .invocation_syntax
            .unwrap_or_else(|| format!("/{}", dir_name)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let p = std::env::temp_dir().join(format!("zen_skills_test_{nanos}"));
            std::fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }

    fn tempdir() -> TempDir {
        TempDir::new()
    }

    fn make_skill(dir: &Path, name: &str, desc: &str, allow_implicit: bool) {
        let skill_dir = dir.join(name);
        fs::create_dir_all(&skill_dir).unwrap();
        let body = format!(
            "---\nname: {}\ndescription: {}\nallow_implicit_invocation: {}\n---\n\n# Body\n",
            name,
            desc,
            allow_implicit
        );
        fs::write(skill_dir.join(SKILLS_FILENAME), body).unwrap();
    }

    #[test]
    fn scan_root_finds_immediate_skill() {
        let tmp = tempdir();
        make_skill(tmp.path(), "foo", "does foo things", true);
        let mut counter = 0;
        let found = scan_root(tmp.path(), SkillScope::Repo, &mut counter);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].1.name, "foo");
    }

    #[test]
    fn dedup_repo_wins_user() {
        let tmp = tempdir();
        let user_dir = tmp.path().join("user_clone");
        let repo_dir = tmp.path().join("repo_clone");
        fs::create_dir_all(&user_dir).unwrap();
        fs::create_dir_all(&repo_dir).unwrap();

        make_skill(&user_dir, "dup", "user version", false);
        make_skill(&repo_dir, "dup", "repo version", true);

        let roots = vec![
            SkillRoot::new(user_dir, SkillScope::User),
            SkillRoot::new(repo_dir, SkillScope::Repo),
        ];
        let outcome = load_skills_from_roots(&roots);
        assert_eq!(outcome.skills.len(), 1);
        assert_eq!(outcome.skills[0].description, "repo version");
        assert!(outcome.skills[0].allow_implicit_invocation);
    }

    #[test]
    fn skill_name_validation_rejects_bad_dir_name() {
        let tmp = tempdir();
        let bad = tmp.path().join("UPPER_case");
        fs::create_dir_all(&bad).unwrap();
        fs::write(
            bad.join(SKILLS_FILENAME),
            "---\nname: UPPER_case\ndescription: x\n---\n",
        )
        .unwrap();
        let mut counter = 0;
        let found = scan_root(tmp.path(), SkillScope::Repo, &mut counter);
        assert_eq!(found.len(), 0, "invalid dir name should be skipped");
    }
}
