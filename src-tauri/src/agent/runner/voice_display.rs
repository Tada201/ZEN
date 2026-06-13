use super::lifecycle::Runner;
use crate::agent::tools::{child_runner, manage_board::ManageBoardTool, AgentTool};
use crate::commands::AppState;
use crate::db::models::ChatMessage;
use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Listener, Manager};
use tokio_util::sync::CancellationToken;

const DISPLAY_AGENT_ID: &str = "voice_display";
const DEFAULT_CONTEXT_TOKENS: usize = 131_072;
const DEFAULT_MAX_TURNS: usize = 20;
const DEFAULT_COMPACT_THRESHOLD: usize = 75;

impl Runner {
    pub(super) fn spawn_voice_display_agent(
        &self,
        chat_id: &str,
        main_model: &str,
        user_request: &str,
        response: &str,
        token: CancellationToken,
    ) {
        if !self.config.voice_mode || user_request.trim().is_empty() || token.is_cancelled() {
            return;
        }

        let app = self.app.clone();
        let tool_registry = self.tool_registry.clone();
        let agent_registry = self.agent_registry.clone();
        let hook_registry = self.hook_registry.clone();
        let permissions = self.permissions.clone();
        let configured_model = self.config.display_agent_model.clone();
        let main_model = main_model.to_string();
        let source_chat_id = chat_id.to_string();
        let user_request = user_request.to_string();
        let response = response.to_string();
        let depth = self.depth;

        tokio::spawn(async move {
            let spawn_id = uuid::Uuid::new_v4().to_string();
            let _ = app.emit(
                "agent:spawn",
                serde_json::json!({
                    "spawn_id": spawn_id,
                    "agent_id": DISPLAY_AGENT_ID,
                    "child_agent_id": DISPLAY_AGENT_ID,
                    "child_agent_name": "ZEN-DISPLAY",
                    "parent_agent": "Zen",
                    "chat_id": source_chat_id,
                    "task": "Render the current voice request on the board",
                    "status": "spawned"
                }),
            );
            let state = app.state::<AppState>();
            let context_tokens = read_usize_setting(
                &state,
                "voiceDisplayAgentContextTokens",
                DEFAULT_CONTEXT_TOKENS,
                4_096,
                1_048_576,
            )
            .await;
            let max_turns = read_usize_setting(
                &state,
                "voiceDisplayAgentMaxTurns",
                DEFAULT_MAX_TURNS,
                1,
                50,
            )
            .await;
            let compact_threshold = read_usize_setting(
                &state,
                "voiceDisplayAgentCompactThreshold",
                DEFAULT_COMPACT_THRESHOLD,
                50,
                95,
            )
            .await;
            let auto_compact =
                read_bool_setting(&state, "voiceDisplayAgentAutoCompactEnabled", true).await;
            let custom_prompt = state
                .settings_manager
                .get("voiceDisplayAgentPrompt")
                .await
                .ok()
                .flatten()
                .filter(|value| !value.trim().is_empty());

            let selected_model = configured_model
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(main_model);
            let resolved = match child_runner::resolve_agent(
                &agent_registry,
                DISPLAY_AGENT_ID,
                Some(&selected_model),
                Some(max_turns as u64),
            ) {
                Ok(resolved) => resolved,
                Err(error) => {
                    tracing::warn!(error = %error, "Voice display agent is unavailable");
                    return;
                }
            };

            let allowed_tools = Arc::new(tokio::sync::Mutex::new(HashSet::from([
                "manage_board".to_string()
            ])));
            let mut runner = match child_runner::build_child_runner(
                &app,
                tool_registry,
                agent_registry,
                hook_registry,
                permissions,
                depth,
                &resolved,
                Some(allowed_tools),
            ) {
                Ok(runner) => runner
                    .with_max_context_tokens(context_tokens)
                    .with_max_messages_in_memory(max_turns),
                Err(error) => {
                    tracing::warn!(error = %error, "Failed to construct voice display runner");
                    return;
                }
            };
            runner.config.compaction_token_threshold = if auto_compact {
                context_tokens.saturating_mul(compact_threshold) / 100
            } else {
                usize::MAX
            };

            let task = format!(
                "{}\n\nThe ORIGINAL USER REQUEST is authoritative and must be handled completely. You MUST execute manage_board at least once. A prose-only response is a failure. Render any requested visual, drawing, board clear, replacement, or edit with manage_board, then stop. The main-agent response is supporting context only and may be a short spoken wait message. Do not output prose.\n\nORIGINAL USER REQUEST:\n{}\n\nMAIN AGENT RESPONSE:\n{}",
                custom_prompt.unwrap_or_else(|| {
                    "Use only the supplied original request and supporting response. Do not browse or infer missing facts.".to_string()
                }),
                user_request,
                response
            );
            let messages = vec![ChatMessage {
                role: "user".to_string(),
                content: task,
                reasoning_details: None,
                images: None,
                tool_calls: None,
                tool_call_id: None,
            }];
            let synthetic_chat_id = format!("voice-display:{}", source_chat_id);
            let provider = match state.provider().await {
                Ok(provider) => provider,
                Err(error) => {
                    tracing::warn!(error = %error, "Voice display provider is unavailable");
                    return;
                }
            };

            let board_updated = Arc::new(AtomicBool::new(false));
            let board_updated_listener = board_updated.clone();
            let expected_chat_id = synthetic_chat_id.clone();
            let board_listener_id = app.listen("board:update", move |event| {
                if serde_json::from_str::<serde_json::Value>(event.payload())
                    .ok()
                    .and_then(|payload| payload.get("chat_id").and_then(|value| value.as_str()).map(str::to_string))
                    .as_deref()
                    == Some(expected_chat_id.as_str())
                {
                    board_updated_listener.store(true, Ordering::Release);
                }
            });

            let mut result = runner
                .run(
                    provider.as_ref(),
                    synthetic_chat_id.clone(),
                    selected_model.clone(),
                    messages,
                    resolved.agent.clone(),
                    crate::llm::ChatRequestConfig::default(),
                    token.clone(),
                )
                .await;

            if result.is_ok() && !board_updated.load(Ordering::Acquire) && !token.is_cancelled() {
                tracing::warn!(chat_id = %source_chat_id, "Voice display agent completed without updating the board; requesting a structured board operation");
                let retry_messages = vec![ChatMessage {
                    role: "user".to_string(),
                    content: format!(
                        "Convert the request below into exactly one raw JSON object matching the manage_board input schema. Output JSON only: no markdown fence, prose, tool call, or explanation. For a drawing, use action set and one svg block with safe SVG markup. Request:\n{}",
                        user_request
                    ),
                    reasoning_details: None,
                    images: None,
                    tool_calls: None,
                    tool_call_id: None,
                }];
                let mut json_agent = resolved.agent.clone();
                json_agent.instructions = "Return exactly one valid manage_board operation as raw JSON. Do not call tools and do not output prose or markdown.".to_string();
                let json_result = runner
                    .clone()
                    .with_tools_enabled(false)
                    .run(
                        provider.as_ref(),
                        synthetic_chat_id.clone(),
                        selected_model.clone(),
                        retry_messages,
                        json_agent,
                        crate::llm::ChatRequestConfig::default(),
                        token.clone(),
                    )
                    .await;
                result = match json_result {
                    Ok(response) => match response
                        .content
                        .as_deref()
                        .and_then(extract_board_operation)
                    {
                        Some(operation) => ManageBoardTool::new()
                            .run(
                                app.clone(),
                                synthetic_chat_id.clone(),
                                operation,
                                depth,
                                None,
                                token.clone(),
                            )
                            .await
                            .map(|_| response),
                        None => Err(anyhow::anyhow!(
                            "Voice display model returned no valid board operation JSON"
                        )),
                    },
                    Err(error) => Err(error),
                };
            }
            app.unlisten(board_listener_id);

            if result.is_ok() && !board_updated.load(Ordering::Acquire) {
                result = Err(anyhow::anyhow!(
                    "Voice display agent completed without executing manage_board"
                ));
            }
            if let Err(error) = &result {
                tracing::warn!(error = %error, "Voice display agent run failed");
            }
            let _ = app.emit(
                "agent:complete",
                serde_json::json!({
                    "spawn_id": spawn_id,
                    "agent_id": DISPLAY_AGENT_ID,
                    "child_agent_id": DISPLAY_AGENT_ID,
                    "child_agent_name": "ZEN-DISPLAY",
                    "parent_agent": "Zen",
                    "chat_id": source_chat_id,
                    "status": if result.is_ok() { "completed" } else { "failed" },
                    "error": result.err().map(|error| error.to_string())
                }),
            );
        });
    }
}

fn extract_board_operation(content: &str) -> Option<serde_json::Value> {
    let trimmed = content.trim();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return normalize_board_operation(value);
    }

    let start = trimmed.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, ch) in trimmed[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    let candidate = &trimmed[start..start + offset + ch.len_utf8()];
                    let value = serde_json::from_str::<serde_json::Value>(candidate).ok()?;
                    return normalize_board_operation(value);
                }
            }
            _ => {}
        }
    }
    None
}

fn normalize_board_operation(mut value: serde_json::Value) -> Option<serde_json::Value> {
    if value.get("action").is_none() {
        if let Some(arguments) = value
            .get("arguments")
            .or_else(|| value.get("args"))
            .filter(|arguments| arguments.is_object())
            .cloned()
        {
            value = arguments;
        }
    }

    let action = value.get("action")?.as_str()?.to_string();
    let object = value.as_object_mut()?;

    if action == "set" && !object.contains_key("blocks") {
        if let Some(block) = object.remove("block") {
            object.insert("blocks".to_string(), serde_json::json!([block]));
        } else if let Some(mut block) = extract_root_block(object) {
            normalize_block_aliases(&mut block);
            object.insert("blocks".to_string(), serde_json::json!([block]));
        }
    } else if let Some(block) = object.get_mut("block") {
        normalize_block_aliases(block);
    }

    if let Some(blocks) = object.get_mut("blocks").and_then(|blocks| blocks.as_array_mut()) {
        for block in blocks {
            normalize_block_aliases(block);
        }
    }

    Some(value)
}

fn extract_root_block(operation: &mut serde_json::Map<String, serde_json::Value>) -> Option<serde_json::Value> {
    const BLOCK_FIELDS: &[&str] = &[
        "id", "kind", "type", "block_type", "shape", "title", "body", "value", "detail", "language", "expression",
        "columns", "rows", "points", "url", "thumbnail", "description", "size", "alt",
        "caption", "location", "latitude", "longitude", "zoom", "code", "max", "label",
        "markup", "svg", "data", "colors", "names", "diagram", "content", "card_type",
        "card_data", "layout", "old_code", "new_code", "old_label", "new_label",
    ];

    let has_visual_content = BLOCK_FIELDS
        .iter()
        .any(|field| *field != "title" && operation.contains_key(*field));
    if !has_visual_content {
        return None;
    }

    let mut block = serde_json::Map::new();
    for field in BLOCK_FIELDS {
        if let Some(value) = operation.remove(*field) {
            block.insert((*field).to_string(), value);
        }
    }
    if !block.contains_key("id") {
        block.insert("id".to_string(), serde_json::json!("voice-display-content"));
    }
    Some(serde_json::Value::Object(block))
}

fn normalize_block_aliases(block: &mut serde_json::Value) {
    let Some(object) = block.as_object_mut() else {
        return;
    };

    if !object.contains_key("kind") {
        if let Some(kind) = object.remove("type").or_else(|| object.remove("block_type")) {
            object.insert("kind".to_string(), kind);
        }
    }

    if !object.contains_key("markup") {
        if let Some(svg) = object.remove("svg") {
            object.insert("markup".to_string(), svg);
        } else if object.get("kind").and_then(|kind| kind.as_str()) == Some("svg") {
            if let Some(content) = object.remove("content") {
                object.insert("markup".to_string(), content);
            }
        }
    }
    if !object.contains_key("markup") {
        if let Some(shape) = object.get("shape").and_then(|shape| shape.as_str()) {
            if let Some(markup) = simple_shape_svg(shape) {
                object.insert("markup".to_string(), serde_json::json!(markup));
            }
        }
    }

    if !object.contains_key("kind") {
        let inferred = if object.contains_key("markup") {
            Some("svg")
        } else if object.contains_key("points") {
            Some("chart")
        } else if object.contains_key("columns") || object.contains_key("rows") {
            Some("table")
        } else if object.contains_key("expression") {
            Some("equation")
        } else if object.contains_key("code") {
            Some("code")
        } else if object.contains_key("colors") {
            Some("palette")
        } else if object.contains_key("old_code") || object.contains_key("new_code") {
            Some("diff")
        } else if object.contains_key("diagram") && object.contains_key("content") {
            Some("kroki")
        } else if object.contains_key("card_type") && object.contains_key("card_data") {
            Some("premium_card")
        } else if object.contains_key("latitude") && object.contains_key("longitude") {
            Some("map")
        } else if object.contains_key("url") {
            Some(if object.contains_key("description") || object.contains_key("thumbnail") {
                "link_preview"
            } else {
                "image"
            })
        } else if object.contains_key("location") {
            Some("map")
        } else if object.contains_key("data") {
            Some("qr")
        } else if object.contains_key("value") && (object.contains_key("max") || object.contains_key("label")) {
            Some("progress")
        } else if object.contains_key("value") {
            Some("metric")
        } else if object.contains_key("body") {
            Some("note")
        } else {
            None
        };
        if let Some(kind) = inferred {
            object.insert("kind".to_string(), serde_json::json!(kind));
        }
    }
    if !object.contains_key("id") {
        object.insert("id".to_string(), serde_json::json!("voice-display-content"));
    }
}

fn simple_shape_svg(shape: &str) -> Option<String> {
    let element = match shape.trim().to_ascii_lowercase().as_str() {
        "square" | "rectangle" | "rect" => {
            "<rect x='100' y='50' width='200' height='200' rx='4' fill='none' stroke='white' stroke-width='4'/>"
        }
        "circle" => {
            "<circle cx='200' cy='150' r='100' fill='none' stroke='white' stroke-width='4'/>"
        }
        "triangle" => {
            "<polygon points='200,40 340,260 60,260' fill='none' stroke='white' stroke-width='4'/>"
        }
        "line" => "<line x1='60' y1='150' x2='340' y2='150' stroke='white' stroke-width='4'/>",
        _ => return None,
    };
    Some(format!(
        "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'>{}</svg>",
        element
    ))
}

async fn read_usize_setting(
    state: &AppState,
    key: &str,
    default: usize,
    min: usize,
    max: usize,
) -> usize {
    state
        .settings_manager
        .get(key)
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
        .clamp(min, max)
}

async fn read_bool_setting(state: &AppState, key: &str, default: bool) -> bool {
    state
        .settings_manager
        .get(key)
        .await
        .ok()
        .flatten()
        .map(|value| value == "true")
        .unwrap_or(default)
}
