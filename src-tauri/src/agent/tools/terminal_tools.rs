use crate::agent::tools::AgentTool;
use crate::commands::AppState;
use crate::services::{AuditEvent, PermissionDecision, PrivilegedOperation};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// Agent tool that executes a shell command and returns the output.
/// Similar to Zed's terminal_tool — spawns a temporary PTY, runs the command,
/// collects stdout+stderr, and returns formatted output to the LLM.
pub struct RunCommandTool;

#[async_trait]
impl AgentTool for RunCommandTool {
    fn id(&self) -> &str {
        "run_command"
    }

    fn description(&self) -> &str {
        "Executes a shell command on the local machine and returns stdout+stderr output. \
         IMPORTANT LIMITS: Commands timeout after 30 seconds by default. Output is capped at 16KB \
         (longer output will show last 16KB with [OUTPUT TRUNCATED] marker). Only the exit code and \
         final output are returned — no real-time streaming. State does not persist between calls. \
         Use this for CLI commands, file checks, package installs, scripts, etc. Do NOT use for \
         long-running servers or watchers — they will timeout. Always set timeout_ms for commands \
         you expect to take time."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute (one-liner or multi-line script)."
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional working directory for the command. Defaults to the current working directory of the application process."
                },
                "timeout_ms": {
                    "type": "integer",
                    "description": "Maximum runtime in milliseconds before the command is killed. Default: 30000 (30 seconds).",
                    "default": 30000
                }
            },
            "required": ["command"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        _chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        use crate::workspace::resolve_workspace_path;

        let command = input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing required field: command"))?
            .to_string();

        let cwd = input
            .get("cwd")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let timeout_ms = input
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(30_000)
            .clamp(1_000, 120_000);

        // Get workspace folder from AppState
        let state = app.state::<AppState>();
        let workspace = state.workspace_folder.read().await.clone();

        // Resolve and validate cwd is within workspace (if provided)
        let resolved_cwd = if let Some(ref dir) = cwd {
            Some(
                resolve_workspace_path(&workspace, dir)
                    .map_err(|e| anyhow::anyhow!("Workspace violation: {}", e))?,
            )
        } else {
            // Default to workspace root
            Some(workspace.clone())
        };

        // Validate path exists and is a directory
        if let Some(ref dir) = resolved_cwd {
            if !dir.exists() || !dir.is_dir() {
                return Err(anyhow::anyhow!(
                    "CWD path does not exist or is not a directory: {}",
                    dir.display()
                ));
            }
        }

        tracing::info!(command = %command, cwd = ?resolved_cwd, timeout_ms = timeout_ms, "RunCommandTool executing");
        state
            .security
            .record_audit(AuditEvent {
                operation: PrivilegedOperation::ShellCommand,
                decision: PermissionDecision::Allow,
                caller: "run_command_tool".to_string(),
                target: Some(command.clone()),
                reason: Some(format!(
                    "agent command execution requested with timeout {}ms",
                    timeout_ms
                )),
            })
            .await;

        // Emit event so the TERM panel can show the command being executed
        let _ = app.emit(
            "terminal:ai-command",
            json!({
                "command": command,
                "cwd": resolved_cwd,
            }),
        );

        // Execute the command through the terminal manager
        let state = app.state::<AppState>();
        let result: Result<crate::terminal::CommandResult, anyhow::Error> = {
            let mut sessions = state.terminal_sessions.write().await;
            sessions
                .execute_command(
                    &command,
                    resolved_cwd.map(|p| p.to_string_lossy().to_string()),
                    timeout_ms,
                )
                .await
        };

        match result {
            Ok(cmd_result) => {
                let formatted = cmd_result.format_for_llm(&command);

                // Emit the output to the TERM panel
                let _ = app.emit(
                    "terminal:ai-output",
                    json!({
                        "command": command,
                        "output": cmd_result.output,
                        "exit_code": cmd_result.exit_code,
                        "timed_out": cmd_result.timed_out,
                    }),
                );

                tracing::info!(
                    exit_code = ?cmd_result.exit_code,
                    timed_out = cmd_result.timed_out,
                    output_len = cmd_result.output.len(),
                    "RunCommandTool completed"
                );

                Ok(json!({
                    "result": formatted,
                    "exit_code": cmd_result.exit_code,
                    "timed_out": cmd_result.timed_out,
                }))
            }
            Err(e) => {
                tracing::error!(error = %e, "RunCommandTool failed");
                Err(e)
            }
        }
    }
}
