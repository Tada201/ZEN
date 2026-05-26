use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::agent::tools::AgentTool;

#[derive(Debug, Deserialize)]
struct WriteTodosArgs {
    todos: Vec<TodoItem>,
}

#[derive(Debug, Deserialize)]
struct TodoItem {
    task: String,
    completed: bool,
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
        json!({
            "type": "object",
            "properties": {
                "todos": {
                    "type": "array",
                    "description": "Ordered task checklist. Include every meaningful step and update completed flags truthfully.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "task": { "type": "string", "description": "Task description" },
                            "completed": { "type": "boolean", "description": "Whether this task has actually been completed" }
                        },
                        "required": ["task", "completed"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["todos"],
            "additionalProperties": false
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
        let args: WriteTodosArgs = serde_json::from_value(input)?;
        let now = chrono::Utc::now().timestamp_millis();
        let tasks: Vec<Value> = args
            .todos
            .iter()
            .enumerate()
            .map(|(index, todo)| {
                let status = if todo.completed {
                    "completed"
                } else if index == 0 {
                    "in-progress"
                } else {
                    "pending"
                };
                json!({
                    "id": format!("{}_todo_{}", chat_id, index),
                    "description": todo.task,
                    "assignedTo": "ZEN",
                    "status": status,
                    "progress": if todo.completed { 100 } else if index == 0 { 20 } else { 0 },
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

        let completed = args.todos.iter().filter(|t| t.completed).count();
        Ok(json!({
            "message": "Todos written",
            "total": args.todos.len(),
            "completed": completed
        }))
    }
}
