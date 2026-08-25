//! `repair_mermaid` — self-healing Mermaid diagrams.
//!
//! When a Mermaid block fails to render, the frontend sends the broken code
//! plus the renderer's parse error to the active model, which returns a
//! corrected diagram. This is a small one-shot LLM call (no tools, no chat
//! history, no persistence) mirroring the title-maker pattern in `title.rs`.

use tauri::State;
use tracing::info;

use crate::commands::AppState;
use crate::db::models::ChatMessage;
use crate::db::queries;
use crate::error::{ZenError, ZenResult};
use crate::llm::ChatRequestConfig;

/// Repair task instructions: return ONLY the corrected diagram, no prose.
const REPAIR_SYSTEM_PROMPT: &str = r#"You are a Mermaid diagram repair specialist.

The user will give you a Mermaid diagram that failed to render and the renderer's
error message. Fix the diagram so it is strictly valid Mermaid syntax:
- Correct bracket matchups, parentheses, arrow combinations, and node definitions.
- Keep the same diagram intent (flowchart, sequence, class, etc.) unless it is
  fundamentally broken; only switch diagram type when the syntax demands it.
- Use standard Mermaid keywords only. Do not invent keywords.
- Reply with ONLY the corrected Mermaid diagram code. No explanations, no prose,
  no markdown fences, no ```mermaid wrapper, no code-block syntax."#;

/// Leading keywords that identify a Mermaid diagram's first meaningful line.
const MERMAID_DIAGRAM_TYPES: &[&str] = &[
    "graph",
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "quadrantChart",
    "requirementDiagram",
    "gitGraph",
    "mindmap",
    "timeline",
    "zenuml",
    "sankey-beta",
    "xychart-beta",
    "block",
    "packet",
    "architecture-beta",
    "C4Context",
    "C4Container",
    "C4Component",
    "C4Dynamic",
    "C4Deployment",
    "info",
];

/// Strip optional markdown fences and any trailing/leading whitespace from a
/// model response. The repair prompts forbid fences, but models sometimes add
/// them anyway, so strip them defensively (works for ```mermaid and ```chart).
fn extract_fenced_code(raw: &str) -> String {
    let mut trimmed = raw.trim();
    if trimmed.starts_with("```") {
        // Consume the opening fence line (may be ``` or ```mermaid/```chart),
        // then drop everything from the last closing fence onward.
        if let Some(rest) = trimmed.split_once('\n').map(|(_, rest)| rest) {
            trimmed = rest;
        }
        if let Some(end) = trimmed.rfind("```") {
            trimmed = &trimmed[..end];
        }
        trimmed = trimmed.trim();
    }
    trimmed.to_string()
}

/// Lightweight plausibility check: the first meaningful (non-comment,
/// non-empty) line must declare a known diagram type or an init directive.
/// The frontend re-renders the result through Mermaid, which is the
/// authoritative validation.
fn is_plausible_mermaid(code: &str) -> bool {
    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("%%") {
            continue;
        }
        return trimmed.starts_with("%%{")
            || MERMAID_DIAGRAM_TYPES
                .iter()
                .any(|keyword| trimmed.starts_with(keyword));
    }
    false
}

/// Repair a broken Mermaid diagram through the active model.
#[tauri::command]
pub async fn repair_mermaid(
    state: State<'_, AppState>,
    code: String,
    error: String,
    provider: Option<String>,
    model: Option<String>,
) -> ZenResult<String> {
    if code.trim().is_empty() {
        return Err(ZenError::Custom(
            "Nothing to repair: empty Mermaid code".to_string(),
        ));
    }

    let db = state.db().await?;

    // Resolve provider: explicit override, else the active provider, else the
    // long-standing default. Same fallback shape as the title-maker.
    let resolved_provider_name = match provider.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => queries::get_setting(&db, "active_provider")
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "ollama".to_string()),
    };
    let llm_provider = state
        .provider_by_name(&resolved_provider_name, &db)
        .await
        .map_err(|e| {
            ZenError::Internal(format!(
                "Mermaid repair provider resolution failed: {e}"
            ))
        })?;

    // Resolve model: explicit override, else the active model.
    let active_model = match model {
        Some(m) if !m.is_empty() => m,
        _ => queries::get_setting(&db, "active_model")
            .await
            .ok()
            .flatten()
            .filter(|m| !m.is_empty())
            .ok_or_else(|| {
                ZenError::Custom(
                    "No model selected. Open Settings → Models to choose a model.".to_string(),
                )
            })?,
    };

    let user_prompt = format!(
        "The following Mermaid diagram failed to render.\n\n\
         ## Broken diagram\n```mermaid\n{code}\n```\n\n\
         ## Renderer error\n{error}\n\n\
         Return ONLY the corrected Mermaid diagram code."
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: REPAIR_SYSTEM_PROMPT.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: user_prompt,
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let response = llm_provider
        .chat_stream(
            &active_model,
            messages,
            None,
            ChatRequestConfig::default(),
            Box::new(|_| {}),
            tokio_util::sync::CancellationToken::new(),
        )
        .await
        .map_err(|e| {
            ZenError::Internal(format!("Mermaid repair generation failed: {e}"))
        })?;

    let fixed = extract_fenced_code(&response.content);
    if fixed.is_empty() || !is_plausible_mermaid(&fixed) {
        return Err(ZenError::Custom(
            "The model did not return a valid repaired Mermaid diagram. Please try again."
                .to_string(),
        ));
    }

    info!(
        provider = %resolved_provider_name,
        model = %active_model,
        "Repaired Mermaid diagram"
    );
    Ok(fixed)
}

/// Chart repair task instructions: fix invalid JSON and condense oversized
/// payloads, returning ONLY the canonical chart JSON.
const REPAIR_CHART_SYSTEM_PROMPT: &str = r#"You are a chart data repair specialist.

The user will give you a chart JSON spec that failed to render — usually because
the data is too large or the JSON is invalid. Return ONLY the corrected chart
JSON. No prose, no explanations, no markdown fences, no ```chart wrapper.

Rules:
- Keep the canonical schema: {"type": "bar|line|area|pie", "title": "...", "xAxis": "...", "keys": ["..."], "data": [...]}.
- If the error says the data is too large, condense it: keep the same chart
  type, title, axes, and series keys, but reduce the data to a representative
  summary (fewer buckets/points, rounded values).
- If the JSON is invalid, fix the syntax.
- Output ONLY the JSON object."#;

/// Lightweight plausibility check: the reply must parse as JSON with a
/// non-empty `data` array. The frontend re-parses and re-renders the result,
/// which is the authoritative validation.
fn is_plausible_chart(json: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return false;
    };
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .map(|arr| !arr.is_empty())
        .unwrap_or(false)
}

/// Condense or repair an oversized/invalid chart payload through the active
/// model. Same one-shot pattern as `repair_mermaid`: no tools, no history, no
/// persistence — the corrected JSON is re-rendered by the frontend.
#[tauri::command]
pub async fn repair_chart(
    state: State<'_, AppState>,
    code: String,
    error: String,
    provider: Option<String>,
    model: Option<String>,
) -> ZenResult<String> {
    if code.trim().is_empty() {
        return Err(ZenError::Custom(
            "Nothing to repair: empty chart data".to_string(),
        ));
    }

    let db = state.db().await?;

    let resolved_provider_name = match provider.as_deref() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => queries::get_setting(&db, "active_provider")
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "ollama".to_string()),
    };
    let llm_provider = state
        .provider_by_name(&resolved_provider_name, &db)
        .await
        .map_err(|e| {
            ZenError::Internal(format!(
                "Chart repair provider resolution failed: {e}"
            ))
        })?;

    let active_model = match model {
        Some(m) if !m.is_empty() => m,
        _ => queries::get_setting(&db, "active_model")
            .await
            .ok()
            .flatten()
            .filter(|m| !m.is_empty())
            .ok_or_else(|| {
                ZenError::Custom(
                    "No model selected. Open Settings → Models to choose a model.".to_string(),
                )
            })?,
    };

    let user_prompt = format!(
        "The following chart JSON failed to render.\n\n\
         ## Broken chart\n```chart\n{code}\n```\n\n\
         ## Renderer error\n{error}\n\n\
         Return ONLY the corrected chart JSON."
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: REPAIR_CHART_SYSTEM_PROMPT.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: user_prompt,
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let response = llm_provider
        .chat_stream(
            &active_model,
            messages,
            None,
            ChatRequestConfig::default(),
            Box::new(|_| {}),
            tokio_util::sync::CancellationToken::new(),
        )
        .await
        .map_err(|e| {
            ZenError::Internal(format!("Chart repair generation failed: {e}"))
        })?;

    let fixed = extract_fenced_code(&response.content);
    if fixed.is_empty() || !is_plausible_chart(&fixed) {
        return Err(ZenError::Custom(
            "The model did not return a valid repaired chart. Please try again."
                .to_string(),
        ));
    }

    info!(
        provider = %resolved_provider_name,
        model = %active_model,
        "Repaired chart data"
    );
    Ok(fixed)
}
