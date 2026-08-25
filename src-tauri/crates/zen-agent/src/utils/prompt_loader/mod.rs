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
    // The crate now lives two levels below `src-tauri` (Phase 11), so the
    // historical src-tauri root is grandparent, not parent. Both roots are
    // kept so dev runs from either cwd still resolve.
    let crate_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let src_tauri_root = crate_root.parent().unwrap_or(&crate_root).to_path_buf();
    let current_dir = std::env::current_dir().unwrap_or_else(|_| src_tauri_root.clone());

    vec![
        current_dir.join("resources/prompts"),
        src_tauri_root.join("resources/prompts"),
        manifest_dir.join("resources/prompts"),
    ]
}
