use crate::db::models::ChatMessage;
use crate::error::ZenResult;
use async_trait::async_trait;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

/// Mutable context that middleware steps read from and write to.
///
/// The runner populates this struct before each LLM call, then the
/// middleware chain augments it in priority order.
pub struct EnrichmentContext {
    /// System prompt being built step-by-step (initialised with agent instructions).
    pub system_content: String,
    /// Conversation messages (may be compacted in-place).
    pub conversation: Vec<ChatMessage>,
    /// Extra system messages appended after the main system message
    /// (e.g. previous session summaries, current session summary).
    pub extra_system_messages: Vec<String>,
    /// Chat identifier – used by middleware that queries DB or app state.
    pub chat_id: String,
    /// Pre-cached semantic recall block (set by runner before chain runs).
    pub recall_block: Option<String>,
    /// Tool IDs authorised for the current agent/iteration.
    pub authorized_tool_ids: Vec<String>,
    /// Whether the provider supports structured tool calling.
    pub tools_supported: bool,
    /// Whether tools are globally enabled for this run.
    pub tools_enabled: bool,
}

/// A composable context-enrichment step executed before each LLM call.
#[async_trait]
pub trait ContextMiddleware: Send + Sync {
    /// Mutate `ctx` in-place with additional context, memory, or instructions.
    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()>;
    /// Lower numbers run first. Default 0.
    fn priority(&self) -> i32 {
        0
    }
    /// Human-readable name for tracing/debugging.
    fn name(&self) -> &'static str;
}

/// An ordered chain of middleware that runs each step in priority order.
pub struct MiddlewareChain {
    steps: Vec<Box<dyn ContextMiddleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn add(mut self, mw: Box<dyn ContextMiddleware>) -> Self {
        self.steps.push(mw);
        self.sort();
        self
    }

    /// Run every registered middleware in priority order against `ctx`.
    pub async fn enrich_all(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        for step in &self.steps {
            step.enrich(ctx).await?;
        }
        Ok(())
    }

    /// Create the default chain used by `send_message`.
    pub fn default_chain(app: AppHandle, db_pool: Option<SqlitePool>) -> Self {
        Self::new()
            .add(Box::new(SystemPromptMiddleware { app: app.clone() }))
            .add(Box::new(RecallMiddleware))
            .add(Box::new(SummaryMiddleware {
                db_pool: db_pool.clone(),
            }))
            .add(Box::new(CompactionMiddleware))
    }

    fn sort(&mut self) {
        self.steps.sort_by_key(|s| s.priority());
    }
}

impl Default for MiddlewareChain {
    fn default() -> Self {
        Self::new()
    }
}

// ── Built-in middleware implementations ──────────────────────────────────────────

/// Builds the system prompt from agent instructions, current time,
/// rendering rules, tool descriptions, and available contexts.
pub struct SystemPromptMiddleware {
    pub app: AppHandle,
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
        // ── Inject current time ──
        let now = chrono::Local::now();
        let time_block = format!(
            "\n\n## Current Date & Time\n{}\nTimezone: {:?}\nUnix timestamp: {}",
            now.format("%Y-%m-%d %H:%M:%S %z"),
            now.timezone(),
            now.timestamp()
        );
        ctx.system_content.push_str(&time_block);

        // ── UI Rendering & Formatting Rules ──
        ctx.system_content
            .push_str("\n\n## UI Rendering & Formatting Rules\n");
        ctx.system_content.push_str(
            "1. When generating SVGs or visual assets, ALWAYS wrap the raw `<svg>` code inside a \
             markdown code block with the `svg` language identifier (e.g. ```svg\n<svg>...</svg>\n```). \
             Do NOT output raw SVG tags directly in the text body.\n",
        );
        ctx.system_content.push_str(
            "2. Structure your responses with clear markdown headings and bullet points.\n",
        );

        // ── Canvas context ──
        if ctx.authorized_tool_ids.iter().any(|t| t == "draw") {
            ctx.system_content.push_str("\n\n## Drawing Canvas\n");
            ctx.system_content
                .push_str("You have access to a drawing canvas (800x600 pixels).\n");
            ctx.system_content.push_str(
                "Use the 'draw' tool to create diagrams, flowcharts, or visual content.\n",
            );
            ctx.system_content.push_str("IMPORTANT: Before drawing complex scenes, ask for the current canvas state to avoid overlaps.\n");
            ctx.system_content.push_str("Canvas context is automatically provided with each iteration if there are existing objects.\n");
        }

        // ── Graph session context ──
        if ctx.authorized_tool_ids.iter().any(|t| t == "graph_session") {
            ctx.system_content
                .push_str("\n\n## Interactive Math Graphs\n");
            ctx.system_content.push_str(
                "You have access to an interactive graphing engine for mathematical expressions.\n",
            );
            ctx.system_content
                .push_str("Use the 'graph_session' tool to:\n");
            ctx.system_content.push_str("- Add expressions: {\"action\": \"add_expression\", \"expr\": \"sin(x)\", \"color\": \"#00FF9F\"}\n");
            ctx.system_content.push_str("- Update expressions: {\"action\": \"update_expression\", \"id\": \"f1\", \"expr\": \"a * sin(x)\"}\n");
            ctx.system_content.push_str("- Set variables: {\"action\": \"set_variable\", \"name\": \"a\", \"value\": 2.5}\n");
            ctx.system_content.push_str("- Adjust viewport: {\"action\": \"set_viewport\", \"x_min\": -5, \"x_max\": 5, \"y_min\": -3, \"y_max\": 3}\n");
            ctx.system_content.push_str(
                "- Delete expressions: {\"action\": \"delete_expression\", \"id\": \"f1\"}\n",
            );
            ctx.system_content.push_str(
                "When you use this tool, the UI automatically switches to math plot mode.\n",
            );
            ctx.system_content.push_str("Iteratively refine expressions based on validation feedback (undefined variables, parse errors, etc.).\n");
            ctx.system_content.push_str("Supported: sin, cos, tan, sqrt, abs, ln, log10, exp, floor, ceil, and named variables.\n");

            // Inject current session state if available
            use crate::commands::AppState;
            let session_id = format!("chat_{}", ctx.chat_id);
            if let Some(state) = self.app.try_state::<AppState>() {
                let sessions = state.graph_sessions.try_lock();
                if let Ok(sessions_guard) = sessions {
                    if let Some(session) = sessions_guard.get(&session_id) {
                        ctx.system_content.push_str(&format!(
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
                        ));

                        if !session.expressions.is_empty() {
                            ctx.system_content.push_str("### Expressions:\n");
                            for expr in &session.expressions {
                                let status = if expr.visible { "VISIBLE" } else { "HIDDEN" };
                                let error = expr.error.as_deref().unwrap_or("OK");
                                ctx.system_content.push_str(&format!(
                                    "- {} [{}]: {} (error: {})\n",
                                    expr.id, status, expr.expr, error
                                ));
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
            ctx.system_content.push_str("\n\n## Direct Board Tool\nCall `manage_board` directly using its provided schema. Do not call tool_list, tool_info, or tool_exec. Do not finish until manage_board succeeds.\n");
        }

        if !meta_tools.is_empty() {
            ctx.system_content
                .push_str("\n\n## Tool System (Deferred Discovery)\n");
            ctx.system_content.push_str("You have access to a library of tools through exactly three compact meta-tools. Use this protocol to choose the right specialized tool without loading every schema upfront:\n\n");
            ctx.system_content.push_str("1. **tool_list** - Lists/searches allowed tools with short descriptions. Call this first for any unfamiliar, non-trivial, file, terminal, web, research, or agent task. Pass `query` when you know the intent.\n");
            ctx.system_content.push_str("2. **tool_info** - Reads the full description, JSON schema, parameters, risk level, and usage details for one tool. Call this before the first execution of any non-trivial tool.\n");
            ctx.system_content.push_str(
                "3. **tool_exec** - Executes a tool by name with the given arguments.\n\n",
            );
            ctx.system_content.push_str("### Workflow\n");
            ctx.system_content.push_str("1. Call `tool_list({})` or `tool_list({\"query\":\"intent\"})` to discover available tools.\n");
            ctx.system_content.push_str("2. Call `tool_info({\"tool_id\":\"tool_name\"})` to read the selected tool's description and schema before first use.\n");
            ctx.system_content.push_str("3. Call `tool_exec({\"tool_id\":\"tool_name\",\"arguments\":{...}})` to execute using only documented arguments from that schema.\n\n");
            ctx.system_content.push_str("### Rules\n");
            ctx.system_content.push_str("- **Thoughtful Planning & Commentary**: On your first response turn to a new task or goal, DO NOT execute heavy tools immediately. You MUST first think, analyze the goal, and write a brief commentary explaining your understanding and your proposed plan. State which tools you plan to search for or use.\n");
            ctx.system_content.push_str("- **Required Tool Protocol**: For tool work, use the three-step flow: `tool_list` to find the allowed tool, `tool_info` to read its description/schema, then `tool_exec` to run it.\n");
            ctx.system_content.push_str("- **Do Not Guess Tools**: Do not invent hidden tool names, call old discovery tools, or guess arguments. If a tool or argument is not returned by `tool_list`/`tool_info`, do not use it.\n");
            ctx.system_content.push_str("- **Dynamic Tool Discovery & Loading**: Search for appropriate tools using `tool_list` first, and use `tool_info` to get the parameters/schema. This conceptually 'loads' the tool's schema into your memory before you execute it via `tool_exec` in subsequent steps.\n");
            ctx.system_content
                .push_str("- Choose tools autonomously; do not ask the user which tool to use.\n");
            ctx.system_content.push_str("- Execute dependent tools sequentially. Use parallel tool calls only when results do not depend on each other.\n");
            ctx.system_content.push_str("- After tool results arrive, use their specific data in the next response and summarize findings before final answer when useful.\n");
            ctx.system_content.push_str("- If a tool is unknown or denied, use the hint in the result and rediscover with `tool_list`.\n");
            if !ctx.tools_supported {
                ctx.system_content.push_str("- Output EXACTLY one JSON block per tool call: ```json\n{\"tool\":\"TOOL_NAME\",\"args\":{}}\n```\n");
            }
        }

        if ctx.authorized_tool_ids.iter().any(|t| t == "write_todos") {
            ctx.system_content
                .push_str("\n\n## Visible Task Checklist\n");
            ctx.system_content.push_str("For any task determined to be difficult or requiring 3 or more steps, you MUST call `write_todos` early on your first or second iteration to establish a trackable, visible checklist/todolist. Update it as steps complete. Skip it for simple questions or single-step actions.\n");
        }

        if ctx.tools_enabled && ctx.authorized_tool_ids.iter().any(|t| t == "spawn_agent") {
            if let Some(state) = self.app.try_state::<crate::commands::AppState>() {
                let agents = state.agent_registry.list();
                if !agents.is_empty() {
                    ctx.system_content
                        .push_str("\n\n## Available Agent Roles\n");
                    ctx.system_content.push_str("Use delegation only when a specialized role clearly reduces uncertainty or parallelizes independent work.\n");
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
                        ctx.system_content.push_str(&format!(
                            "- `{}`: {}\n",
                            agent.id,
                            description.chars().take(160).collect::<String>()
                        ));
                    }
                }
            }
        }

        Ok(())
    }
}

/// Injects pre-cached semantic memory recall into the system prompt.
///
/// The recall block is produced by a background task after each LLM response
/// and stored in `AppState.recall_cache`. The runner reads it synchronously
/// and sets it on `EnrichmentContext.recall_block` before the chain runs.
pub struct RecallMiddleware;

#[async_trait]
impl ContextMiddleware for RecallMiddleware {
    fn priority(&self) -> i32 {
        10
    }
    fn name(&self) -> &'static str {
        "SemanticRecall"
    }

    async fn enrich(&self, ctx: &mut EnrichmentContext) -> ZenResult<()> {
        if let Some(ref recalled) = ctx.recall_block {
            if !recalled.is_empty() {
                ctx.system_content.push_str(recalled);
            }
        }
        Ok(())
    }
}

/// Injects previous-session summaries and the current-session summary
/// (if compacted) as extra system messages.
pub struct SummaryMiddleware {
    pub db_pool: Option<SqlitePool>,
}

#[async_trait]
impl ContextMiddleware for SummaryMiddleware {
    fn priority(&self) -> i32 {
        20
    }
    fn name(&self) -> &'static str {
        "ConversationSummaries"
    }

    async fn enrich(&self, _ctx: &mut EnrichmentContext) -> ZenResult<()> {
        // Placeholder – the existing inline summary injection in loop.rs
        // still handles this. When fully migrated, the DB queries and
        // message injection will move here.
        Ok(())
    }
}

/// Truncates old tool results and compact conversation when approaching
/// token limits.
pub struct CompactionMiddleware;

#[async_trait]
impl ContextMiddleware for CompactionMiddleware {
    fn priority(&self) -> i32 {
        30
    }
    fn name(&self) -> &'static str {
        "ConversationCompaction"
    }

    async fn enrich(&self, _ctx: &mut EnrichmentContext) -> ZenResult<()> {
        // Placeholder – handled by inline compaction in loop.rs.
        Ok(())
    }
}
