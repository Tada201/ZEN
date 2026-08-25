use tokio_util::sync::CancellationToken;
use serde_json::Value;

use zen_llm::{ChatRequestConfig, LlmProvider};

// ── Constants ──────────────────────────────────────────────────────────────

pub(super) const DEFAULT_MIN_ROUNDS: usize = 2;
pub(super) const DEFAULT_MAX_TIME_SECS: u64 = 300;
pub(super) const DEFAULT_MAX_CONTENT_CHARS: usize = 15_000;
pub(super) const DEFAULT_MAX_REPORT_TOKENS: i64 = 8_192;
pub(super) const DEFAULT_MAX_EMPTY_ROUNDS: usize = 2;
pub(super) const DEFAULT_SYNTHESIS_WINDOW: usize = 10;
pub(super) const DEFAULT_EXTRACTION_CONCURRENCY: usize = 3;
pub(super) const DEFAULT_COMPRESSION_INTERVAL: usize = 4;

// ── Public API ─────────────────────────────────────────────────────────────

pub struct DeepResearchParams<'a> {
    /// Phase 11: the context is threaded directly; the former host
    /// handle only existed to fetch it via `state()`.
    pub ctx: crate::context::AgentContext,
    pub db: sqlx::SqlitePool,
    pub llm_provider: &'a dyn LlmProvider,
    pub chat_id: String,
    pub model: String,
    pub query: String,
    pub config: ChatRequestConfig,
    pub token: CancellationToken,
    pub max_rounds: usize,
    pub max_urls_per_round: usize,
    pub sub_agent_count: usize,
    /// The selected model's real context window (`max_context_length`),
    /// when known. Surfaced in the context breakdown so the UI gauge
    /// reflects the true model budget rather than the compaction cap.
    pub model_context_window: Option<usize>,
}

/// Scope resolved before the research worker is allowed to search. The brief
/// is carried through every research prompt so similarly named entities and
/// stale dates do not silently broaden the investigation.
#[derive(Debug, Clone)]
pub(super) struct ResearchScopeAssessment {
    pub brief: Value,
    pub clarification_questions: Vec<String>,
}

// ── Research category ──────────────────────────────────────────────────────

/// Auto-detected research category that determines the final report format.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum ResearchCategory {
    /// Ranked product list with pros/cons, compare table, verdict
    Product,
    /// Comparison matrix with per-option deep dives
    Comparison,
    /// Numbered how-to guide with prerequisites and common mistakes
    HowTo,
    /// Fact-check report with evidence for/against
    FactCheck,
    /// Landscape / general research (default)
    Landscape,
}

impl ResearchCategory {
    pub(super) fn as_str(&self) -> &'static str {
        match self {
            ResearchCategory::Product => "product",
            ResearchCategory::Comparison => "comparison",
            ResearchCategory::HowTo => "howto",
            ResearchCategory::FactCheck => "factcheck",
            ResearchCategory::Landscape => "landscape",
        }
    }

    /// Empty if general landscape, otherwise pipes through the category
    /// format-override string to append to the final report prompt.
    /// Return a human-friendly display name (e.g. "How-to", "Fact Check").
    pub(super) fn display_name(&self) -> &'static str {
        match self {
            ResearchCategory::Product => "Product",
            ResearchCategory::Comparison => "Comparison",
            ResearchCategory::HowTo => "How-to",
            ResearchCategory::FactCheck => "Fact Check",
            ResearchCategory::Landscape => "Landscape",
        }
    }

    pub(super) fn prompt_override(&self) -> &'static str {
        match self {
            ResearchCategory::Product => PRODUCT_OVERRIDE,
            ResearchCategory::Comparison => COMPARISON_OVERRIDE,
            ResearchCategory::HowTo => HOWTO_OVERRIDE,
            ResearchCategory::FactCheck => FACTCHECK_OVERRIDE,
            ResearchCategory::Landscape => "",
        }
    }
}

pub(super) const PRODUCT_OVERRIDE: &str = r#"IMPORTANT FORMAT OVERRIDE — this is a PRODUCT research report:
- Start with a quick-compare markdown table of top picks (columns: Name, Price, Best For, Rating)
- Structure as a RANKED LIST of products/options (best first), with each product as:
  - ### heading with product name
  - Approximate price
  - 2-3 sentence summary
  - **Pros:** bullet list and **Cons:** bullet list
  - **Where to buy:** URLs as links
- End with a ## Verdict section picking Best Overall and Best Value
- Include source citations inline"#;

pub(super) const COMPARISON_OVERRIDE: &str = r#"IMPORTANT FORMAT OVERRIDE — this is a COMPARISON report:
- Create a ## Comparison Table as a markdown table comparing ALL options across key criteria (rows = criteria, columns = options)
- Use checkmarks (✓), ratings, or short values in cells
- Write a ## section per option with its strengths, weaknesses, and ideal use case
- End with ## Best For verdicts (e.g., "**Best for small teams:** Option A because...")
- Include a ## Shared Considerations section for things that apply to all options
- Include source citations inline"#;

pub(super) const HOWTO_OVERRIDE: &str = r#"IMPORTANT FORMAT OVERRIDE — this is a HOW-TO guide:
- Start with ## Quick Guide — a super concise numbered list (one line per step, no details, just the action). Example:
  1. Install X
  2. Run Y
  3. Configure Z
- Add a line after Quick Guide showing estimated completion time and difficulty level
- Then ## Prerequisites listing what's needed before starting
- Then the detailed steps using ### (h3) for each step: ### Step 1: ..., ### Step 2: ...
- Each step should have a clear heading and detailed instructions
- Use blockquotes (> ) for tips and warnings: > **Tip:** ... or > **Warning:** ...
- End with ## Common Mistakes section
- Include source citations inline"#;

pub(super) const FACTCHECK_OVERRIDE: &str = r#"IMPORTANT FORMAT OVERRIDE — this is a FACT-CHECK report:
- Start with ## The Claim restating what's being checked
- Create ## Evidence For and ## Evidence Against sections
- Each piece of evidence should be a ### with source name, what it found, and strength (Strong, Moderate, or Weak)
- Include a ## Verdict section with one of: **Supported**, **Mixed Evidence**, or **Unsupported**
- End with ## Nuance & Caveats for important context and limitations
- Be balanced and cite sources for every claim"#;

// ── Quality filtering ──────────────────────────────────────────────────────

/// Markers that indicate extracted content is boilerplate, error text, or
/// otherwise useless. If any marker is found (case-insensitive in the
/// summary), the finding is filtered out.
const LOW_QUALITY_MARKERS: &[&str] = &[
    "insufficient to",
    "content is insufficient",
    "no substantive data",
    "does not contain",
    "not relevant to",
    "no relevant information",
    "unable to extract",
    "completely unrelated",
    "boilerplate",
    "footer text",
    "cookie consent",
    "cookie banner",
    "cookie notice",
    "copyright notice",
    "copyright footer",
    "all rights reserved",
];

/// Returns true if the text indicates the source content is useless.
pub(super) fn is_low_quality(summary: &str) -> bool {
    if summary.is_empty() {
        return true;
    }
    let low = summary.to_lowercase();
    LOW_QUALITY_MARKERS
        .iter()
        .any(|marker| low.contains(marker))
}

// ── Internal data types ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(super) struct Finding {
    pub url: String,
    pub title: String,
    pub summary: String,
    pub evidence: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_low_quality ────────────────────────────────────────────────────

    #[test]
    fn empty_summary_is_low_quality() {
        assert!(is_low_quality(""));
    }

    #[test]
    fn boilerplate_cookie_notice_is_filtered() {
        assert!(is_low_quality(
            "This site uses cookie consent to improve your experience"
        ));
    }

    #[test]
    fn boilerplate_copyright_is_filtered() {
        assert!(is_low_quality("Copyright notice: all rights reserved."));
    }

    #[test]
    fn irrelevant_content_is_filtered() {
        assert!(is_low_quality(
            "The content is insufficient to answer the research question."
        ));
        assert!(is_low_quality(
            "This page does not contain relevant information."
        ));
        assert!(is_low_quality(
            "No substantive data was found on this topic."
        ));
    }

    #[test]
    fn useful_summary_passes_filter() {
        assert!(!is_low_quality(
            "According to the study, temperatures rose 1.5°C over the last century."
        ));
    }

    #[test]
    fn case_insensitive_filtering() {
        // Marker is lowercase but input has mixed case
        assert!(is_low_quality("Cookie Consent Notice"));
        assert!(is_low_quality("ALL RIGHTS RESERVED"));
    }

    #[test]
    fn partial_word_match_does_not_false_positive() {
        // "cookie" is a marker but shouldn't match unrelated words
        assert!(!is_low_quality(
            "A delicious cookie recipe with chocolate chips."
        ));
    }

    // ── ResearchCategory ──────────────────────────────────────────────────

    #[test]
    fn category_as_str_lowercase() {
        assert_eq!(ResearchCategory::Product.as_str(), "product");
        assert_eq!(ResearchCategory::Comparison.as_str(), "comparison");
        assert_eq!(ResearchCategory::HowTo.as_str(), "howto");
        assert_eq!(ResearchCategory::FactCheck.as_str(), "factcheck");
        assert_eq!(ResearchCategory::Landscape.as_str(), "landscape");
    }

    #[test]
    fn category_display_name_human_friendly() {
        assert_eq!(ResearchCategory::Product.display_name(), "Product");
        assert_eq!(ResearchCategory::Comparison.display_name(), "Comparison");
        assert_eq!(ResearchCategory::HowTo.display_name(), "How-to");
        assert_eq!(ResearchCategory::FactCheck.display_name(), "Fact Check");
        assert_eq!(ResearchCategory::Landscape.display_name(), "Landscape");
    }

    #[test]
    fn landscape_has_no_prompt_override() {
        assert!(ResearchCategory::Landscape.prompt_override().is_empty());
    }

    #[test]
    fn product_has_prompt_override() {
        let override_str = ResearchCategory::Product.prompt_override();
        assert!(!override_str.is_empty());
        assert!(override_str.contains("PRODUCT"));
        assert!(override_str.contains("###"));
        assert!(override_str.contains("## Verdict"));
    }

    #[test]
    fn comparison_has_prompt_override() {
        let override_str = ResearchCategory::Comparison.prompt_override();
        assert!(!override_str.is_empty());
        assert!(override_str.contains("COMPARISON"));
        assert!(override_str.contains("## Comparison Table"));
    }

    #[test]
    fn howto_has_prompt_override() {
        let override_str = ResearchCategory::HowTo.prompt_override();
        assert!(!override_str.is_empty());
        assert!(override_str.contains("HOW-TO"));
        assert!(override_str.contains("### Step"));
    }

    #[test]
    fn factcheck_has_prompt_override() {
        let override_str = ResearchCategory::FactCheck.prompt_override();
        assert!(!override_str.is_empty());
        assert!(override_str.contains("FACT-CHECK"));
        assert!(override_str.contains("Strong, Moderate, or Weak"));
    }

    #[test]
    fn all_overrides_contain_citation_instruction() {
        let overrides = [
            ResearchCategory::Product.prompt_override(),
            ResearchCategory::Comparison.prompt_override(),
            ResearchCategory::HowTo.prompt_override(),
            ResearchCategory::FactCheck.prompt_override(),
        ];
        for (i, ov) in overrides.iter().enumerate() {
            assert!(
                ov.contains("citations inline") || ov.contains("cite sources"),
                "Override {} missing citation instruction",
                i
            );
        }
    }

    #[test]
    fn category_enum_is_debug_and_clone() {
        let cat = ResearchCategory::HowTo;
        let _cloned = cat.clone();
        let _debug = format!("{:?}", cat);
    }

    // ── Finding ───────────────────────────────────────────────────────────

    #[test]
    fn finding_construction() {
        let finding = Finding {
            url: "https://example.com".to_string(),
            title: "Example".to_string(),
            summary: "A test finding.".to_string(),
            evidence: "Detailed evidence here.".to_string(),
        };
        assert_eq!(finding.url, "https://example.com");
        assert_eq!(finding.title, "Example");
        assert_eq!(finding.summary, "A test finding.");
    }

    #[test]
    fn finding_is_debug_and_clone() {
        let f = Finding {
            url: String::new(),
            title: String::new(),
            summary: String::new(),
            evidence: String::new(),
        };
        let _cloned = f.clone();
        let _debug = format!("{:?}", f);
    }
}
