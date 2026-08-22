// src/agent/deep_research/extractor.rs
//
// Goal-based content extraction prompt, separated into its own module to
// match the Odysseus project's goal_based_extractor.py pattern.
// The constant is imported by phases.rs for per-page structured extraction.

/// Structured extraction prompt used per page fetch.
///
/// The LLM extracts relevant information from a page's content given a
/// research goal. Placeholders `{goal}` and `{webpage_content}` are
/// substituted at runtime.
pub(super) const EXTRACTOR_PROMPT: &str = r#"Extract information relevant to the following goal from the provided web page content.

**Goal:** {goal}

**Locked research scope:** {scope}

**Web page content:**
{webpage_content}

Extract the key information from this page that helps answer the goal. Focus on:
- Facts, data points, statistics, and specific claims
- Expert opinions, research findings, or authoritative statements
- Practical information (pricing, dates, locations, features, specifications)
- Contrasting perspectives or contradictions

Return a JSON object with these keys:
- "rational": One sentence explaining why this content is relevant to the goal
- "evidence": The key evidence, quotes, and data from the page (2-5 paragraphs)
- "summary": A concise 1-3 sentence summary of what this source says about the goal

If the page content does not satisfy the locked scope, including a similarly named entity, wrong event edition, or wrong time period, return:
{{"rational": "This page is not relevant to the research goal.", "evidence": "", "summary": "This page does not contain relevant information."}}
"#;

#[cfg(test)]
mod tests {
    use super::EXTRACTOR_PROMPT;

    #[test]
    fn prompt_contains_goal_placeholder() {
        assert!(EXTRACTOR_PROMPT.contains("{goal}"));
    }

    #[test]
    fn prompt_contains_webpage_content_placeholder() {
        assert!(EXTRACTOR_PROMPT.contains("{webpage_content}"));
    }

    #[test]
    fn prompt_requests_json_output() {
        assert!(EXTRACTOR_PROMPT.contains("rational"));
        assert!(EXTRACTOR_PROMPT.contains("evidence"));
        assert!(EXTRACTOR_PROMPT.contains("summary"));
    }

    #[test]
    fn prompt_has_fallback_for_irrelevant_pages() {
        assert!(EXTRACTOR_PROMPT.contains("not relevant"));
    }

    #[test]
    fn prompt_mentions_relevant_focus_areas() {
        assert!(EXTRACTOR_PROMPT.contains("Facts"));
        assert!(EXTRACTOR_PROMPT.contains("Expert opinions"));
        assert!(EXTRACTOR_PROMPT.contains("Contrasting perspectives"));
    }

    #[test]
    fn prompt_is_not_empty() {
        assert!(!EXTRACTOR_PROMPT.is_empty());
        assert!(EXTRACTOR_PROMPT.len() > 200);
    }

    #[test]
    fn prompt_is_well_formed_utf8() {
        // Verify the prompt is valid UTF-8 (should always be true for &str)
        let bytes = EXTRACTOR_PROMPT.as_bytes();
        assert!(std::str::from_utf8(bytes).is_ok());
    }

    #[test]
    fn prompt_substitution_works_with_replace() {
        let substituted = EXTRACTOR_PROMPT
            .replace("{goal}", "test goal")
            .replace("{webpage_content}", "test content");
        assert!(!substituted.contains("{goal}"));
        assert!(!substituted.contains("{webpage_content}"));
        assert!(substituted.contains("test goal"));
        assert!(substituted.contains("test content"));
    }
}
