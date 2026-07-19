use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use super::{permission::RiskLevel, Tool, ToolError, ToolOutput};
use crate::commands::AppState;

pub struct RunCommandTool;

#[derive(Debug, Deserialize)]
struct RunCommandArgs {
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
}

#[async_trait]
impl Tool for RunCommandTool {
    fn name(&self) -> &str {
        "run_command"
    }

    fn description(&self) -> &str {
        "Executes a shell command on the local machine and returns stdout+stderr output. \
         Commands timeout after 30 seconds by default. Output is capped by the terminal manager. \
         State does not persist between calls. Do not use this for long-running servers or watchers."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute."
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional working directory. Must resolve inside the active workspace. Defaults to the workspace root."
                },
                "timeout_ms": {
                    "type": "integer",
                    "description": "Maximum runtime in milliseconds before the command is killed. Default: 30000.",
                    "default": 30000,
                    "minimum": 1000,
                    "maximum": 120000
                }
            },
            "required": ["command"],
            "additionalProperties": false
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Critical
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn execute(
        &self,
        app: AppHandle,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let args: RunCommandArgs =
            serde_json::from_value(args).map_err(|e| ToolError::InvalidArguments {
                details: format!("Invalid run_command arguments: {}", e),
            })?;

        if args.command.trim().is_empty() {
            return Err(ToolError::InvalidArguments {
                details: "command cannot be empty".to_string(),
            });
        }

        let timeout_ms = args.timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000);
        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();

        let resolved_cwd = if let Some(cwd) = args.cwd.as_deref() {
            crate::workspace::resolve_workspace_path(&workspace, cwd).map_err(|e| {
                ToolError::PermissionDenied {
                    reason: format!("Workspace violation: {}", e),
                }
            })?
        } else {
            workspace
        };

        if !resolved_cwd.exists() || !resolved_cwd.is_dir() {
            return Err(ToolError::InvalidArguments {
                details: format!(
                    "cwd path does not exist or is not a directory: {}",
                    resolved_cwd.display()
                ),
            });
        }

        tracing::info!(
            command = %args.command,
            cwd = ?resolved_cwd,
            timeout_ms = timeout_ms,
            "RunCommandTool executing through v2 registry"
        );

        let result = {
            let sessions = state.terminal_sessions.read().await;
            sessions
                .execute_command(
                    &args.command,
                    Some(resolved_cwd.to_string_lossy().to_string()),
                    timeout_ms,
                    Some(state.process_manager.clone()),
                    tokio_util::sync::CancellationToken::new(),
                )
                .await
        }
        .map_err(|e| ToolError::ExecutionFailed {
            message: e.to_string(),
        })?;

        let formatted = result.format_for_llm(&args.command);

        Ok(ToolOutput {
            content: json!({
                "result": formatted,
                "exit_code": result.exit_code,
                "timed_out": result.timed_out,
            }),
            metadata: None,
        })
    }
}
