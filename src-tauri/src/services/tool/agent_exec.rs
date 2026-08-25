// Agent-driven tool execution (legacy `AgentTool` and v2 registry paths).
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
    pub async fn execute_agent_tool(
        &self,
        params: AgentToolParams,
    ) -> crate::agent::types::ToolResult {
        let AgentToolParams {
            tool,
            app,
            chat_id,
            tool_call,
            token,
            depth,
            allowed_tools,
            delegation_allowed,
        } = params;
        if tool_call.name == "spawn_agent" && !delegation_allowed {
            return crate::agent::types::ToolResult {
                tool_call_id: tool_call.id,
                content: serde_json::json!({"error": "Nested delegation is disabled for sub-agents."}),
                is_error: true,
                duration_ms: 0,
            };
        }
        let tool = if tool.is_some() {
            tool
        } else {
            let registry = self.registry.read().await;
            registry.get_legacy(&tool_call.name)
        };

        if let Some(tool) = tool {
            let v2_tool_call = ToolCall {
                id: tool_call.id.clone(),
                name: tool_call.name.clone(),
                arguments: tool_call.args.clone(),
            };

            let permission_decision = self.check_permission("agent_tool", &v2_tool_call).await;
            match permission_decision {
                Ok(crate::tools::permission::PermissionDecision::Allow) => {}
                Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                    let already_allowed = if let Some(allowed_tools) = &allowed_tools {
                        allowed_tools.lock().await.contains(&tool_call.name)
                    } else {
                        false
                    };

                    if !already_allowed {
                        return crate::agent::types::ToolResult {
                            tool_call_id: tool_call.id.clone(),
                            content: serde_json::json!({
                                "error": "Tool execution requires user confirmation.",
                                "tool": tool_call.name,
                                "hint": "Execution was blocked because this code path cannot approve confirmation prompts."
                            }),
                            is_error: true,
                            duration_ms: 0,
                        };
                    }
                }
                Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": format!("Tool execution denied by security policy: {}", reason),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
                Err(e) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": format!("Tool permission check failed: {}", e),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
            }

            let timeout_seconds = tool.timeout_seconds();
            // Serialize file mutations with checkpoint restore. Non-file tools
            // retain the existing concurrency limit and can still run in parallel.
            let _mutation_guard = if is_file_mutation_tool(&v2_tool_call.name) {
                Some(
                    app.state::<crate::commands::AppState>()
                        .checkpoints
                        .acquire_mutation_lock()
                        .await,
                )
            } else {
                None
            };
            let permit = match self
                .acquire_execution_permit("agent_tool", &tool_call.name)
                .await
            {
                Ok(permit) => permit,
                Err(e) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::json!({
                            "error": e,
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
            };
            let captures = match self.capture_file_mutations(&app, &chat_id, &v2_tool_call).await {
                Ok(captures) => captures,
                Err(error) => {
                    return crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id,
                        content: serde_json::json!({
                            "error": error,
                            "tool": tool_call.name,
                            "hint": "The file mutation was blocked because a safe recovery checkpoint could not be created."
                        }),
                        is_error: true,
                        duration_ms: 0,
                    };
                }
            };
            // Carry the owning spawn/delegation call through the private tool
            // input boundary. Spawn tools use this to stamp child execution
            // events with an authoritative parent tool id; the hidden field is
            // never exposed to the model-facing tool schema.
            let mut tool_input = tool_call.args.clone();
            if tool_call.name == "spawn_agent" {
                if let Some(object) = tool_input.as_object_mut() {
                    object.insert("_parent_tool_call_id".to_string(), serde_json::json!(tool_call.id.clone()));
                }
            }
            let tool_run_future = tool.run(
                app.clone(),
                chat_id.clone(),
                tool_input,
                depth,
                allowed_tools,
                token.clone(),
            );

            let start = std::time::Instant::now();
            let result_outcome = tokio::select! {
                res = tokio::time::timeout(std::time::Duration::from_secs(timeout_seconds), tool_run_future) => {
                    match res {
                        Ok(Ok(mut val)) => {
                            let s = val.to_string();
                            if s.len() > 200 * 1024 {
                                tracing::warn!("Tool output too large ({} bytes), truncating to 200KB", s.len());
                                let suffix = format!("... [TRUNCATED DUE TO SIZE ({} bytes)]", s.len());
                                let max_bytes: usize = 200 * 1024;
                                let max_content_bytes = max_bytes.saturating_sub(suffix.len());
                                let mut truncated = String::new();
                                let mut byte_count = 0;
                                for c in s.chars() {
                                    let char_len = c.len_utf8();
                                    if byte_count + char_len > max_content_bytes {
                                        break;
                                    }
                                    truncated.push(c);
                                    byte_count += char_len;
                                }
                                val = serde_json::json!(format!("{}{}", truncated, suffix));
                            }
                            Ok(val)
                        },
                        Ok(Err(e)) => Err(format!("Tool error: {}", e)),
                        Err(_) => Err(format!("Tool execution timed out after {}s", timeout_seconds)),
                    }
                },
                _ = token.cancelled() => {
                    Err("Tool execution cancelled by user".to_string())
                }
            };
            drop(permit);
            let duration_ms = start.elapsed().as_millis() as u64;
            let result_outcome = match result_outcome {
                Ok(mut value) => match self
                    .finalize_file_mutations(&app, &chat_id, &v2_tool_call, &captures, &mut value)
                    .await
                {
                    Ok(()) => Ok(value),
                    Err(error) => {
                        self.discard_file_mutations(&app, &chat_id, captures).await;
                        Err(error)
                    }
                },
                Err(error) => {
                    // Failed mutations are not advertised as undoable. A
                    // later slice can add atomic patch transactions without
                    // making an unsafe ownership assumption here.
                    self.discard_file_mutations(&app, &chat_id, captures).await;
                    Err(error)
                }
            };

            match result_outcome {
                Ok(val) => {
                    self.audit_execution_result(AuditResultParams {
                        caller: "agent_tool",
                        resolved_name: &tool_call.name,
                        tool_call_id: &tool_call.id,
                        success: true,
                        duration_ms,
                        output: Some(&val),
                        error: None,
                    })
                    .await;
                    crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id,
                        content: val,
                        is_error: false,
                        duration_ms,
                    }
                }
                Err(e) => {
                    let content = serde_json::json!({
                        "error": e,
                        "tool": tool_call.name,
                        "hint": "This tool call failed or was interrupted. You may retry with different arguments or approach."
                    });
                    self.audit_execution_result(AuditResultParams {
                        caller: "agent_tool",
                        resolved_name: &tool_call.name,
                        tool_call_id: &tool_call.id,
                        success: false,
                        duration_ms,
                        output: Some(&content),
                        error: content.get("error").and_then(|v| v.as_str()),
                    })
                    .await;
                    crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content,
                        is_error: true,
                        duration_ms,
                    }
                }
            }
        } else {
            let v2_tool_call = ToolCall {
                id: tool_call.id.clone(),
                name: tool_call.name.clone(),
                arguments: tool_call.args.clone(),
            };
            let v2_exists = {
                let registry = self.registry.read().await;
                registry.get(&v2_tool_call.name).is_some()
            };

            if v2_exists {
                let permission_decision = self.check_permission("agent_tool", &v2_tool_call).await;
                match permission_decision {
                    Ok(crate::tools::permission::PermissionDecision::Allow) => {
                        let start = std::time::Instant::now();
                        match self
                            .execute_v2_authorized(app, chat_id, v2_tool_call, "agent_tool")
                            .await
                        {
                            Ok(content) => crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content,
                                is_error: false,
                                duration_ms: start.elapsed().as_millis() as u64,
                            },
                            Err(e) => crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content: serde_json::json!({
                                    "error": e,
                                    "tool": tool_call.name,
                                    "hint": "This v2 tool failed during execution."
                                }),
                                is_error: true,
                                duration_ms: start.elapsed().as_millis() as u64,
                            },
                        }
                    }
                    Ok(crate::tools::permission::PermissionDecision::Confirm { .. }) => {
                        let already_allowed = if let Some(allowed_tools) = &allowed_tools {
                            allowed_tools.lock().await.contains(&tool_call.name)
                        } else {
                            false
                        };

                        if already_allowed {
                            let start = std::time::Instant::now();
                            match self
                                .execute_v2_authorized(app, chat_id, v2_tool_call, "agent_tool")
                                .await
                            {
                                Ok(content) => crate::agent::types::ToolResult {
                                    tool_call_id: tool_call.id,
                                    content,
                                    is_error: false,
                                    duration_ms: start.elapsed().as_millis() as u64,
                                },
                                Err(e) => crate::agent::types::ToolResult {
                                    tool_call_id: tool_call.id,
                                    content: serde_json::json!({
                                        "error": e,
                                        "tool": tool_call.name,
                                        "hint": "This v2 tool failed during execution."
                                    }),
                                    is_error: true,
                                    duration_ms: start.elapsed().as_millis() as u64,
                                },
                            }
                        } else {
                            crate::agent::types::ToolResult {
                                tool_call_id: tool_call.id,
                                content: serde_json::json!({
                                    "error": "Tool execution requires user confirmation.",
                                    "tool": tool_call.name,
                                    "hint": "Execution was blocked because this code path cannot approve confirmation prompts."
                                }),
                                is_error: true,
                                duration_ms: 0,
                            }
                        }
                    }
                    Ok(crate::tools::permission::PermissionDecision::Deny { reason }) => {
                        crate::agent::types::ToolResult {
                            tool_call_id: tool_call.id,
                            content: serde_json::json!({
                                "error": format!("Tool execution denied by security policy: {}", reason),
                                "tool": tool_call.name,
                            }),
                            is_error: true,
                            duration_ms: 0,
                        }
                    }
                    Err(e) => crate::agent::types::ToolResult {
                        tool_call_id: tool_call.id,
                        content: serde_json::json!({
                            "error": format!("Tool permission check failed: {}", e),
                            "tool": tool_call.name,
                        }),
                        is_error: true,
                        duration_ms: 0,
                    },
                }
            } else {
                // External MCP tools live in the same `ToolRegistry` as
                // built-in tools via `McpToolAdapter`, so once
                // `sync_external_servers` populates the registry the
                // `v2_exists` branch above handles them uniformly.
                // The brief pre-sync window when the agent names an
                // `ext:*` tool before the registry knows about it lands
                // here (no `v2_exists` yet) and surfaces a clean "tool
                // not found" instead of a misleading network error.
                let hint = if crate::mcp::client::is_external_tool_name(&tool_call.name) {
                    // External tools are not part of the local delegation
                    // path. Point the model at a concrete next action:
                    // confirm the server wiring.
                    // Interpolate `tool_call.name` so the LLM sees which
                    // tool is actually missing (the registry may hold
                    // many external tools and the model needs to know
                    // which entry was unrecognised).
                    format!(
                        "External MCP tool '{}' is not known to any registered server. Verify the server name in .mcp.json and that the server is reachable, then retry.",
                        tool_call.name
                    )
                } else {
                    "Use spawn_agent if you need a specialized expert."
                        .to_string()
                };
                crate::agent::types::ToolResult {
                    tool_call_id: tool_call.id,
                    content: serde_json::json!({
                        "error": format!("Tool '{}' not found", tool_call.name),
                        "available_tools": hint,
                    }),
                    is_error: true,
                    duration_ms: 0,
                }
            }
        }
    }
}
