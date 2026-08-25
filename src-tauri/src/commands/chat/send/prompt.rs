//! Step 5: tool-id assembly, system-prompt composition, voice-display
//! settings, and `Agent` construction.

use super::*;

/// Invariant output rules appended to every assistant prompt, including custom
/// replacement prompts. Rendering and timeline correctness must not depend on
/// a user's optional persona prompt remembering the transport contract.
const DETERMINISTIC_MESSAGE_RENDERING_CONTRACT: &str = r#"

## Deterministic Message and Timeline Contract
- Produce one assistant response stream. Do not emit internal event envelopes, `steps_json`, lifecycle records, fake tool results, or renderer instructions as user-facing content.
- Keep the response chronological: explain the current step, request or run the relevant tool, then describe only the result that has actually returned. Never place a later result before the tool that produced it, and never merge separate execution iterations into one narrative batch.
- Tools that belong to one explicitly parallel execution batch may be requested together. Sequential tool calls are separate execution units; do not claim they were parallel or completed together.
- Preserve normal Markdown. Close every fenced block, use one language tag, and never nest or concatenate fences. Keep `chart` blocks as raw valid JSON, `mermaid` blocks as valid Mermaid, `tree` blocks as plain indented paths, and `openui` blocks as valid OpenUI DSL only when that capability is enabled.
- Do not put prose, Markdown headings, comments, or trailing commas inside raw JSON blocks. Do not emit raw HTML/React tags or XML-like control tags in the answer. Use the supported `<card>{...}</card>` form only when a rich card is appropriate and keep its JSON complete.
- Keep tool arguments and tool output in the tool protocol. In the assistant answer, use concise Markdown summaries and link each claim to the immediately preceding completed step. If a tool fails, state the failure and recovery action instead of inventing a successful result.
- Do not repeat the same answer in both a streamed fragment and a final summary. The final response may reconcile earlier fragments, but must not reorder or duplicate their meaning.
"#;

pub(super) struct ToolIdParams<'a> {
    pub web_search: bool,
    pub image_gen: bool,
    pub has_thread_goal: bool,
    pub requested_tools: Option<Vec<String>>,
    pub tools_enabled_str: Option<&'a str>,
    pub tool_yolo_mode_str: Option<&'a str>,
    pub tools_yolo_mode_str: Option<&'a str>,
    pub llm_provider: &'a dyn crate::llm::LlmProvider,
    pub active_model: &'a str,
    pub content: &'a str,
}

pub(super) fn assemble_tool_ids(params: ToolIdParams<'_>) -> Vec<String> {
    let ToolIdParams {
        web_search,
        image_gen,
        has_thread_goal,
        requested_tools,
        tools_enabled_str,
        tool_yolo_mode_str,
        tools_yolo_mode_str,
        llm_provider,
        active_model,
        content,
    } = params;
    let mut tool_ids = vec![];
    if web_search {
        tool_ids.push("web_search".to_string());
    }
    if image_gen {
        tool_ids.push("generate_image".to_string());
    }
    if has_thread_goal {
        // The goal system block tells the model this tool exists; expose it
        // only while a goal is actually armed so idle chats don't carry it.
        tool_ids.push("update_goal".to_string());
    }

    if let Some(requested_tools) = requested_tools {
        tool_ids.extend(requested_tools);
    } else {
        let tools_enabled = tools_enabled_str
            .map(|s| s.trim() == "true")
            .unwrap_or(true);
        let yolo_mode = tool_yolo_mode_str
            .or(tools_yolo_mode_str)
            .map(|s| s.trim() == "true")
            .unwrap_or(false);

        if tools_enabled && llm_provider.supports_tools(active_model) {
            if yolo_mode {
                tool_ids.extend(default_yolo_tool_ids());
            } else if has_tool_intent(content) {
                tool_ids.extend(default_tool_intent_ids());
            }
        }
    }

    tool_ids.sort();
    tool_ids.dedup();

    tool_ids
}

pub(super) struct InstructionParams<'a> {
    pub custom_prompt_setting: Option<String>,
    pub system_prompt: Option<String>,
    pub replace_system_prompt: bool,
    pub thread_goal: Option<&'a crate::db::models::ThreadGoal>,
    pub generative_ui_enabled: bool,
    pub image_gen: bool,
    pub tool_ids: &'a [String],
}

pub(super) struct BuiltInstructions {
    pub instructions: String,
    /// Also forwarded to the orchestrator as `extra_instructions`.
    pub generative_ui_addendum: Option<String>,
}

pub(super) fn build_instructions(params: InstructionParams<'_>) -> BuiltInstructions {
    let InstructionParams {
        custom_prompt_setting,
        system_prompt,
        replace_system_prompt,
        thread_goal,
        generative_ui_enabled,
        image_gen,
        tool_ids,
    } = params;

    let default_instructions = "You are Zen, a powerful agentic AI assistant. Keep responses direct, short, and highly concise. Avoid redundant conversational fluff.

## 📊 Rich Content Markdown Support
Always use these specialized code blocks for visual scenarios:
1. 📊 CHARTS: Use ```chart with JSON schema: {\"type\":\"bar|line|area|pie\",\"title\":\"...\",\"xAxis\":\"x_key\",\"keys\":[\"y_key\"],\"data\":[{\"x_key\":\"val\",\"y_key\":num}]}.
2. 📐 ARCHITECTURE: Use ```mermaid code blocks for flowcharts, sequences, or component relationships.
3. 📁 STRUCTURE: Use ```tree with indentations to describe folder trees or directory structures.
4. 🃏 RICH CARDS: Use <card> block with JSON data to display rich visual cards. Available types: weather, stock, sports, flight, product, event, movie, book, person, nutrition, package, job, world_time. Format: <card>{\"type\":\"weather\",\"data\":{\"location\":\"Tokyo\",\"temperature\":22}}</card> or <card>{\"type\":\"world_time\",\"data\":{\"title\":\"Clocks\",\"clocks\":[{\"country\":\"Japan\",\"city\":\"Tokyo\",\"time\":\"8:30 PM\",\"timezone\":\"JST\",\"latitude\":35.67,\"longitude\":139.65}]}}</card>. Prefer plain Markdown by default; emit a <card> only when the data is a discrete structured entity that matches a catalog type (a weather reading, a stock quote, a flight, a product) and a card makes it more scannable than prose. One card per distinct entity. Never wrap narrative text, explanations, or generic lists in a card, and do not force unrelated data into a card type.
5. 🧪 CANVAS (openui): Use ```openui containing layout primitive tags to render live interactive canvas widgets (when Gen UI is enabled).
6. 📢 ALERTS: Wrap callouts in standard blockquotes with headers (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).

## 🚫 Critical Limitations & Strict Syntax Constraints
- Do not render raw HTML/React tags directly in plain text. All designs must be enclosed in the structural markdown blocks listed above.
- **CHART BLOCKS**: The content of ```chart MUST be RAW, VALID, PARSABLE JSON ONLY. Do NOT write markdown fences like ` ``` ` or the word `chart` INSIDE the block itself. Never double-escape characters or introduce control characters (like raw newlines, tabs, or backslashes inside string properties) that violate JSON standards.
- **MERMAID BLOCKS**: The content of ```mermaid MUST be strictly valid Mermaid syntax. Double check all bracket matchups, parentheses, arrow combinations, and diagram definitions (e.g. use standard flowcharts, sequence diagrams). Do NOT invent invalid keywords like `graph0]}}` or bad punctuation inside node definitions.
- **NEVER** write prefix markdown or metadata tags inside the code blocks. The code block opening tag (e.g. ```chart) must be immediately followed by the content (JSON/Mermaid code) and nothing else.".to_string();

    let base_instructions = match custom_prompt_setting {
        Some(p) if !p.trim().is_empty() => p,
        _ => default_instructions,
    };
    let mut instructions = match system_prompt {
        Some(p) if replace_system_prompt && !p.trim().is_empty() => p,
        Some(p) if !p.trim().is_empty() && !base_instructions.trim().is_empty() => {
            format!("{}\n\n{}", base_instructions, p)
        }
        Some(p) if !p.trim().is_empty() => p,
        _ => base_instructions,
    };

    // This is an invariant transport/rendering contract, not a persona
    // preference. Append it after custom instructions so replace-mode prompts
    // cannot accidentally disable deterministic Markdown and timeline output.
    if !instructions.contains("## Deterministic Message and Timeline Contract") {
        instructions.push_str(DETERMINISTIC_MESSAGE_RENDERING_CONTRACT);
    }

    if let Some(goal) = thread_goal {
        instructions.push_str(&crate::services::goal::goal_system_block(goal));
    }

    // Capability state is explicit for every turn, including custom
    // replacement prompts. Replace mode changes persona/instructions; it
    // cannot erase the renderer capability contract.
    let generative_ui_addendum = if generative_ui_enabled {
        Some("[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently ENABLED for this message turn. You MAY generate visual mockups, dashboards, grids, stacks, or styled templates only inside exactly one ```openui ... ``` code block using the specified OpenUI DSL catalog. Do not emit raw OpenUI assignments outside the fence. If the user did not ask for a visual interface, prefer normal Markdown.".to_string())
    } else {
        Some("[SYSTEM STATE WARNING]\nIMPORTANT: The Generative UI feature is currently DISABLED for this message turn. Do NOT generate, suggest, or simulate any `openui`/`genui` fence, OpenUI assignment, visual sandbox layout, or canvas widget. Provide all responses in plain, standard Markdown or text. This prohibition applies even if the user asks for a UI mockup; describe it in Markdown instead.".to_string())
    };

    if let Some(addendum) = generative_ui_addendum.as_deref() {
        instructions.push_str("\n\n");
        instructions.push_str(addendum);
    }

    if !replace_system_prompt
        && (image_gen || tool_ids.iter().any(|id| id == "generate_image"))
    {
        instructions.push_str("\n\n[IMAGE GENERATION CAPABILITY]\n\
            IMPORTANT: The Image Generation feature is currently ENABLED for this turn. The `generate_image` tool is available through the standard tool protocol. When the user asks to generate, create, draw, paint, or illustrate an image/artwork:\n\
            1. Call `tool_list({\"query\":\"image\"})` to discover the `generate_image` tool.\n\
            2. Call `tool_info({\"tool_id\":\"generate_image\"})` to read its schema.\n\
            3. Call `tool_exec({\"tool_id\":\"generate_image\",\"arguments\":{\"prompt\":\"<detailed description>\"}})` with a highly descriptive prompt.\n\
            4. After the tool returns, it will provide an `image_uri` (e.g., `asset://localhost/...`). You MUST display the generated image directly to the user inside your chat response block using standard markdown image syntax: `![Generated Image](image_uri)`. This is required because there is no automatic preview in the tool card, and the image will only render if you place it in your response text.\n\n\
            IMPORTANT: Do NOT call `generate_image` directly. Use `tool_list` -> `tool_info` -> `tool_exec` as with any other tool.");
    }

    BuiltInstructions {
        instructions,
        generative_ui_addendum,
    }
}

/// Voice display is a built-in automatic subagent. It is always enabled for
/// voice turns; its settings surface only selects the model. Returns
/// `(provider, model)`.
pub(super) async fn resolve_voice_display(
    state: &State<'_, AppState>,
    is_voice_mode: bool,
) -> (Option<String>, Option<String>) {
    let display_agent_selection = if is_voice_mode {
        state
            .settings_manager
            .get("voiceDisplayAgentModel")
            .await
            .ok()
            .flatten()
            .or(state
                .settings_manager
                .get("voice_display_agent_model")
                .await
                .ok()
                .flatten())
            .filter(|v| !v.is_empty())
    } else {
        None
    };
    let (display_agent_provider, display_agent_model) = display_agent_selection
        .as_deref()
        .and_then(|selection| selection.split_once("::"))
        .map(|(provider, model)| (Some(provider.to_string()), Some(model.to_string())))
        .unwrap_or_else(|| (None, display_agent_selection));
    (display_agent_provider, display_agent_model)
}

pub(super) fn build_agent(
    instructions: String,
    tool_ids: Vec<String>,
) -> crate::agent::types::Agent {
    crate::agent::types::Agent {
        id: "zen_assistant".to_string(),
        name: "Zen".to_string(),
        instructions,
        tool_ids,
        model_override: None,
        max_iterations: Some(20),
        context_window: None,
        max_messages_in_memory: None,
        description: Some("Customized assistant".to_string()),
        model_tier: crate::agent::types::ModelTier::Local,
    }
}