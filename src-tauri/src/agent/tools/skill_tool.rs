//! `skill` tool — list available skills (metadata) or load a single skill's body.
//!
//! Mirrors Codex/codebuff skill tool surface: single tool, two actions.
//! Bodies are read from disk on demand; metadata comes from `SkillsManager`.

use crate::agent::skills::SkillsManager;
use crate::agent::tools::AgentTool;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::AppHandle;

pub struct SkillTool {
    manager: Arc<SkillsManager>,
}

impl SkillTool {
    pub fn new(manager: Arc<SkillsManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl AgentTool for SkillTool {
    fn id(&self) -> &str {
        "skill"
    }

    fn description(&self) -> &str {
        "Load a skill by name to get its full instructions, or execute one with args. \
         Pass {\"action\":\"list\"} to enumerate available skills (name + description only). \
         Pass {\"action\":\"load\",\"name\":\"<skill-name>\"} to read the full SKILL.md body. \
         Pass {\"action\":\"execute\",\"name\":\"<skill-name>\",\"args\":\"<text>\"} to expand a skill's \
         prompt template with $ARGUMENTS substitution. \
         Skill bodies are loaded on demand — invoke this before acting on a skill's instructions."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "load", "execute"],
                    "description": "list = enumerate available skills, load = read full body, execute = expand prompt template with args"
                },
                "name": {
                    "type": "string",
                    "description": "Skill name (kebab-case). Required when action=load or action=execute."
                },
                "args": {
                    "type": "string",
                    "description": "Arguments for template expansion. Used only when action=execute."
                }
            },
            "required": ["action"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        _app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("missing 'action' field"))?;

        let cwd = std::env::current_dir().unwrap_or_default();

        match action {
            "list" => {
                let outcome = self.manager.skills_for_cwd(&cwd, false).await;
                let items: Vec<Value> = outcome
                    .skills
                    .iter()
                    .map(|s| {
                        json!({
                            "name": s.name,
                            "description": s.description,
                            "short_description": s.short_description,
                            "scope": s.scope.as_str(),
                            "allow_implicit_invocation": s.allow_implicit_invocation,
                            "invocation_syntax": s.invocation_syntax,
                            "tools_required": s.tools_required,
                        })
                    })
                    .collect();
                Ok(json!({
                    "available_skills": items,
                    "count": items.len(),
                }))
            }
            "load" | "execute" => {
                let name = input
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("missing 'name' for action={}", action))?;
                let args = input.get("args").and_then(|v| v.as_str()).unwrap_or("");
                let outcome = self.manager.skills_for_cwd(&cwd, false).await;
                let skill = outcome
                    .find_by_name(name)
                    .ok_or_else(|| anyhow!("skill not found: {}", name))?;
                let body = tokio::fs::read_to_string(&skill.path)
                    .await
                    .map_err(|e| anyhow!("failed to read {}: {}", skill.path.display(), e))?;
                if action == "execute" {
                    let suffix = if args.is_empty() {
                        String::new()
                    } else {
                        format!(": {}", args)
                    };
                    let expanded = body
                        .replace("$ARGUMENTS_SUFFIX", &suffix)
                        .replace("$ARGUMENTS", args);
                    Ok(json!({
                        "name": skill.name,
                        "description": skill.description,
                        "scope": skill.scope.as_str(),
                        "content": expanded,
                    }))
                } else {
                    Ok(json!({
                        "name": skill.name,
                        "description": skill.description,
                        "scope": skill.scope.as_str(),
                        "path": skill.path.display().to_string(),
                        "content": body,
                    }))
                }
            }
            other => Err(anyhow!("unknown action: {}", other)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::skills::SkillsManager;

    #[test]
    fn schema_is_valid() {
        let mgr = Arc::new(SkillsManager::new(std::env::temp_dir()));
        let tool = SkillTool::new(mgr);
        let schema = tool.input_schema();
        assert_eq!(schema["properties"]["action"]["enum"][0], "list");
        assert_eq!(schema["properties"]["action"]["enum"][1], "load");
        assert_eq!(schema["properties"]["action"]["enum"][2], "execute");
        assert!(schema["required"].as_array().unwrap().contains(&json!("action")));
    }
}
