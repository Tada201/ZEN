//! Per-iteration context breakdown for the Zen visualiser.
//!
//! The runner calls [`compute_context_breakdown`] right after the
//! middleware chain runs and before the LLM call. The result is emitted
//! on the event bus as `context:breakdown` so the frontend can render a
//! Codex-style progress viewer (per-section tokens + status) directly in
//! the premium input and a fuller right-panel view on demand.
//!
//! The model is deliberately coarse-grained: each middleware-built
//! section is one row, the conversation is one bucket. We do not
//! explode per-message — the chat is noisy enough already. Section
//! bodies are kept verbatim so the "Technical details" disclosure in
//! the UI has something to reveal per the frontend chat-timeline rules.

use serde::{Deserialize, Serialize};

use crate::middleware::EnrichmentContext;
use crate::runner::config::RunConfig;
use crate::runner::helpers::{estimate_conversation_tokens, estimate_tokens};

/// Product-facing context bucket. One canonical taxonomy shared
/// backend→frontend (see `src/lib/types/contextBreakdown.ts`). Every
/// section maps into exactly one of these six buckets, and the badge,
/// hover popover, and full panel all render the same set.
///
/// Color coding in the visualiser: messages = slate, system-tools =
/// amber, mcp-tools = orange, skills = violet, system-prompt = blue,
/// meta-context = emerald.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SectionCategory {
    /// The live conversation messages.
    Messages,
    /// Built-in tool definitions actually exposed to the model.
    SystemTools,
    /// External MCP (`ext:*`) tool definitions exposed to the model.
    McpTools,
    /// Skills catalog metadata.
    Skills,
    /// Safety preamble, agent instructions, rules, canvas, graph, roles,
    /// and the deferred-discovery tool protocol prose.
    SystemPrompt,
    /// Semantic recall + conversation summaries.
    MetaContext,
}

/// Stable, product-facing identifier for each middleware-built section.
/// Serialised with `rename_all = "kebab-case"` so the frontend can do a
/// 1:1 string compare against `ContextSectionId` without an enum bridge.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum ContextSectionId {
    SafetyPreamble,
    AgentInstructions,
    Time,
    UiRules,
    DrawingCanvas,
    GraphSession,
    GraphSessionState,
    DirectBoard,
    ToolSystem,
    TodoChecklist,
    PatchRules,
    AgentRoles,
    SkillsCatalog,
    SemanticRecall,
    PreviousSummary,
    CurrentSummary,
    Conversation,
    /// Synthetic row: built-in tool definitions exposed to the model
    /// this iteration. Not a middleware section — computed from the
    /// exposed tool list in [`compute_context_breakdown`].
    SystemToolsCatalog,
    /// Synthetic row: external MCP (`ext:*`) tool definitions exposed to
    /// the model this iteration.
    McpToolsCatalog,
}

/// Per-section record. `body` is the FULL text the middleware emitted
/// (even when truncated = true) so the UI's "Technical details"
/// disclosure has something to reveal per the frontend chat-timeline rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSection {
    pub id: ContextSectionId,
    /// Product-language label shown in the UI (e.g. "Reading files"
    /// is wrong here — "Tool system" is right; the rule is "use product
    /// language, not implementation names").
    pub label: String,
    pub category: SectionCategory,
    pub tokens: usize,
    pub chars: usize,
    pub is_must_keep: bool,
    /// True when the section was pushed but truncated by `truncate_to_budget`.
    pub is_truncated: bool,
    /// False when budget was exhausted before this section could land.
    pub is_active: bool,
    /// The raw emitted body. Present in every state so "Technical details"
    /// disclosure always has content.
    pub body: String,
}

/// What compaction path fired this iteration (if any). Used to render
/// the compaction timeline in the right-panel view.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CompactionKind {
    Light,
    Aggressive,
    MessageCountCap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompactionEvent {
    pub kind: CompactionKind,
    pub pre_tokens: usize,
    pub post_tokens: usize,
    pub target_tokens: usize,
}

/// Top-level payload sent via the `context:breakdown` event. Designed
/// to be small enough to send every iteration without flooding the
/// broadcast bus — the frontend dedupes by `(chat_id, run_id, iteration)`
/// so a later, shorter run on the same chat never gets overwritten by a
/// stale, longer earlier run.
///
/// `run_id` is a monotonic per-Runner.run() counter minted from
/// `AppState.next_run_id`; the same value is carried on every payload
/// emitted during that run so the cold-start snapshot cache and the
/// live event bus share one identifier contract.
///
/// Serialised with **`#[serde(rename_all = "camelCase")]`** to match
/// the existing `ContextSnapshot` convention and the
/// `ContextBreakdown` TypeScript type — the frontend `useContextStore`
/// reads `chatId` / `runId`, never `chat_id` / `run_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBreakdownPayload {
    pub chat_id: String,
    pub run_id: u64,
    pub iteration: usize,
    pub total_tokens: usize,
    /// The compaction cap (`RunConfig.max_context_tokens`). This is the
    /// soft ceiling Zen compacts against, NOT the model's hardware
    /// window. Kept for back-compat and to drive the amber/rose status.
    pub context_window: usize,
    /// The selected model's real context window (`max_context_length`),
    /// when known. `None` falls back to `context_window` in the UI. This
    /// is what the badge/popover denominator should use so the gauge
    /// reflects the actual model budget (200K, 1M, …), not the cap.
    pub model_context_window: Option<usize>,
    pub system_prompt_tokens: usize,
    /// Catalog cost of the built-in tool definitions exposed to the model.
    pub system_tools_tokens: usize,
    /// Catalog cost of the external MCP (`ext:*`) tool definitions exposed.
    pub mcp_tools_tokens: usize,
    pub skills_catalog_tokens: Option<usize>,
    pub recall_tokens: Option<usize>,
    pub summary_tokens: usize,
    pub conversation_tokens: usize,
    /// Provider-reported prompt tokens from the most recently COMPLETED
    /// LLM call this run (OpenAI `prompt_tokens`, Anthropic `input_tokens`,
    /// Gemini `promptTokenCount`). `None` before the first call returns.
    /// This is the real input-context size the provider billed, distinct
    /// from `total_tokens` which is Zen's tokenizer estimate. The two are
    /// surfaced side by side so the user sees estimate-vs-actual drift.
    pub actual_input_tokens: Option<usize>,
    /// Provider-reported completion tokens from the most recent completed
    /// LLM call (OpenAI `completion_tokens`, Anthropic `output_tokens`).
    pub actual_output_tokens: Option<usize>,
    pub compaction_event: Option<CompactionEvent>,
    pub sections: Vec<ContextSection>,
}

// ── Compute ────────────────────────────────────────────────────

/// Per-layer totals derived from the section log + the live conversation.
#[derive(Debug, Clone, Copy)]
pub struct LayerTotals {
    pub system_prompt: usize,
    pub skills_catalog: Option<usize>,
    pub recall: Option<usize>,
    pub summary: usize,
    pub conversation: usize,
    pub extras_total: usize,
}

impl LayerTotals {
    pub fn grand_total(&self) -> usize {
        self.system_prompt
            + self.skills_catalog.unwrap_or(0)
            + self.recall.unwrap_or(0)
            + self.summary
            + self.conversation
    }
}

/// Split of the tool-definition catalog exposed to the model this
/// iteration, by built-in vs external MCP (`ext:*`) origin. Under
/// deferred discovery the model still receives the three meta-tools
/// (plus any tier-inlined v2 schemas), so this is a real context cost —
/// distinct from the tool-protocol *prose* which lives in the system
/// prompt bucket.
#[derive(Debug, Clone, Copy, Default)]
pub struct ToolCatalogTotals {
    pub system_tools: usize,
    pub mcp_tools: usize,
}

/// Price the exposed tool definitions (name + description + JSON schema)
/// and split them by origin. An `ext:{server}:{name}` name marks an
/// external MCP tool; everything else is a built-in system tool.
pub fn tool_catalog_totals(exposed_tools: &[zen_tools::ToolInfo]) -> ToolCatalogTotals {
    let mut totals = ToolCatalogTotals::default();
    for tool in exposed_tools {
        let schema = tool.parameters.to_string();
        let tokens = estimate_tokens(&tool.name)
            + estimate_tokens(&tool.description)
            + estimate_tokens(&schema);
        if zen_mcp::client::is_external_tool_name(&tool.name) {
            totals.mcp_tools += tokens;
        } else {
            totals.system_tools += tokens;
        }
    }
    totals
}

/// Extract the per-layer totals from `ctx`. Pure read; no allocations
/// beyond the closure captures. Used both by [`compute_context_breakdown`]
/// and by tests that want to assert layer partitioning without
/// rebuilding the full payload.
pub fn layer_totals(ctx: &EnrichmentContext) -> LayerTotals {
    let mut system_prompt = 0usize;
    let mut skills_catalog = None;
    let mut recall = None;
    let mut summary = 0usize;

    for entry in &ctx.section_log {
        let tokens = estimate_tokens(&entry.content);
        match entry.id {
            crate::middleware::ContextSectionId::SafetyPreamble
            | crate::middleware::ContextSectionId::AgentInstructions
            | crate::middleware::ContextSectionId::Time
            | crate::middleware::ContextSectionId::UiRules
            | crate::middleware::ContextSectionId::DrawingCanvas
            | crate::middleware::ContextSectionId::GraphSession
            | crate::middleware::ContextSectionId::GraphSessionState
            | crate::middleware::ContextSectionId::DirectBoard
            | crate::middleware::ContextSectionId::ToolSystem
            | crate::middleware::ContextSectionId::TodoChecklist
            | crate::middleware::ContextSectionId::PatchRules
            | crate::middleware::ContextSectionId::AgentRoles => {
                system_prompt += tokens;
            }
            crate::middleware::ContextSectionId::SkillsCatalog => {
                skills_catalog = Some(tokens);
            }
            crate::middleware::ContextSectionId::SemanticRecall => {
                recall = Some(tokens);
            }
            crate::middleware::ContextSectionId::PreviousSummary
            | crate::middleware::ContextSectionId::CurrentSummary => {
                summary += tokens;
            }
            crate::middleware::ContextSectionId::Conversation => {
                // Should already be stripped out / handled separately, but be defensive.
            }
        }
    }

    // extra_system_messages is what SummaryMiddleware actually wrote.
    // It is counted separately because summaries also push into the
    // section log when tagged. If mismatch, surface the larger value.
    let extras_total: usize = ctx
        .extra_system_messages
        .iter()
        .map(|m| estimate_tokens(m))
        .sum();

    LayerTotals {
        system_prompt,
        skills_catalog,
        recall,
        summary: summary.max(extras_total),
        conversation: estimate_conversation_tokens(&ctx.conversation),
        extras_total,
    }
}

/// Compute the breakdown payload from the post-chain `ctx`.
///
/// * `compaction` describes what compaction path ran this iteration, if any.
/// * `exposed_tools` is the tool-definition list actually sent to the model
///   (meta-tools + any tier-inlined v2 schemas); it is priced and split into
///   the System-tools / MCP-tools buckets.
/// * `model_context_window` is the selected model's real `max_context_length`
///   when known; the UI uses it as the gauge denominator, falling back to the
///   compaction cap (`context_window`) when `None`.
pub fn compute_context_breakdown(
    ctx: &EnrichmentContext,
    run_config: &RunConfig,
    compaction: Option<CompactionEvent>,
    exposed_tools: &[zen_tools::ToolInfo],
    model_context_window: Option<usize>,
) -> ContextBreakdownPayload {
    let totals = layer_totals(ctx);
    let tool_totals = tool_catalog_totals(exposed_tools);

    let sections: Vec<ContextSection> = ctx
        .section_log
        .iter()
        .map(build_section)
        .chain(std::iter::once(synthetic_conversation_section(ctx)))
        .chain(synthetic_tool_sections(&tool_totals, exposed_tools))
        .collect();

    ContextBreakdownPayload {
        chat_id: ctx.chat_id.clone(),
        run_id: ctx.run_id,
        iteration: ctx.iteration,
        total_tokens: totals.grand_total()
            + tool_totals.system_tools
            + tool_totals.mcp_tools,
        context_window: run_config.max_context_tokens,
        model_context_window,
        system_prompt_tokens: totals.system_prompt,
        system_tools_tokens: tool_totals.system_tools,
        mcp_tools_tokens: tool_totals.mcp_tools,
        skills_catalog_tokens: totals.skills_catalog,
        recall_tokens: totals.recall,
        summary_tokens: totals.summary,
        conversation_tokens: totals.conversation,
        // Filled in by the runner loop from the last completed LLM
        // response before the payload is emitted; `compute_*` only has
        // the pre-call estimate, so it leaves the real usage as None.
        actual_input_tokens: None,
        actual_output_tokens: None,
        compaction_event: compaction,
        sections,
    }
}

/// Build the two synthetic tool-catalog rows. Each is emitted only when
/// it carries tokens so the section list stays clean for tool-less runs.
/// The body enumerates the exposed tool names so the "Technical details"
/// disclosure has real content.
fn synthetic_tool_sections(
    totals: &ToolCatalogTotals,
    exposed_tools: &[zen_tools::ToolInfo],
) -> Vec<ContextSection> {
    let mut rows = Vec::new();
    let is_ext = |t: &&zen_tools::ToolInfo| zen_mcp::client::is_external_tool_name(&t.name);

    if totals.system_tools > 0 {
        let names: Vec<&str> = exposed_tools
            .iter()
            .filter(|t| !is_ext(t))
            .map(|t| t.name.as_str())
            .collect();
        rows.push(ContextSection {
            id: ContextSectionId::SystemToolsCatalog,
            label: "System tools".to_string(),
            category: SectionCategory::SystemTools,
            tokens: totals.system_tools,
            chars: names.iter().map(|n| n.len()).sum(),
            is_must_keep: false,
            is_truncated: false,
            is_active: true,
            body: format!(
                "{} built-in tool definition(s) exposed to the model:\n{}",
                names.len(),
                names.join(", ")
            ),
        });
    }

    if totals.mcp_tools > 0 {
        let names: Vec<&str> = exposed_tools
            .iter()
            .filter(is_ext)
            .map(|t| t.name.as_str())
            .collect();
        rows.push(ContextSection {
            id: ContextSectionId::McpToolsCatalog,
            label: "MCP tools".to_string(),
            category: SectionCategory::McpTools,
            tokens: totals.mcp_tools,
            chars: names.iter().map(|n| n.len()).sum(),
            is_must_keep: false,
            is_truncated: false,
            is_active: true,
            body: format!(
                "{} external MCP tool definition(s) exposed to the model:\n{}",
                names.len(),
                names.join(", ")
            ),
        });
    }

    rows
}

fn synthetic_conversation_section(ctx: &EnrichmentContext) -> ContextSection {
    let tokens = estimate_conversation_tokens(&ctx.conversation);
    let chars: usize = ctx.conversation.iter().map(|m| m.content.chars().count()).sum();
    ContextSection {
        id: ContextSectionId::Conversation,
        label: "Messages".to_string(),
        category: SectionCategory::Messages,
        tokens,
        chars,
        is_must_keep: false,
        is_truncated: false,
        is_active: true,
        body: conversation_body_summary(ctx),
    }
}

fn conversation_body_summary(ctx: &EnrichmentContext) -> String {
    let total_msgs = ctx.conversation.len();
    let last_role = ctx.conversation.last().map(|m| m.role.clone()).unwrap_or_default();
    let last_char_count = ctx
        .conversation
        .last()
        .map(|m| m.content.chars().count())
        .unwrap_or(0);
    format!(
        "{} messages · last role: {} · last content: {} chars",
        total_msgs,
        if last_role.is_empty() { "—".to_string() } else { last_role },
        last_char_count,
    )
}

fn build_section(entry: &crate::middleware::ContextSectionEntry) -> ContextSection {
    use crate::middleware::{ContextSectionId as S, SectionStatus};
    // Bucket mapping into the 6 canonical categories. The prose that
    // teaches the model how to use tools (ToolSystem, DrawingCanvas,
    // graphs, checklist, patch rules, agent roles) lives in the
    // System-prompt bucket — the *tool definitions* themselves are
    // priced separately as synthetic System-tools / MCP-tools rows.
    // Skills catalog is its own bucket; recall + summaries are
    // Meta-context; the live conversation is Messages.
    let (label, category, is_must_keep) = match entry.id {
        S::SafetyPreamble => (
            "Safety preamble".to_string(),
            SectionCategory::SystemPrompt,
            true,
        ),
        S::AgentInstructions => (
            "Agent instructions".to_string(),
            SectionCategory::SystemPrompt,
            true,
        ),
        S::Time => (
            "Current time".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::UiRules => (
            "UI rendering rules".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::DrawingCanvas => (
            "Drawing canvas".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::GraphSession => (
            "Interactive graphs".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::GraphSessionState => (
            "Graph state".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::DirectBoard => (
            "Direct board tool".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::ToolSystem => (
            "Tool system".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::TodoChecklist => (
            "Task checklist rules".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::PatchRules => (
            "Code patching rules".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::AgentRoles => (
            "Available agent roles".to_string(),
            SectionCategory::SystemPrompt,
            false,
        ),
        S::SkillsCatalog => (
            "Skills catalog".to_string(),
            SectionCategory::Skills,
            false,
        ),
        S::SemanticRecall => (
            "Semantic memory recall".to_string(),
            SectionCategory::MetaContext,
            false,
        ),
        S::PreviousSummary => (
            "Previous conversation summary".to_string(),
            SectionCategory::MetaContext,
            false,
        ),
        S::CurrentSummary => (
            "Current conversation summary".to_string(),
            SectionCategory::MetaContext,
            false,
        ),
        S::Conversation => (
            "Messages".to_string(),
            SectionCategory::Messages,
            false,
        ),
    };

    let (is_truncated, is_active) = match entry.status {
        SectionStatus::Active => (false, true),
        SectionStatus::Truncated => (true, true),
        SectionStatus::BudgetExcluded => (false, false),
    };

    ContextSection {
        id: from_internal(entry.id),
        label,
        category,
        tokens: estimate_tokens(&entry.content),
        chars: entry.content.chars().count(),
        is_must_keep,
        is_truncated,
        is_active,
        body: entry.content.clone(),
    }
}

// The middleware's ContextSectionId is the source of truth. The
// breakdown serializer mirrors the same enum so consumers see one
// identifier set. The two enums live in different modules to avoid a
// cyclic dep: middleware → breakdown if the breakdown lived inside
// middleware. This map is the only place we couple them.
fn from_internal(
    id: crate::middleware::ContextSectionId,
) -> ContextSectionId {
    use crate::middleware::ContextSectionId as S;
    match id {
        S::SafetyPreamble => ContextSectionId::SafetyPreamble,
        S::AgentInstructions => ContextSectionId::AgentInstructions,
        S::Time => ContextSectionId::Time,
        S::UiRules => ContextSectionId::UiRules,
        S::DrawingCanvas => ContextSectionId::DrawingCanvas,
        S::GraphSession => ContextSectionId::GraphSession,
        S::GraphSessionState => ContextSectionId::GraphSessionState,
        S::DirectBoard => ContextSectionId::DirectBoard,
        S::ToolSystem => ContextSectionId::ToolSystem,
        S::TodoChecklist => ContextSectionId::TodoChecklist,
        S::PatchRules => ContextSectionId::PatchRules,
        S::AgentRoles => ContextSectionId::AgentRoles,
        S::SkillsCatalog => ContextSectionId::SkillsCatalog,
        S::SemanticRecall => ContextSectionId::SemanticRecall,
        S::PreviousSummary => ContextSectionId::PreviousSummary,
        S::CurrentSummary => ContextSectionId::CurrentSummary,
        S::Conversation => ContextSectionId::Conversation,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::{
        ContextSectionEntry,
        ContextSectionId as MiddlewareSectionId,
        SectionStatus,
    };
    use zen_db::models::ChatMessage;
    use crate::runner::config::RunConfig;

    fn empty_ctx() -> EnrichmentContext {
        EnrichmentContext {
            system_content: String::new(),
            conversation: Vec::new(),
            extra_system_messages: Vec::new(),
            chat_id: "test".to_string(),
            workspace_root: None,
            recall_block: None,
            authorized_tool_ids: Vec::new(),
            delegation_allowed: false,
            tools_supported: true,
            tools_enabled: true,
            iteration: 1,
            summarization_enabled: false,
            compaction_token_threshold: 50_000,
            compaction_threshold: 50,
            max_messages_in_memory: None,
            compaction_event: None,
            section_log: Vec::new(),
            run_id: 0,
        }
    }

    #[test]
    fn grand_total_sums_all_layers() {
        let mut ctx = empty_ctx();
        ctx.section_log.push(ContextSectionEntry {
            id: MiddlewareSectionId::SafetyPreamble,
            content: "abc".repeat(80), // ~60 tokens
            status: SectionStatus::Active,
        });
        ctx.section_log.push(ContextSectionEntry {
            id: MiddlewareSectionId::ToolSystem,
            content: "tool rules".repeat(40), // ~120 tokens
            status: SectionStatus::Active,
        });
        ctx.conversation.push(ChatMessage {
            role: "user".to_string(),
            content: "user message".repeat(50),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });
        let t = layer_totals(&ctx);
        assert!(t.system_prompt >= 60 + 119);
        assert!(t.conversation >= 100);
    }

    #[test]
    fn skill_and_recall_layers_are_optional() {
        let mut ctx = empty_ctx();
        ctx.section_log.push(ContextSectionEntry {
            id: MiddlewareSectionId::SkillsCatalog,
            content: "skills body".to_string(),
            status: SectionStatus::Active,
        });
        let t = layer_totals(&ctx);
        assert!(t.skills_catalog.is_some());
        assert!(t.recall.is_none());
    }

    #[test]
    fn breakdown_includes_synthetic_conversation_row() {
        let mut ctx = empty_ctx();
        ctx.conversation.push(ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        });
        let run = RunConfig::default();
        let payload = compute_context_breakdown(&ctx, &run, None, &[], None);
        assert!(payload
            .sections
            .iter()
            .any(|s| s.id == ContextSectionId::Conversation));
        assert!(payload.conversation_tokens > 0);
    }

    #[test]
    fn compaction_event_round_trips() {
        let ctx = empty_ctx();
        let run = RunConfig::default();
        let payload = compute_context_breakdown(
            &ctx,
            &run,
            Some(CompactionEvent {
                kind: CompactionKind::Aggressive,
                pre_tokens: 10_000,
                post_tokens: 5_000,
                target_tokens: 5_000,
            }),
            &[],
            None,
        );
        let json = serde_json::to_value(&payload).unwrap();
        // Field names serialise under camelCase (renamed on the
        // payload struct so the frontend and the cold-start cache
        // share a wire shape). `kind` stays kebab-case because the
        // `CompactionKind` enum carries that rename.
        assert_eq!(json["compactionEvent"]["kind"], "aggressive");
        assert_eq!(json["compactionEvent"]["postTokens"], 5_000);
        // Top-level camelCase keys too.
        assert!(json["chatId"].is_string());
        assert_eq!(json["runId"], 0);
        assert!(json.get("chat_id").is_none());
        assert!(json.get("run_id").is_none());
    }

    #[test]
    fn run_id_round_trips_from_ctx() {
        // Two payloads with the same (chat_id, iteration) but different
        // run_ids MUST be distinguishable downstream — the store
        // dedupe rule is the only thing standing between a stale
        // earlier run and a fresh later run on the same chat.
        let ctx_a = EnrichmentContext {
            run_id: 7,
            ..empty_ctx()
        };
        let ctx_b = EnrichmentContext {
            run_id: 9,
            iteration: 3,
            ..empty_ctx()
        };
        let payload_a = compute_context_breakdown(&ctx_a, &RunConfig::default(), None, &[], None);
        let payload_b = compute_context_breakdown(&ctx_b, &RunConfig::default(), None, &[], None);
        let json_a = serde_json::to_value(&payload_a).unwrap();
        let json_b = serde_json::to_value(&payload_b).unwrap();
        assert_eq!(json_a["runId"], 7);
        assert_eq!(json_b["runId"], 9);
        // Serialised under camelCase rename so the frontend
        // `ContextBreakdown.runId` lines up without an alias.
        assert!(json_a.get("run_id").is_none());
        assert!(json_b.get("run_id").is_none());
    }

    #[test]
    fn must_keep_sections_are_flagged() {
        let mut ctx = empty_ctx();
        ctx.section_log.push(ContextSectionEntry {
            id: MiddlewareSectionId::SafetyPreamble,
            content: "p".to_string(),
            status: SectionStatus::Active,
        });
        let run = RunConfig::default();
        let payload = compute_context_breakdown(&ctx, &run, None, &[], None);
        let preamble = payload
            .sections
            .iter()
            .find(|s| s.id == ContextSectionId::SafetyPreamble)
            .unwrap();
        assert!(preamble.is_must_keep);
    }
}
