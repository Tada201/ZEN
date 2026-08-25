use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

pub fn load_prompt(name: &str) -> Result<String> {
    if !name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        anyhow::bail!("Invalid prompt name: {}", name);
    }

    for base in prompt_search_roots() {
        let path = base.join(format!("{}.txt", name));
        if path.is_file() {
            return fs::read_to_string(&path)
                .with_context(|| format!("Failed to read prompt file: {:?}", path));
        }
    }

    anyhow::bail!(
        "Prompt '{}' not found in search roots: {:?}",
        name,
        prompt_search_roots()
    )
}

fn prompt_search_roots() -> Vec<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // Prompt files live in `<repo-root>/resources/prompts`. This crate sits at
    // `<repo-root>/src-tauri/crates/zen-agent`, so the repo root is three
    // levels up; `src-tauri` itself has no `resources/prompts` directory.
    let repo_root = manifest_dir
        .ancestors()
        .nth(3)
        .unwrap_or(&manifest_dir)
        .to_path_buf();
    let current_dir = std::env::current_dir().unwrap_or_else(|_| repo_root.clone());

    vec![
        current_dir.join("resources/prompts"),
        repo_root.join("resources/prompts"),
        manifest_dir.join("resources/prompts"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_relative_root_resolves_repo_prompts() {
        let roots = prompt_search_roots();
        assert!(
            roots.iter().any(|root| root.join("orchestrator_planning.txt").is_file()),
            "no search root resolves the shipped prompts dir: {:?}",
            roots
        );
    }

    #[test]
    fn rejects_path_traversal_names() {
        assert!(load_prompt("../secrets").is_err());
    }
}
