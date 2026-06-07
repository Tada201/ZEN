use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Per-agent JSON config file stored in user app data directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigFile {
    /// Agent ID this config applies to (e.g. "generalist")
    pub agent_id: String,
    /// Model name override (empty = use global default)
    #[serde(default)]
    pub model_name: String,
    /// Maximum iterations for this agent's loop
    #[serde(default = "default_max_iterations")]
    pub max_iterations: u32,
    /// Tool IDs allowed for this agent (empty = use agent's default tools)
    #[serde(default)]
    pub enabled_tools: Vec<String>,
    /// Optional system prompt override
    #[serde(default)]
    pub system_prompt_override: Option<String>,
    /// Optional description
    #[serde(default)]
    pub description: Option<String>,
}

fn default_max_iterations() -> u32 {
    10
}

impl Default for AgentConfigFile {
    fn default() -> Self {
        Self {
            agent_id: String::new(),
            model_name: String::new(),
            max_iterations: default_max_iterations(),
            enabled_tools: Vec::new(),
            system_prompt_override: None,
            description: None,
        }
    }
}

// ─── Path Resolution ────────────────────────────────────────────

/// Get the user-writable config directory outside the source tree.
/// Uses the OS-specific app config directory so writes never trigger
/// Vite/Tauri dev server reloads.
fn user_config_dir() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("zen")
        .join("agent_configs");
    Ok(dir)
}

/// Resolve the bundled/default config directory for reading
/// `_default.json` template and fallback configs.
/// Tries multiple locations to handle dev vs production paths.
fn resource_config_dir() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from("resources/agents/configs"),
        PathBuf::from("src-tauri/resources/agents/configs"),
        PathBuf::from("../resources/agents/configs"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("resources")
            .join("agents")
            .join("configs"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
            .join("resources")
            .join("agents")
            .join("configs"),
    ];

    // Also try relative to the executable (production builds)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("resources").join("agents").join("configs");
            if p.exists() {
                return Some(p);
            }
        }
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Some(std::fs::canonicalize(candidate).unwrap_or_else(|_| candidate.clone()));
        }
    }

    None
}

/// Load the `_default.json` template from bundled resources.
fn get_default_config() -> AgentConfigFile {
    if let Some(dir) = resource_config_dir() {
        let path = dir.join("_default.json");
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<AgentConfigFile>(&content) {
                    return config;
                }
            }
        }
    }
    AgentConfigFile::default()
}

// ─── Public API ──────────────────────────────────────────────────

/// Load the config for a given agent_id.
/// Priority: user config dir → resource template dir → built-in defaults.
pub fn load_agent_config(agent_id: &str) -> Result<AgentConfigFile> {
    // 1. Check user config dir first
    let user_dir = user_config_dir()?;
    let user_path = user_dir.join(format!("{}.json", agent_id));

    if user_path.exists() {
        let content = std::fs::read_to_string(&user_path)
            .with_context(|| format!("Failed to read user config: {}", user_path.display()))?;
        let mut config: AgentConfigFile = serde_json::from_str(&content)
            .with_context(|| format!("Invalid JSON in user config: {}", user_path.display()))?;
        if config.agent_id != agent_id && !config.agent_id.is_empty() {
            tracing::warn!(
                "User config {} has agent_id '{}' but requested '{}'",
                user_path.display(),
                config.agent_id,
                agent_id
            );
        }
        config.agent_id = agent_id.to_string();
        return Ok(config);
    }

    // 2. Fall back to resource template dir
    if let Some(res_dir) = resource_config_dir() {
        let res_path = res_dir.join(format!("{}.json", agent_id));
        if res_path.exists() {
            let content = std::fs::read_to_string(&res_path).with_context(|| {
                format!("Failed to read resource config: {}", res_path.display())
            })?;
            let mut config: AgentConfigFile =
                serde_json::from_str(&content).with_context(|| {
                    format!("Invalid JSON in resource config: {}", res_path.display())
                })?;
            config.agent_id = agent_id.to_string();
            return Ok(config);
        }
    }

    // 3. Fall back to _default.json template
    let mut config = get_default_config();
    config.agent_id = agent_id.to_string();
    Ok(config)
}

/// Save (create or update) a per-agent config file to the user data directory.
/// Writes outside the source tree to avoid triggering Vite dev server reloads.
pub fn save_agent_config(agent_id: &str, config: &AgentConfigFile) -> Result<()> {
    let dir = user_config_dir()?;
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create user config directory: {}", dir.display()))?;

    let file_path = dir.join(format!("{}.json", agent_id));

    let mut saved = config.clone();
    saved.agent_id = agent_id.to_string();

    let json = serde_json::to_string_pretty(&saved).context("Failed to serialize agent config")?;

    std::fs::write(&file_path, json)
        .with_context(|| format!("Failed to write config file: {}", file_path.display()))?;

    tracing::info!("Saved agent config: {}", file_path.display());
    Ok(())
}

/// Delete a per-agent config file from the user data directory.
pub fn delete_agent_config(agent_id: &str) -> Result<()> {
    let dir = user_config_dir()?;
    let file_path = dir.join(format!("{}.json", agent_id));

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .with_context(|| format!("Failed to delete config file: {}", file_path.display()))?;
        tracing::info!("Deleted agent config: {}", file_path.display());
    }
    Ok(())
}

/// List agent configs from user config dir (not resource dir).
pub fn list_agent_configs() -> Result<Vec<AgentConfigFile>> {
    let dir = user_config_dir()?;

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut configs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(config) = serde_json::from_str::<AgentConfigFile>(&content) {
                        configs.push(config);
                    }
                }
            }
        }
    }

    Ok(configs)
}

/// Export an agent config to a user-chosen file path.
pub fn export_agent_config(agent_id: &str, export_path: &str) -> Result<()> {
    let config = load_agent_config(agent_id)?;
    let json = serde_json::to_string_pretty(&config).context("Failed to serialize for export")?;
    std::fs::write(export_path, json)
        .with_context(|| format!("Failed to write export file: {}", export_path))?;
    Ok(())
}

/// Import an agent config from a file path and save to user config dir.
pub fn import_agent_config(
    import_path: &str,
    target_agent_id: Option<String>,
) -> Result<AgentConfigFile> {
    let content = std::fs::read_to_string(import_path)
        .with_context(|| format!("Failed to read import file: {}", import_path))?;
    let mut config: AgentConfigFile = serde_json::from_str(&content)
        .with_context(|| format!("Invalid JSON in import file: {}", import_path))?;

    let agent_id = target_agent_id.unwrap_or_else(|| config.agent_id.clone());
    if agent_id.is_empty() {
        anyhow::bail!("Imported config has no agent_id and no target was specified");
    }

    config.agent_id = agent_id.clone();
    save_agent_config(&agent_id, &config)?;
    Ok(config)
}

/// Check if a per-agent config file exists in the user config dir.
pub fn has_custom_config(agent_id: &str) -> bool {
    if let Ok(dir) = user_config_dir() {
        dir.join(format!("{}.json", agent_id)).exists()
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_values() {
        let config = AgentConfigFile::default();
        assert_eq!(config.max_iterations, 10);
        assert!(config.enabled_tools.is_empty());
        assert!(config.model_name.is_empty());
    }

    #[test]
    fn test_serialize_deserialize() {
        let config = AgentConfigFile {
            agent_id: "test".to_string(),
            model_name: "gpt-4o".to_string(),
            max_iterations: 15,
            enabled_tools: vec!["web_search".to_string(), "write_file".to_string()],
            system_prompt_override: Some("Custom prompt".to_string()),
            description: Some("Test config".to_string()),
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        let parsed: AgentConfigFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agent_id, "test");
        assert_eq!(parsed.model_name, "gpt-4o");
        assert_eq!(parsed.max_iterations, 15);
        assert_eq!(parsed.enabled_tools.len(), 2);
        assert_eq!(
            parsed.system_prompt_override,
            Some("Custom prompt".to_string())
        );
    }

    #[test]
    fn test_user_config_dir_does_not_overlap_source_tree() {
        let dir = user_config_dir().unwrap();
        let dir_str = dir.to_string_lossy();
        // Must not be inside src-tauri or the project root
        assert!(
            !dir_str.contains("src-tauri"),
            "user config dir must not be in src-tauri"
        );
    }
}
