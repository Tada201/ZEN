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
    let workspace_dir = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let current_dir = std::env::current_dir().unwrap_or_else(|_| workspace_dir.clone());

    vec![
        current_dir.join("resources/prompts"),
        workspace_dir.join("resources/prompts"),
        manifest_dir.join("resources/prompts"),
    ]
}
