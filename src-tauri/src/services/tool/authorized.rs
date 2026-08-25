// Post-authorization v2 execution path.
// Split from the 1,375-line services/tool.rs during BIG_MIGRATION.md
// Phase 12 (app-crate file-size debt sweep). Behavior is unchanged; the
// `ToolService` impl is spread across sibling modules by concern.

use super::*;

impl ToolService {
    pub(super) async fn execute_v2_authorized(
        &self,
        app: AppHandle,
        chat_id: String,
        tool_call: ToolCall,
        decision: &str,
    ) -> Result<serde_json::Value, String> {
        // ── Uniform tool dispatch ──────────────────────────────────────────
        // External MCP tools are registered in the same v2 `ToolRegistry`
        // as built-in tools via `McpToolAdapter`, so a single
        // `registry.get(name)` resolves both. No special-cased branch for
        // `ext:*` here — the adapter's `Tool::execute` owns the routing.
        let tool = {
            let registry = self.registry.read().await;
            registry.get(&tool_call.name)
        }
        .ok_or_else(|| format!("Tool not found: {}", tool_call.name))?;

        {
            let mut registry = self.registry.write().await;
            registry.record_execution(&tool_call, true, decision);
        }

        self.audit(
            SecurityDecision::Allow,
            "tool_service",
            &tool_call.name,
            "tool execution started",
        )
        .await;

        let tool_name = tool_call.name.clone();
        let tool_call_id = tool_call.id.clone();
        let _permit = self
            .acquire_execution_permit("tool_service", &tool_name)
            .await?;
        let start = std::time::Instant::now();
        // Keep capture, mutation, finalization, and undo in one serialized
        // transaction for file tools so a concurrent in-process writer cannot
        // invalidate the expected-after comparison.
        let _mutation_guard = if is_file_mutation_tool(&tool_call.name) {
            Some(
                app.state::<crate::commands::AppState>()
                    .checkpoints
                    .acquire_mutation_lock()
                    .await,
            )
        } else {
            None
        };
        let captures = self.capture_file_mutations(&app, &chat_id, &tool_call).await?;
        let result = tool
            .execute_with_context(
                app.clone(),
                chat_id.clone(),
                tool_call.id.clone(),
                tool_call.arguments.clone(),
            )
            .await
            .map(|output| output.content)
            .map_err(|e| e.to_string());
        let result = match result {
            Ok(mut output) => {
                match self
                    .finalize_file_mutations(&app, &chat_id, &tool_call, &captures, &mut output)
                    .await
                {
                    Ok(()) => Ok(output),
                    Err(error) => {
                        self.discard_file_mutations(&app, &chat_id, captures).await;
                        Err(error)
                    }
                }
            }
            Err(error) => {
                // Do not expose an undo action for a failed mutation. The
                // operation may have partially applied and ownership of those
                // bytes is ambiguous without an atomic workspace transaction.
                self.discard_file_mutations(&app, &chat_id, captures).await;
                Err(error)
            }
        };
        let duration_ms = start.elapsed().as_millis() as u64;

        self.audit(
            if result.is_ok() {
                SecurityDecision::Allow
            } else {
                SecurityDecision::Deny
            },
            "tool_service",
            &tool_name,
            if result.is_ok() {
                "tool execution succeeded"
            } else {
                "tool execution failed"
            },
        )
        .await;
        self.audit_execution_result(AuditResultParams {
            caller: "tool_service",
            resolved_name: &tool_name,
            tool_call_id: &tool_call_id,
            success: result.is_ok(),
            duration_ms,
            output: result.as_ref().ok(),
            error: result.as_ref().err().map(String::as_str),
        })
        .await;

        result
    }
}
