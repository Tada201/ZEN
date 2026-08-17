use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::agent::tools::AgentTool;

/// Parsed checklist item after tolerant field extraction.
struct TodoItem {
    task: String,
    /// Model-supplied lifecycle state, already normalized to
    /// "completed" | "in-progress" | "pending". `None` means the model gave
    /// no explicit signal, so status is derived by position downstream.
    status: Option<&'static str>,
}

/// Accept the many shapes different model families emit for a checklist item.
/// Codex uses `{step, status}`, Claude `{content, status, activeForm}`, and
/// ZEN's own prompt teaches `{task, completed}`. Extract defensively so a
/// near-miss shape still renders instead of failing the whole tool call.
fn parse_todo_item(item: &Value) -> Option<TodoItem> {
    let obj = item.as_object()?;
    let task = ["task", "step", "content", "description", "title", "name"]
        .iter()
        .find_map(|key| obj.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|s| !s.is_empty())?
        .to_string();

    let status = obj
        .get("status")
        .and_then(Value::as_str)
        .map(normalize_status)
        .or_else(|| {
            ["completed", "done", "complete"]
                .iter()
                .find_map(|key| obj.get(*key).and_then(Value::as_bool))
                .map(|done| if done { "completed" } else { "pending" })
        });

    Some(TodoItem { task, status })
}

fn normalize_status(raw: &str) -> &'static str {
    match raw.trim().to_lowercase().as_str() {
        "completed" | "complete" | "done" | "success" => "completed",
        "in_progress" | "in-progress" | "active" | "running" | "started" => "in-progress",
        _ => "pending",
    }
}

pub struct WriteTodosTool;

#[async_trait]
impl AgentTool for WriteTodosTool {
    fn id(&self) -> &str {
        "write_todos"
    }

    fn description(&self) -> &str {
        "Write or update the visible task checklist for multi-step work. Use for tasks that require 3+ steps, and update it as work completes."
    }

    fn input_schema(&self) -> Value {
        // The gate is deliberately permissive: `todos` may arrive as an array or
        // a stringified JSON array, and items only need *some* task-like key. The
        // tool body (`parse_todo_item`) does the real, tolerant field extraction
        // across model families (Codex `{step,status}`, Claude `{content,status}`,
        // ZEN `{task,completed}`) and returns friendly errors for unusable input,
        // so a strict `required`/`enum` here would reject valid cross-model shapes
        // before that parser ever runs. Descriptions still steer the model.
        json!({
            "type": "object",
            "properties": {
                "todos": {
                    "type": ["array", "string"],
                    "description": "Ordered task checklist. Include every meaningful step in execution order.",
                    "items": {
                        "properties": {
                            "task": { "type": "string", "description": "Task description (action-oriented, e.g. 'Run tests')" },
                            "status": {
                                "type": "string",
                                "description": "Lifecycle state: pending | in_progress | completed. At most one item should be in_progress at a time."
                            }
                        }
                    }
                }
            },
            "required": ["todos"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: CancellationToken,
    ) -> Result<Value> {
        let mut input = input;
        // Normalize: if 'todos' is a stringified JSON, parse it
        if let Some(todos_str) = input.get("todos").and_then(|v| v.as_str()) {
            if let Ok(parsed) = serde_json::from_str::<Value>(todos_str) {
                input["todos"] = parsed;
            }
        }

        // Handle empty array as clearing mechanism
        if let Some(todos) = input.get("todos").and_then(|v| v.as_array()) {
            if todos.is_empty() {
                 let _ = app.emit(
                    "task:list_updated",
                    json!({
                        "chat_id": chat_id,
                        "tasks": []
                    }),
                );
                return Ok(json!({ "message": "Checklist cleared" }));
            }
        }

        let raw_items = match input.get("todos").and_then(|v| v.as_array()) {
            Some(items) => items,
            None => return Ok(json!({ "error": "Expected a 'todos' array." })),
        };
        let parsed: Vec<TodoItem> = raw_items.iter().filter_map(parse_todo_item).collect();
        if parsed.is_empty() {
            return Ok(json!({
                "error": "No usable checklist items. Each item needs a task description.",
                "hint": "Send {\"todos\": [{\"task\": \"...\", \"status\": \"pending|in_progress|completed\"}]}."
            }));
        }

        // Honor explicit model status when present; otherwise mark the first
        // non-completed item in-progress and the rest pending (positional
        // fallback). Exactly one item may be in-progress at a time: if the model
        // marks several active, only the first survives, the rest fall back to
        // pending so the "current step" highlight stays unambiguous.
        let model_set_progress = parsed.iter().any(|t| t.status == Some("in-progress"));
        let now = chrono::Utc::now().timestamp_millis();
        let mut fallback_used = false;
        let mut active_assigned = false;
        let tasks: Vec<Value> = parsed
            .iter()
            .enumerate()
            .map(|(index, todo)| {
                let status = match todo.status {
                    Some("in-progress") => {
                        if active_assigned {
                            "pending"
                        } else {
                            active_assigned = true;
                            "in-progress"
                        }
                    }
                    Some(explicit) => explicit,
                    None if !model_set_progress && !fallback_used => {
                        fallback_used = true;
                        active_assigned = true;
                        "in-progress"
                    }
                    None => "pending",
                };
                let progress = match status {
                    "completed" => 100,
                    "in-progress" => 20,
                    _ => 0,
                };
                json!({
                    "id": format!("{}_todo_{}", chat_id, index),
                    "description": todo.task,
                    "assignedTo": "ZEN",
                    "status": status,
                    "progress": progress,
                    "chatId": chat_id,
                    "createdAt": now + index as i64,
                    "updatedAt": now
                })
            })
            .collect();

        let _ = app.emit(
            "task:list_updated",
            json!({
                "chat_id": chat_id,
                "tasks": tasks
            }),
        );

        let completed = parsed.iter().filter(|t| t.status == Some("completed")).count();
        Ok(json!({
            "message": "Todos written",
            "total": parsed.len(),
            "completed": completed
        }))
    }
}

/// Model-facing lifecycle control for the session's persistent goal.
/// Terminal transitions only (`complete` with evidence, `blocked` after a
/// recurring blocker) — pause/resume/clear are user-controlled and are
/// intentionally not reachable from the model.
pub struct UpdateGoalTool;

#[async_trait]
impl AgentTool for UpdateGoalTool {
    fn id(&self) -> &str {
        "update_goal"
    }

    fn description(&self) -> &str {
        "Update the session goal status. Set status to \"complete\" ONLY when the goal is verifiably achieved (cite the evidence), or \"blocked\" when the same blocker has persisted across consecutive attempts and you cannot proceed without the user."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["complete", "blocked"],
                    "description": "Terminal goal state. Pausing, resuming, or clearing a goal is user-controlled."
                },
                "evidence": {
                    "type": "string",
                    "description": "For complete: what verifies the objective is met. For blocked: the recurring blocker and what you need from the user."
                }
            },
            "required": ["status"]
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<Arc<Mutex<HashSet<String>>>>,
        _token: CancellationToken,
    ) -> Result<Value> {
        let status = input
            .get("status")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or_default();
        if status != "complete" && status != "blocked" {
            return Ok(json!({
                "error": "status must be \"complete\" or \"blocked\"."
            }));
        }
        if status == "complete" {
            let has_evidence = input
                .get("evidence")
                .and_then(Value::as_str)
                .map(|s| s.trim().len() >= 10)
                .unwrap_or(false);
            if !has_evidence {
                return Ok(json!({
                    "error": "Marking the goal complete requires evidence (at least a sentence) that the objective is verifiably met."
                }));
            }
        }

        let state = app.state::<crate::commands::AppState>();
        let db = match state.db().await {
            Ok(db) => db,
            Err(e) => return Ok(json!({ "error": format!("Database unavailable: {e}") })),
        };
        match crate::services::goal::update_status(&app, &db, &chat_id, status).await {
            Ok(Some(goal)) => Ok(json!({
                "message": format!("Goal marked {}", goal.status),
                "goal": goal
            })),
            Ok(None) => Ok(json!({
                "error": "No goal is set for this session. Nothing to update."
            })),
            Err(e) => Ok(json!({ "error": e.to_string() })),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_alternate_item_shapes() {
        // ZEN native, Codex, Claude, and status-string variants all resolve.
        let zen = parse_todo_item(&json!({"task": "Run tests", "completed": true})).unwrap();
        assert_eq!(zen.task, "Run tests");
        assert_eq!(zen.status, Some("completed"));

        let codex = parse_todo_item(&json!({"step": "Patch parser", "status": "in_progress"})).unwrap();
        assert_eq!(codex.task, "Patch parser");
        assert_eq!(codex.status, Some("in-progress"));

        let claude = parse_todo_item(&json!({"content": "Read file", "status": "pending"})).unwrap();
        assert_eq!(claude.task, "Read file");
        assert_eq!(claude.status, Some("pending"));

        // No status signal → left to positional fallback downstream.
        let bare = parse_todo_item(&json!({"task": "Just a step"})).unwrap();
        assert_eq!(bare.status, None);

        // Empty / unusable items are rejected, not fatal.
        assert!(parse_todo_item(&json!({"task": "   "})).is_none());
        assert!(parse_todo_item(&json!({"note": "no task key"})).is_none());
    }
}
