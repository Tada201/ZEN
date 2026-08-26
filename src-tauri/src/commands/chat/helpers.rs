//! Shared helpers + types used by the other chat submodules.

pub const TITLE_MAX_CHARS: usize = 50;
pub const DEFAULT_TITLE_PROMPT: &str = "Generate a concise, descriptive title (5 words or fewer, under 50 characters) for a chat session based on the user's first message. Output ONLY the title text — no quotes, punctuation, or explanation.";

/// Persist a synchronous `send_message` failure as an assistant message so
/// the UI shows the error in chat history instead of nothing.
pub(crate) async fn persist_sync_send_failure(
    db: &sqlx::SqlitePool,
    chat_id: &str,
    model: Option<&str>,
    error: &str,
) {
    let metadata = serde_json::json!({
        "error": error,
        "status": "failed",
        "recoverable": false,
    })
    .to_string();
    let _ = zen_db::queries::add_message(
        db,
        &zen_db::queries::NewMessage {
            chat_id,
            role: "assistant",
            content: error,
            model,
            is_complete: false,
            metadata: Some(&metadata),
            ..Default::default()
        },
    )
    .await;
}

/// Strip quotes, leading/trailing whitespace, and collapse internal whitespace.
/// Drops trailing punctuation until we hit 50 chars.
pub fn sanitize_title(raw: &str) -> String {
    let trimmed = raw
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == '`' || c == '“' || c == '”' || c == '‘' || c == '’');
    let cleaned = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out: String = cleaned.chars().take(TITLE_MAX_CHARS).collect();
    while out.ends_with(['.', ',', ';', ':', '!', '?']) {
        out.pop();
    }
    out
}

#[derive(Debug, serde::Deserialize)]
pub struct ThinkingConfig {
    pub enabled: bool,
    pub effort: Option<String>,
    pub budget_tokens: Option<i64>,
}

/// Heuristic: does the user message suggest a tool is needed?
/// Used by `send_message` to seed `authorized_tool_ids`.
pub(crate) fn has_tool_intent(content: &str) -> bool {
    let lower_content = content.to_lowercase();
    let tool_keywords = [
        "run command",
        "run tests",
        "execute",
        "terminal",
        "shell",
        "read file",
        "open file",
        "read document",
        "open document",
        "uploaded file",
        "uploaded document",
        "local file",
        "knowledge base",
        "write file",
        "edit file",
        "list files",
        "search files",
        "grep",
        "ripgrep",
        "cargo",
        "npm",
        "pnpm",
        "yarn",
        "pytest",
        "todo",
        "check the repo",
        "inspect the code",
        "modify",
        "implement",
        "fix the bug",
        "draw",
        "paint",
        "create image",
        "generate image",
        "illustration",
        "artwork",
        "picture",
        "render image",
        "sketch",
    ];

    tool_keywords
        .iter()
        .any(|keyword| lower_content.contains(keyword))
}

pub(crate) fn default_tool_intent_ids() -> Vec<String> {
    [
        "write_todos",
        "read_document_content",
        "list_documents",
        "grep_documents",
        "write_file",
        "edit_file",
        "run_command",
        "generate_image",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

pub(crate) fn default_yolo_tool_ids() -> Vec<String> {
    [
        "web_search",
        "web_fetch",
        "list_documents",
        "read_document_content",
        "grep_documents",
        "write_file",
        "edit_file",
        "run_command",
        "write_todos",
        "get_system_metrics",
        "spawn_agent",
        "generate_image",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

/// Heuristic: does the user explicitly ask for multi-agent orchestration?
pub(crate) fn should_use_orchestrator(content: &str) -> bool {
    let lower_content = content.to_lowercase();
    let explicit_orchestration_keywords = [
        "multi-agent",
        "multi agent",
        "orchestrate",
        "delegate",
        "sub-agent",
        "subagent",
        "spawn agents",
        "parallel agents",
    ];
    explicit_orchestration_keywords
        .iter()
        .any(|keyword| lower_content.contains(keyword))
}

// ── Deep Research triage ────────────────────────────────────────────────────

/// System prompt for the deep-research triage classifier. Kept as a const so
/// the classification behaviour is reviewable in one place and the parser test
/// can assert against the contract it establishes.
pub const DEEP_RESEARCH_TRIAGE_PROMPT: &str = "You are a routing classifier for a deep-research system. The user has deep-research mode enabled, but not every message needs a multi-round, multi-source web investigation.\n\nClassify the user's message into exactly one word:\n- RESEARCH: needs current events, multiple sources, comparisons, investigation, market/landscape analysis, or anything a single direct answer cannot responsibly cover.\n- DIRECT: greetings, acknowledgments (\"thanks\"), simple follow-ups answerable from the existing conversation, single-fact lookups, formatting/rewrite/summarize requests, or casual chat.\n\nOutput ONLY the single word RESEARCH or DIRECT. No punctuation, no explanation.";

/// Parse the triage classifier's raw completion into a boolean verdict.
///
/// Returns `Some(true)` for a clear RESEARCH verdict, `Some(false)` for a clear
/// DIRECT verdict, and `None` when the response is ambiguous or unparseable —
/// callers treat `None` as fail-open (run research) so an explicit user toggle
/// is never silently swallowed on a parser miss.
pub fn parse_triage_verdict(raw: &str) -> Option<bool> {
    let lower = raw.trim().to_lowercase();
    let has_research = lower.contains("research");
    let has_direct = lower.contains("direct");
    match (has_research, has_direct) {
        (true, false) => Some(true),
        (false, true) => Some(false),
        // Empty, both, or neither → ambiguous.
        _ => None,
    }
}

/// Decide whether a deep-research-toggled message actually warrants a full
/// research run. Makes one cheap, low-token classification call.
///
/// Fail-open: any provider error, timeout, or ambiguous verdict returns `true`
/// so the user's explicit toggle still triggers research on genuine requests.
/// Only a clear DIRECT verdict downgrades the message to the normal runner.
pub(crate) async fn deep_research_warranted(
    provider: &dyn zen_llm::LlmProvider,
    model: &str,
    content: &str,
) -> bool {
    use zen_db::models::ChatMessage;

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: DEEP_RESEARCH_TRIAGE_PROMPT.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage {
            role: "user".to_string(),
            content: content.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let config = zen_llm::ChatRequestConfig {
        temperature: Some(0.0),
        max_tokens: Some(4),
        ..Default::default()
    };

    let result = provider
        .chat_stream(
            model,
            messages,
            None,
            config,
            Box::new(|_| {}),
            tokio_util::sync::CancellationToken::new(),
        )
        .await;

    match result {
        Ok(response) => match parse_triage_verdict(&response.content) {
            Some(verdict) => verdict,
            None => {
                tracing::warn!(
                    raw = %response.content,
                    "Deep research triage returned ambiguous verdict; failing open to research"
                );
                true
            }
        },
        Err(e) => {
            tracing::warn!(
                error = %e,
                "Deep research triage call failed; failing open to research"
            );
            true
        }
    }
}

/// Marker export so `Serialize` stays pulled even when no current caller
/// uses `serialize_with` on this type. Keeps the import alive.
#[allow(unused_imports)]
use serde::Serializer;

#[cfg(test)]
mod triage_tests {
    use super::parse_triage_verdict;

    #[test]
    fn clear_research_verdict() {
        assert_eq!(parse_triage_verdict("RESEARCH"), Some(true));
        assert_eq!(parse_triage_verdict("  research\n"), Some(true));
        assert_eq!(parse_triage_verdict("Research."), Some(true));
    }

    #[test]
    fn clear_direct_verdict() {
        assert_eq!(parse_triage_verdict("DIRECT"), Some(false));
        assert_eq!(parse_triage_verdict(" direct "), Some(false));
        assert_eq!(parse_triage_verdict("Direct!"), Some(false));
    }

    #[test]
    fn ambiguous_verdicts_fail_open_to_none() {
        // Empty / whitespace.
        assert_eq!(parse_triage_verdict(""), None);
        assert_eq!(parse_triage_verdict("   "), None);
        // Neither keyword.
        assert_eq!(parse_triage_verdict("maybe"), None);
        // Both keywords present — model hedged.
        assert_eq!(parse_triage_verdict("RESEARCH or DIRECT"), None);
    }
}
