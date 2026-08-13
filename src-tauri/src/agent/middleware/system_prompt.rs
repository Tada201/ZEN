//! `SystemPromptMiddleware` — builds the system prompt from agent
//! instructions, current time, rendering rules, tool descriptions, and
//! available contexts.
//!
//! `system_prompt_budget` caps the **optional** portion of the system
//! prompt (time, UI rules, canvas, graph state, tool system, write_todos,
//! apply_patch, agent roles). The must-keep portion — the IPI safety
//! preamble plus `current_agent.instructions` — is pushed **before** the
//! budget is snapshotted and is therefore intentionally not capped:
//! the safety/identity floor always wins, even if it pushes the total
//! system prompt past `system_prompt_budget`. This is the design
//! intent: weakening the trust boundary or the agent identity to fit
//! a budget is the wrong trade. The optional sections are skipped in
//! order once the remaining budget is exhausted. `usize::MAX` means
//! unbounded (the historical behaviour before per-layer budgets).

use super::core::{ContextMiddleware, ContextSectionId, EnrichmentContext, SectionStatus};
use crate::error::ZenResult;
use async_trait::async_trait;
use std::mem;
use tauri::AppHandle;
use tauri::Manager;

pub struct SystemPromptMiddleware {
    pub app: AppHandle,
    pub system_prompt_budget: usize,
}

#[async_trait]
impl ContextMiddleware for SystemPromptMiddleware {
    fn priority(&self) -> i32 {
        0
    }
    fn name(&self) -> &'static str {
        "SystemPrompt"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        use crate::agent::runner::helpers::estimate_tokens;

        // ── Untrusted Data Safety (P0 IPI defence) ──
        // Prepend the safety preamble so the trust boundary is established
        // BEFORE any agent-level instructions from `current_agent.instructions`
        // can be evaluated. This guarantees the hierarchy rule wins even if
        // a future agent definition tries to override it.
        let existing = mem::take(&mut ctx.system_content);
        let mut head = String::with_capacity(
            crate::agent::prompt_safety::SAFETY_PREAMBLE.len() + existing.len() + 256,
        );
        head.push_str(crate::agent::prompt_safety::SAFETY_PREAMBLE);
        head.push_str(&existing);
        ctx.system_content = head;
        // Record the two must-keep sections separately so the breakdown can
        // surface them as the "identity" floor in the visualiser.
        ctx.record_section(
            ContextSectionId::SafetyPreamble,
            crate::agent::prompt_safety::SAFETY_PREAMBLE.to_string(),
            SectionStatus::Active,
        );
        ctx.record_section(
            ContextSectionId::AgentInstructions,
            existing,
            SectionStatus::Active,
        );

        // Snapshot the per-layer remaining budget AFTER the must-keep
        // portion (safety preamble + agent.instructions) is in place.
        let mut remaining = self
            .system_prompt_budget
            .saturating_sub(estimate_tokens(&ctx.system_content));

        // ── Inject current time ──
        let now = chrono::Local::now();
        let time_block = format!(
            "\n\n## Current Date & Time\n{}\nTimezone: {:?}\nUnix timestamp: {}",
            now.format("%Y-%m-%d %H:%M:%S %z"),
            now.timezone(),
            now.timestamp()
        );
        ctx.try_push_section(ContextSectionId::Time, &mut remaining, &time_block);

        // ── UI Rendering & Formatting Rules ──
        ctx.try_push_section(
            ContextSectionId::UiRules,
            &mut remaining,
            "\n\n## UI Rendering & Formatting Rules\n",
        );
        ctx.try_push_section(
            ContextSectionId::UiRules,
            &mut remaining,
            "1. When generating SVGs or visual assets, ALWAYS wrap the raw `<svg>` code inside a \
             markdown code block with the `svg` language identifier (e.g. ```svg\n<svg>...</svg>\n```). \
             Do NOT output raw SVG tags directly in the text body.\n",
        );
        ctx.try_push_section(
            ContextSectionId::UiRules,
            &mut remaining,
            "2. Structure your responses with clear markdown headings and bullet points.\n",
        );

        // ── Canvas context ──
        if ctx.authorized_tool_ids.iter().any(|t| t == "draw") {
            ctx.try_push_section(
                ContextSectionId::DrawingCanvas,
                &mut remaining,
                "\n\n## Drawing Canvas\n",
            );
            ctx.try_push_section(
                ContextSectionId::DrawingCanvas,
                &mut remaining,
                "You have access to a drawing canvas (800x600 pixels).\n",
            );
            ctx.try_push_section(
                ContextSectionId::DrawingCanvas,
                &mut remaining,
                "Use the 'draw' tool to create diagrams, flowcharts, or visual content.\n",
            );
            ctx.try_push_section(
                ContextSectionId::DrawingCanvas,
                &mut remaining,
                "IMPORTANT: Before drawing complex scenes, ask for the current canvas state to avoid overlaps.\n",
            );
            ctx.try_push_section(
                ContextSectionId::DrawingCanvas,
                &mut remaining,
                "Canvas context is automatically provided with each iteration if there are existing objects.\n",
            );
        }

        // ── Graph session context ──
        if ctx
            .authorized_tool_ids
            .iter()
            .any(|t| t == "graph_session")
        {
            ctx.try_push_section(
                ContextSectionId::GraphSession,
                &mut remaining,
                "\n\n## Interactive Math Graphs\n",
            );
            ctx.try_push_section(
                ContextSectionId::GraphSession,
                &mut remaining,
                "You have access to an interactive graphing engine for mathematical expressions.\n",
            );
            ctx.try_push_section(
                ContextSectionId::GraphSession,
                &mut remaining,
                "Use the 'graph_session' tool to:\n",
            );
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "- Add expressions: {\"action\": \"add_expression\", \"expr\": \"sin(x)\", \"color\": \"#00FF9F\"}\n");
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "- Update expressions: {\"action\": \"update_expression\", \"id\": \"f1\", \"expr\": \"a * sin(x)\"}\n");
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "- Set variables: {\"action\": \"set_variable\", \"name\": \"a\", \"value\": 2.5}\n");
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "- Adjust viewport: {\"action\": \"set_viewport\", \"x_min\": -5, \"x_max\": 5, \"y_min\": -3, \"y_max\": 3}\n");
            ctx.try_push_section(
                ContextSectionId::GraphSession,
                &mut remaining,
                "- Delete expressions: {\"action\": \"delete_expression\", \"id\": \"f1\"}\n",
            );
            ctx.try_push_section(
                ContextSectionId::GraphSession,
                &mut remaining,
                "When you use this tool, the UI automatically switches to math plot mode.\n",
            );
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "Iteratively refine expressions based on validation feedback (undefined variables, parse errors, etc.).\n");
            ctx.try_push_section(ContextSectionId::GraphSession, &mut remaining, "Supported: sin, cos, tan, sqrt, abs, ln, log10, exp, floor, ceil, and named variables.\n");

            // Inject current session state if available
            use crate::commands::AppState;
            let session_id = format!("chat_{}", ctx.chat_id);
            if let Some(state) = self.app.try_state::<AppState>() {
                let sessions = state.graph_sessions.try_lock();
                if let Ok(sessions_guard) = sessions {
                    if let Some(session) = sessions_guard.get(&session_id) {
                        let header = format!(
                            "\n\n### Current Graph State (Session: {})\n\
                             Expressions: {}\n\
                             Variables: {:?}\n\
                             Viewport: [{},{}] x [{},{}]\n\
                             Issues: {}\n\
                             Version: {}\n\n",
                            session_id,
                            session.expressions.len(),
                            session.variables,
                            session.viewport.x_min,
                            session.viewport.x_max,
                            session.viewport.y_min,
                            session.viewport.y_max,
                            session.issues.len(),
                            session.current_version
                        );
                        ctx.try_push_section(
                            ContextSectionId::GraphSessionState,
                            &mut remaining,
                            &header,
                        );

                        if !session.expressions.is_empty() {
                            ctx.try_push_section(
                                ContextSectionId::GraphSessionState,
                                &mut remaining,
                                "### Expressions:\n",
                            );
                            for expr in &session.expressions {
                                let status = if expr.visible { "VISIBLE" } else { "HIDDEN" };
                                let error = expr.error.as_deref().unwrap_or("OK");
                                let line = format!(
                                    "- {} [{}]: {} (error: {})\n",
                                    expr.id, status, expr.expr, error
                                );
                                if !ctx.try_push_section(
                                    ContextSectionId::GraphSessionState,
                                    &mut remaining,
                                    &line,
                                ) {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Tool system (deferred discovery) ──
        let direct_board_agent =
            ctx.authorized_tool_ids.len() == 1 && ctx.authorized_tool_ids[0] == "manage_board";
        let meta_tools: Vec<crate::tools::ToolInfo> = if ctx.tools_enabled && !direct_board_agent {
            crate::tools::manager::meta_tool_definitions()
        } else {
            Vec::new()
        };

        if direct_board_agent {
            ctx.try_push_section(
                ContextSectionId::DirectBoard,
                &mut remaining,
                "\n\n## Direct Board Tool\nCall `manage_board` directly using its provided schema. Do not call tool_list, tool_info, or tool_exec. Do not finish until manage_board succeeds.\n",
            );
        }

        if !meta_tools.is_empty() {
            ctx.try_push_section(
                ContextSectionId::ToolSystem,
                &mut remaining,
                "\n\n## Tool System (Deferred Discovery)\n",
            );
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "You have access to a library of tools through exactly three compact meta-tools. Use this protocol to choose the right specialized tool without loading every schema upfront:\n\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "1. **tool_list** - Lists/searches allowed tools with short descriptions. Call this first for any unfamiliar, non-trivial, file, terminal, web, research, or agent task. Pass `query` when you know the intent.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "2. **tool_info** - Reads the full description, JSON schema, parameters, risk level, and usage details for one tool. Call this before the first execution of any non-trivial tool.\n");
            ctx.try_push_section(
                ContextSectionId::ToolSystem,
                &mut remaining,
                "3. **tool_exec** - Executes a tool by name with the given arguments.\n\n",
            );
            ctx.try_push_section(
                ContextSectionId::ToolSystem,
                &mut remaining,
                "### Workflow\n",
            );
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "1. Call `tool_list({})` or `tool_list({\"query\":\"intent\"})` to discover available tools.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "2. Call `tool_info({\"tool_id\":\"tool_name\"})` to read the selected tool's description and schema before first use.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "3. Call `tool_exec({\"tool_id\":\"tool_name\",\"arguments\":{...}})` to execute using only documented arguments from that schema.\n\n");
            ctx.try_push_section(
                ContextSectionId::ToolSystem,
                &mut remaining,
                "### Rules\n",
            );
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- **Thoughtful Planning & Commentary**: On your first response turn to a new task or goal, DO NOT execute heavy tools immediately. You MUST first think, analyze the goal, and write a brief commentary explaining your understanding and your proposed plan. State which tools you plan to search for or use.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- **Required Tool Protocol**: For tool work, use the three-step flow: `tool_list` to find the allowed tool, `tool_info` to read its description/schema, then `tool_exec` to run it.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- **Correct Tool Call Format**: You MUST invoke meta-tools exactly by their names (`tool_list`, `tool_info`, `tool_exec`). Do NOT append or prefix native API strings (e.g., do NOT call `call_functions_tool_list_...` or similar wrappers). Use only the exact names defined in this protocol.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- **Do Not Guess Tools**: Do not invent hidden tool names, call old discovery tools, or guess arguments. If a tool or argument is not returned by `tool_list`/`tool_info`, do not use it.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- **Dynamic Tool Discovery & Loading**: Search for appropriate tools using `tool_list` first, and use `tool_info` to get the parameters/schema. This conceptually 'loads' the tool's schema into your memory before you execute it via `tool_exec` in subsequent steps.\n");
            ctx.try_push_section(
                ContextSectionId::ToolSystem,
                &mut remaining,
                "- Choose tools autonomously; do not ask the user which tool to use.\n",
            );
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- Execute dependent tools sequentially. Use parallel tool calls only when results do not depend on each other.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- For uploaded/local documents: call `list_documents` when the exact path is unknown, then call `read_document_content` with the returned `file_path` for authoritative contents. Use `grep_documents` only for exact-term discovery, and read matching files before relying on them.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- After tool results arrive, use their specific data in the next response and summarize findings before final answer when useful.\n");
            ctx.try_push_section(ContextSectionId::ToolSystem, &mut remaining, "- If a tool is unknown or denied, use the hint in the result and rediscover with `tool_list`.\n");
            if !ctx.tools_supported {
                ctx.try_push_section(
                    ContextSectionId::ToolSystem,
                    &mut remaining,
                    "- Output EXACTLY one JSON block per tool call: ```json\n{\"tool\":\"TOOL_NAME\",\"args\":{}}\n```\n",
                );
            }
        }

        if ctx
            .authorized_tool_ids
            .iter()
            .any(|t| t == "write_todos")
        {
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "\n\n## Visible Task Checklist\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "You have a `write_todos` tool that renders a live, user-visible checklist in the chat. Use it PROACTIVELY — the user watches this panel to track progress.\n\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "### When to call `write_todos` (do not skip these)\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- The user asks for something that needs 3+ distinct steps to complete.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- The request is complex: multi-file edits, refactors, migrations, debugging across layers, or any task where the user will benefit from seeing the plan before you act.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- The request is long-running: the work will span many tool calls and the user should be able to see where you are.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- You discover, mid-task, that the work is larger than the original request implied. Add the newly discovered steps immediately.\n\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "### When to skip\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- Single-step answers (one lookup, one small edit, one short explanation, a clarifying question).\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "- Conversational replies with no tool use.\n\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "### Required behavior\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "1. On the FIRST iteration of any non-trivial task, call `write_todos` BEFORE doing any other work. Decompose the request into concrete, verifiable steps (each step should describe a checkable outcome, not a vague intent).\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "2. Use action-oriented verbs: 'Read file X', 'Patch the Y parser', 'Run tests', 'Verify build', not 'Look at' or 'Handle'.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "3. Keep the list to 3-8 items. If a step is large, break it into sub-steps; if a step is trivial, fold it into a neighbor.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "4. After completing each step, re-call `write_todos` with that step marked `completed: true` BEFORE moving to the next. The checklist is the source of truth.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "5. If the plan changes (new requirement, blocked step, better approach), rewrite the list immediately with the new shape rather than appending ad-hoc items.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "6. CLEARING THE CHECKLIST: Once a task is fully finished, you MUST call `write_todos` with an EMPTY array `{\"todos\": []}`. This action signals the system to immediately clear the drawer from the UI.\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "7. At the end of the task, call `write_todos` one final time with every step `completed: true`, followed immediately by an empty list `{\"todos\": []}` to clean up completely.\n\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "### Schema reminder\n",
            );
            ctx.try_push_section(
                ContextSectionId::TodoChecklist,
                &mut remaining,
                "`write_todos` takes `{\"todos\": [{\"task\": string, \"completed\": bool}]}`. Order matters: keep steps in execution order; the first non-completed item is what the UI highlights as the current step.\n",
            );
        }

        if ctx
            .authorized_tool_ids
            .iter()
            .any(|t| t == "apply_patch")
        {
            ctx.try_push_section(
                ContextSectionId::PatchRules,
                &mut remaining,
                "\n\n<code_patching_rules>\n",
            );
            ctx.try_push_section(
                ContextSectionId::PatchRules,
                &mut remaining,
                "You have access to the `apply_patch` tool which edits workspace files using Search/Replace diff blocks.\n\
                 This tool is highly efficient and resistant to indentation issues. Avoid rewriting whole files; instead, use `apply_patch` with the following structure:\n\n\
                 *** Update File: path/to/file.ext\n\
                 <<<<<<< SEARCH\n\
                 exact lines of existing code to replace\n\
                 =======\n\
                 replacement lines of code\n\
                 >>>>>>> REPLACE\n\n\
                 You can chain multiple `*** Update File` blocks or use `*** Add File` / `*** Delete File` in the same patch string. Keep your SEARCH blocks unique and precise.\n",
            );
            ctx.try_push_section(
                ContextSectionId::PatchRules,
                &mut remaining,
                "</code_patching_rules>\n",
            );
        }

        if ctx.tools_enabled && ctx.authorized_tool_ids.iter().any(|t| t == "spawn_agent") {
            ctx.try_push_section(
                ContextSectionId::AgentRoles,
                &mut remaining,
                "\n\n## Delegation Rule\nUse only `spawn_agent` for delegated child work. It accepts either one task or an `agents` array for bounded parallel work. Do not call or invent `delegate_to_agent`, `handoff_to_agent`, or any separate subagent tool.\n",
            );
            if let Some(state) = self.app.try_state::<crate::commands::AppState>() {
                let agents = state
                    .agent_registry
                    .list_profiles()
                    .into_iter()
                    .filter(|profile| profile.model_invocable)
                    .map(|profile| profile.agent)
                    .collect::<Vec<_>>();
                if !agents.is_empty() {
                    ctx.try_push_section(
                        ContextSectionId::AgentRoles,
                        &mut remaining,
                        "\n\n## Available Agent Roles\n",
                    );
                    ctx.try_push_section(
                        ContextSectionId::AgentRoles,
                        &mut remaining,
                        "Use delegation only when a specialized role clearly reduces uncertainty or parallelizes independent work.\n",
                    );
                    for agent in agents.into_iter().take(12) {
                        if agent.id == "generalist" || agent.id == "voice_display" {
                            continue;
                        }
                        let description = agent
                            .description
                            .as_deref()
                            .unwrap_or(&agent.instructions)
                            .lines()
                            .next()
                            .unwrap_or("Specialized assistant");
                        let line = format!(
                            "- `{}`: {}\n",
                            agent.id,
                            description.chars().take(160).collect::<String>()
                        );
                        if !ctx.try_push_section(
                            ContextSectionId::AgentRoles,
                            &mut remaining,
                            &line,
                        ) {
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
