//! Model, provider, and reasoning-effort resolution for a child agent.

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::commands::AppState;

pub(super) fn optional_string(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str).filter(|text| !text.trim().is_empty())
}

/// The model a child should inherit when neither the spawn request nor the
/// agent profile names one. Built-in profiles ship with `model_override: null`,
/// so this is the normal path rather than an edge case. Prefers the chat's own
/// model over the globally selected one so a child matches the turn that
/// spawned it.
pub(super) async fn inherited_model_for_child(app: &AppHandle, chat_id: &str) -> Option<String> {
    let state = app.state::<AppState>();
    let db = state.db().await.ok()?;
    let chat_model = zen_db::queries::get_chat(&db, chat_id)
        .await
        .ok()
        .and_then(|chat| chat.model)
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty());
    if chat_model.is_some() {
        return chat_model;
    }
    zen_db::queries::get_setting(&db, "active_model")
        .await
        .ok()
        .flatten()
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
}

/// Split a `provider::model` selection (the canonical form the settings UI
/// stores). Returns `(provider, model)` where a bare model id yields `None` for
/// the provider (meaning "use the active provider"). Returns `None` when there
/// is no usable model id.
pub(crate) fn parse_provider_model(raw: &str) -> Option<(Option<String>, String)> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    match raw.split_once("::") {
        Some((provider, model)) => {
            let model = model.trim();
            if model.is_empty() {
                return None;
            }
            let provider = provider.trim();
            Some((
                (!provider.is_empty()).then(|| provider.to_string()),
                model.to_string(),
            ))
        }
        None => Some((None, raw.to_string())),
    }
}

/// The user-selected model for a specific registered agent, stored by the
/// Subagents settings page under `agent_model.<id>` as a canonical
/// `provider::model` string. Built-in profiles reject edits, so this per-agent
/// setting is how a built-in (generalist / explore) gets a persisted model
/// without mutating its fixed profile. `None` when unset or blank.
pub(super) async fn configured_agent_model(app: &AppHandle, agent_id: &str) -> Option<(Option<String>, String)> {
    if agent_id.trim().is_empty() {
        return None;
    }
    let state = app.state::<AppState>();
    let raw = state
        .settings_manager
        .get(&format!("agent_model.{agent_id}"))
        .await
        .ok()
        .flatten()?;
    parse_provider_model(&raw)
}

/// The user-selected reasoning effort for a specific registered agent, stored by
/// the Subagents settings page under `agent_reasoning.<id>` as a canonical effort
/// level. `None` when unset or blank, meaning the child inherits (no reasoning
/// override is applied).
pub(super) async fn configured_agent_reasoning(app: &AppHandle, agent_id: &str) -> Option<String> {
    if agent_id.trim().is_empty() {
        return None;
    }
    let state = app.state::<AppState>();
    state
        .settings_manager
        .get(&format!("agent_reasoning.{agent_id}"))
        .await
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn optional_string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}
