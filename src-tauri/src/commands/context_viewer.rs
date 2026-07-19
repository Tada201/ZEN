//! Tauri command handlers for the Codex-style context viewer.
//!
//! The viewer is driven live by the `context:breakdown` event bus in
//! production: the runner emits the latest breakdown after every chain
//! run, the bridge task forwards it to the frontend, and the Zustand
//! store hydrates in real time. The Tauri commands in this file are
//! the cold-start path: when the user opens a chat that has prior
//! iteration history but no live iteration is currently running, the
//! right-panel hydrates from `AppState.context_breakdown_cache` instead
//! of waiting for the next live event.
//!
//! The cache is populated from `runner/loop.rs` immediately after
//! every `compute_context_breakdown` and is keyed by `chat_id`.
//! Newest entry wins; entries are pruned in
//! `commands/chat/crud.rs::delete_chat` and `bulk_delete_chats`
//! alongside `recall_cache` and `session_permissions`.

use crate::agent::runner::context_breakdown::{ContextSectionId, SectionCategory};
use crate::agent::runner::ContextBreakdownPayload;
use crate::commands::AppState;
use serde::Serialize;
use tauri::State;

/// Compact summary returned by `get_context_snapshot`. Smaller than the
/// full payload so the PremiumChatInput badge can poll cheaply.
///
/// Carries `run_id` so the cold-start hydrate path (this snapshot
/// command) and the live `context:breakdown` event path agree on the
/// same identifier contract. `useContextStore` dedupes by
/// `(chatId, runId, iteration)` for both. `None` is exposed as
/// `runId: null` so an empty snapshot (no cached payload yet) does
/// not look like a valid run-0 marker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub chat_id: String,
    pub run_id: Option<u64>,
    pub total_tokens: usize,
    /// The compaction cap the breakdown was sized against.
    pub context_window: usize,
    /// The selected model's real context window, when known. The UI
    /// prefers this as the gauge denominator; `None` falls back to
    /// `context_window`.
    pub model_context_window: Option<usize>,
    pub utilization: f32,
    pub has_data: bool,
    pub layer_totals: LayerSnapshot,
    pub top_sections: Vec<SectionSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerSnapshot {
    pub system_prompt: usize,
    pub system_tools: usize,
    pub mcp_tools: usize,
    pub skills_catalog: Option<usize>,
    pub recall: Option<usize>,
    pub summary: usize,
    pub conversation: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionSnapshot {
    pub id: String,
    pub label: String,
    pub category: String,
    pub tokens: usize,
    pub chars: usize,
    pub is_must_keep: bool,
    pub is_truncated: bool,
    pub is_active: bool,
}

/// Cheap kebab-case projection for `ContextSectionId` / `SectionCategory`.
/// Lets `derive_snapshot` skip a `serde_json::to_value + as_str()`
/// round-trip per section per poll — the result is identical to the
/// serde-derived string but allocates once per match instead of once
/// per HTTP response.
fn id_str(s: ContextSectionId) -> &'static str {
    match s {
        ContextSectionId::SafetyPreamble => "safety-preamble",
        ContextSectionId::AgentInstructions => "agent-instructions",
        ContextSectionId::Time => "time",
        ContextSectionId::UiRules => "ui-rules",
        ContextSectionId::DrawingCanvas => "drawing-canvas",
        ContextSectionId::GraphSession => "graph-session",
        ContextSectionId::GraphSessionState => "graph-session-state",
        ContextSectionId::DirectBoard => "direct-board",
        ContextSectionId::ToolSystem => "tool-system",
        ContextSectionId::TodoChecklist => "todo-checklist",
        ContextSectionId::PatchRules => "patch-rules",
        ContextSectionId::AgentRoles => "agent-roles",
        ContextSectionId::SkillsCatalog => "skills-catalog",
        ContextSectionId::SemanticRecall => "semantic-recall",
        ContextSectionId::PreviousSummary => "previous-summary",
        ContextSectionId::CurrentSummary => "current-summary",
        ContextSectionId::Conversation => "conversation",
        ContextSectionId::SystemToolsCatalog => "system-tools-catalog",
        ContextSectionId::McpToolsCatalog => "mcp-tools-catalog",
    }
}

fn category_str(c: SectionCategory) -> &'static str {
    match c {
        SectionCategory::Messages => "messages",
        SectionCategory::SystemTools => "system-tools",
        SectionCategory::McpTools => "mcp-tools",
        SectionCategory::Skills => "skills",
        SectionCategory::SystemPrompt => "system-prompt",
        SectionCategory::MetaContext => "meta-context",
    }
}

/// Fetch the most recent breakdown for `chat_id`, or `None` if no
/// iteration has finished yet (e.g. a brand-new chat with no live event
/// in the bus).
#[tauri::command]
pub async fn get_context_breakdown(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Option<ContextBreakdownPayload>, String> {
    if chat_id.is_empty() {
        return Err("chat_id is required".to_string());
    }
    let guard = state.context_breakdown_cache.read().await;
    Ok(guard.get(&chat_id).cloned())
}

/// Compact snapshot used by the PremiumChatInput badge.
///
/// Returns:
/// * `Ok(snapshot)` with `has_data = true` when the cache holds a
///   payload for `chat_id` — the snapshot is derived from it.
/// * `Ok(snapshot)` with `has_data = false` and zero totals when the
///   cache has no entry yet, so the badge shows a calm empty state
///   instead of an error.
/// * `Err(_)` only when `chat_id` is empty.
#[tauri::command]
pub async fn get_context_snapshot(
    state: State<'_, AppState>,
    chat_id: String,
    context_window: Option<usize>,
) -> Result<ContextSnapshot, String> {
    if chat_id.is_empty() {
        return Err("chat_id is required".to_string());
    }
    // The cached payload's `context_window` is authoritative — the
    // breakdown was sized against THAT budget. The caller-supplied
    // window (e.g. the user's per-session UI value) is only used as a
    // hint for the empty case where there's no cached payload yet.
    let guard = state.context_breakdown_cache.read().await;
    let Some(payload) = guard.get(&chat_id) else {
        let fallback_cw = context_window.unwrap_or(100_000).max(1);
        return Ok(empty_snapshot(&chat_id, fallback_cw));
    };

    Ok(derive_snapshot(payload))
}

fn empty_snapshot(chat_id: &str, context_window: usize) -> ContextSnapshot {
    ContextSnapshot {
        chat_id: chat_id.to_string(),
        run_id: None,
        total_tokens: 0,
        context_window,
        model_context_window: None,
        utilization: 0.0,
        has_data: false,
        layer_totals: LayerSnapshot {
            system_prompt: 0,
            system_tools: 0,
            mcp_tools: 0,
            skills_catalog: None,
            recall: None,
            summary: 0,
            conversation: 0,
        },
        top_sections: Vec::new(),
    }
}

fn derive_snapshot(payload: &ContextBreakdownPayload) -> ContextSnapshot {
    // Authoritative window: the budget the breakdown was actually
    // computed against. Falls back to 1 only when the runner failed to
    // pass one (defensive divide-by-zero guard); UI division by 1 will
    // saturate at 1.0 which signals an upstream bug rather than
    // producing a misleading low utilization.
    let cw = payload.context_window.max(1);
    // Utilization is reported against the real model window when known
    // (the gauge denominator the UI shows), falling back to the
    // compaction cap. This keeps the badge percentage consistent with
    // the "used / window" figure in the popover.
    let gauge_window = payload
        .model_context_window
        .filter(|&w| w > 0)
        .unwrap_or(cw)
        .max(1);
    let utilization = (payload.total_tokens as f32 / gauge_window as f32).clamp(0.0, 1.0);

    let top_sections: Vec<SectionSnapshot> = payload
        .sections
        .iter()
        .map(|s| SectionSnapshot {
            id: id_str(s.id).to_string(),
            label: s.label.clone(),
            category: category_str(s.category).to_string(),
            tokens: s.tokens,
            chars: s.chars,
            is_must_keep: s.is_must_keep,
            is_truncated: s.is_truncated,
            is_active: s.is_active,
        })
        .collect();

    ContextSnapshot {
        chat_id: payload.chat_id.clone(),
        run_id: Some(payload.run_id),
        total_tokens: payload.total_tokens,
        context_window: cw,
        model_context_window: payload.model_context_window.filter(|&w| w > 0),
        utilization,
        has_data: true,
        layer_totals: LayerSnapshot {
            system_prompt: payload.system_prompt_tokens,
            system_tools: payload.system_tools_tokens,
            mcp_tools: payload.mcp_tools_tokens,
            skills_catalog: payload.skills_catalog_tokens,
            recall: payload.recall_tokens,
            summary: payload.summary_tokens,
            conversation: payload.conversation_tokens,
        },
        top_sections,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::runner::context_breakdown::{ContextSectionId, SectionCategory};

    /// Round-trip guard: every `ContextSectionId` variant must produce
    /// the same kebab-case string via serde's auto-rename AND via the
    /// hand-written `id_str` match. If a future contributor adds a
    /// variant to the enum, the match becomes non-exhaustive and
    /// `cargo check` blocks the commit; this test additionally blocks
    /// a *string typo* in the match arm.
    #[test]
    fn id_str_matches_serde_kebab_case() {
        let pairs: &[(ContextSectionId, &str)] = &[
            (ContextSectionId::SafetyPreamble, "safety-preamble"),
            (ContextSectionId::AgentInstructions, "agent-instructions"),
            (ContextSectionId::Time, "time"),
            (ContextSectionId::UiRules, "ui-rules"),
            (ContextSectionId::DrawingCanvas, "drawing-canvas"),
            (ContextSectionId::GraphSession, "graph-session"),
            (ContextSectionId::GraphSessionState, "graph-session-state"),
            (ContextSectionId::DirectBoard, "direct-board"),
            (ContextSectionId::ToolSystem, "tool-system"),
            (ContextSectionId::TodoChecklist, "todo-checklist"),
            (ContextSectionId::PatchRules, "patch-rules"),
            (ContextSectionId::AgentRoles, "agent-roles"),
            (ContextSectionId::SkillsCatalog, "skills-catalog"),
            (ContextSectionId::SemanticRecall, "semantic-recall"),
            (ContextSectionId::PreviousSummary, "previous-summary"),
            (ContextSectionId::CurrentSummary, "current-summary"),
            (ContextSectionId::Conversation, "conversation"),
            (ContextSectionId::SystemToolsCatalog, "system-tools-catalog"),
            (ContextSectionId::McpToolsCatalog, "mcp-tools-catalog"),
        ];
        for (variant, expected) in pairs {
            let serde_str = serde_json::to_value(variant)
                .ok()
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_default();
            assert_eq!(
                serde_str, *expected,
                "serde kebab-case drift for {:?}",
                variant
            );
            assert_eq!(
                id_str(*variant),
                *expected,
                "id_str drift vs serde for {:?}",
                variant
            );
        }
    }

    /// Same guarantee for `SectionCategory`.
    #[test]
    fn category_str_matches_serde_kebab_case() {
        let pairs: &[(SectionCategory, &str)] = &[
            (SectionCategory::Messages, "messages"),
            (SectionCategory::SystemTools, "system-tools"),
            (SectionCategory::McpTools, "mcp-tools"),
            (SectionCategory::Skills, "skills"),
            (SectionCategory::SystemPrompt, "system-prompt"),
            (SectionCategory::MetaContext, "meta-context"),
        ];
        for (variant, expected) in pairs {
            let serde_str = serde_json::to_value(variant)
                .ok()
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_default();
            assert_eq!(
                serde_str, *expected,
                "serde kebab-case drift for {:?}",
                variant
            );
            assert_eq!(
                category_str(*variant),
                *expected,
                "category_str drift vs serde for {:?}",
                variant
            );
        }
    }
}
