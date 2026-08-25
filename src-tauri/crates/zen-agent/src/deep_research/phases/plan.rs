//! PLAN phases: scope assessment, plan creation, category
//! classification, findings compression, and plan revision.

use serde_json::json;
use tracing::info;

use super::super::engine::IterativeDeepResearcher;
use super::super::types::{ResearchCategory, ResearchScopeAssessment};

// ── PLAN: Research strategy ────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Resolve ambiguity before any search call. The model may ask at most
    /// three questions; malformed responses default to a safe, scoped brief
    /// rather than blocking the user behind a parser failure.
    pub(in super::super) async fn assess_scope(&self, question: &str) -> ResearchScopeAssessment {
        let current_date = chrono::Utc::now().format("%Y-%m-%d UTC").to_string();
        let fallback = json!({
            "original_question": question,
            "current_date": current_date,
            "objective": question,
            "time_scope": "Use the time period explicitly stated by the user; otherwise do not claim recency.",
            "required_entities": [],
            "excluded_entities": [],
        });
        let prompt = format!(
            r#"You are the scope gate for a deep-research system.

Current date: {current_date}
User request: {question}

Extract a precise research brief before any web searches. Preserve named entities, event editions, locations, dates, and user exclusions exactly. Do not substitute similarly named events, people, organizations, or historical editions.

Ask clarification ONLY when a missing detail would materially change the research target, such as an ambiguous named entity, an unspecified event edition, an unclear time period for a "latest" request, or multiple reasonable interpretations. Do not ask for clarification for a broad but valid request.

Return ONLY JSON:
{{
  "needs_clarification": false,
  "clarification_questions": [],
  "brief": {{
    "original_question": "verbatim user request",
    "objective": "one concise research objective",
    "current_date": "{current_date}",
    "time_scope": "explicit date/freshness requirement or unknown",
    "required_entities": ["exact entities, event edition, geography"],
    "excluded_entities": ["near matches that must not be used"],
    "success_criteria": "what a correct answer must establish"
  }}
}}

When clarification is required, include 1-3 concise questions and set needs_clarification to true."#,
        );
        let Ok(response) = self.call_llm(&prompt, 0.0, 700, 30).await else {
            return ResearchScopeAssessment { brief: fallback, clarification_questions: Vec::new() };
        };
        let Some(parsed) = Self::parse_json_object(&response) else {
            return ResearchScopeAssessment { brief: fallback, clarification_questions: Vec::new() };
        };
        let questions = parsed
            .get("clarification_questions")
            .and_then(|value| value.as_array())
            .map(|items| items.iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|item| item.len() >= 4)
                .take(3)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>())
            .unwrap_or_default();
        let needs_clarification = parsed
            .get("needs_clarification")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        ResearchScopeAssessment {
            brief: parsed.get("brief").cloned().unwrap_or(fallback),
            clarification_questions: if needs_clarification { questions } else { Vec::new() },
        }
    }

    pub(in super::super) async fn create_plan(&self, question: &str) -> String {
        let scope_context = self.scope_context();
        let prompt = format!(
            r#"You are a research strategist. Before searching, analyze this question and create a research plan.

**Question:** {question}

**Locked research scope:** {scope_context}

Every sub-question must preserve this scope. Do not broaden it to similarly named entities or dates.

Break this question down:
1. What are the key sub-topics that need to be covered for a comprehensive answer?
2. What specific data points, facts, or perspectives should we look for?
3. What would a complete, high-quality answer include?

Return a JSON object with these keys:
- "sub_questions": Array of 3-6 specific sub-questions to investigate
- "key_topics": Array of key topics/angles to cover
- "success_criteria": One sentence describing what a complete answer looks like

Example:
{{
  "sub_questions": ["What is the cost of living in X?", "How is the healthcare system?"],
  "key_topics": ["economy", "healthcare", "safety", "culture"],
  "success_criteria": "A balanced comparison covering cost, quality of life, and practical considerations."
}}"#,
        );

        let response = self.call_llm(&prompt, 0.3, 1024, 30).await;
        match response {
            Ok(text) => {
                let cleaned = Self::strip_code_block(&text);
                if cleaned.contains("sub_questions") || cleaned.contains("key_topics") {
                    cleaned
                } else {
                    text
                }
            }
            Err(e) => {
                info!("Research planning failed (non-fatal): {}", e);
                String::new()
            }
        }
    }

    /// Fast LLM call to classify the research question into a category.
    pub(in super::super) async fn classify_category(&self, question: &str) -> Option<ResearchCategory> {
        let prompt = format!(
            r#"Classify this research question into exactly ONE category.

Categories: product, comparison, howto, factcheck, landscape

- "product" — asking about best products, tools, software, gear, items to buy, recommendations
- "comparison" — comparing two or more specific options (X vs Y, alternatives, differences)
- "howto" — how to do something, step-by-step guidance, tutorials, procedures
- "factcheck" — verifying claims, is X true, debunking, evidence for/against
- "landscape" — general research, overview, analysis, background, everything else

Question: {question}

Respond with ONLY the category name, nothing else."#
        );

        let result = self.call_llm(&prompt, 0.0, 20, 15).await;
        match result.as_deref() {
            Ok(cat) => {
                let cat = cat.trim().to_lowercase();
                // Handle "product" or " product " or "\"product\"" etc.
                let first = cat.trim_matches(|c: char| {
                    c == '"' || c == '\'' || c == '`' || c == '*' || c == '_'
                });
                match first {
                    "product" => Some(ResearchCategory::Product),
                    "comparison" => Some(ResearchCategory::Comparison),
                    "howto" => Some(ResearchCategory::HowTo),
                    "factcheck" | "fact" | "fact-check" => Some(ResearchCategory::FactCheck),                      "landscape" | "general" => Some(ResearchCategory::Landscape),
                      _ => Some(ResearchCategory::Landscape),

                }
            }
            Err(e) => {
                info!(
                    "Category classification failed (proceeding with landscape): {}",
                    e
                );
                None
            }
        }
    }
}

// ── COMPRESSION: Condense findings log to prevent context bloat ───────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Condense the evolving report into a concise summary that preserves
    /// key findings, data points, and conclusions while removing redundancy.
    /// The compressed version is used by query generation and plan revision
    /// to keep context manageable in long research sessions.
    pub(in super::super) async fn compress_report(&mut self, question: &str, round_num: usize) {
        let prompt = format!(
            r#"Condense the following research report into a concise ~300-word summary.

**Original question:** {question}

**Current report:**
{report}

Requirements:
• Preserve ALL key findings, data points, statistics, and conclusions
• Keep important source citations
• Note any contradictory evidence or disagreements
• Remove redundancy, verbose explanations, and transitional text
• Write only the condensed report — no preamble

Condensed report:"#,
            question = question,
            report = self.evolving_report,
        );

        let result = match self.call_llm(&prompt, 0.3, 1024, 60).await {
            Ok(text) => text,
            Err(e) => {
                info!("Report compression failed after round {}: {}", round_num, e);
                return;
            }
        };

        self.compressed_report = result;
        info!(
            "Report compressed after round {} ({} chars → {} chars)",
            round_num,
            self.evolving_report.len(),
            self.compressed_report.len(),
        );
    }
}

// ── PLAN REVISION: Re-evaluate strategy based on findings ──────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Re-evaluate the research plan after a round of findings. If the initial
    /// assumptions were wrong or new directions have emerged, update the plan.
    /// Returns the (possibly updated) plan text, or the original if no changes.
    /// Uses the compressed report if available to keep context manageable.
    pub(in super::super) async fn revise_plan(&mut self, question: &str, round_num: usize) -> String {
        let scope_context = self.scope_context();
        let plan_str = if self.research_plan.is_empty() {
            "(No plan — search broadly.)"
        } else {
            &self.research_plan
        };
        // Use compressed report if available to keep context manageable
        let report_str: &str = if !self.compressed_report.is_empty() {
            &self.compressed_report
        } else if !self.evolving_report.is_empty() {
            &self.evolving_report
        } else {
            "(No findings yet.)"
        };

        let prompt = format!(
            r#"You are a research strategist reviewing progress on an ongoing investigation.

**Original question:** {question}

**Locked research scope:** {scope_context}

**Current research plan:**
{plan_str}

**Findings so far (after round {round_num}):**
{report_str}

Review whether the current research plan is still on track. Consider:
1. Were the initial sub-questions and topics the right ones?
2. Are there new angles or sub-questions that have emerged from the findings?
3. Are any initial assumptions now outdated or contradicted?
4. Should any sub-questions be dropped because they're less important than expected?

If the plan needs revision, output an updated JSON object with the same keys:
- "sub_questions": Array of current sub-questions (adjusted if needed)
- "key_topics": Array of key topics/angles (adjusted if needed)
- "success_criteria": Updated one-sentence success criterion

If the plan is still on track and needs no changes, output: {{"status": "unchanged"}}

Do NOT make gratuitous changes — only revise the plan if there's a clear reason based on the findings. If the findings align with the existing plan, return unchanged.

Respond with ONLY the JSON object, nothing else."#,
        );

        let response = match self.call_llm(&prompt, 0.3, 1024, 30).await {
            Ok(text) => text,
            Err(e) => {
                info!("Plan revision failed (keeping existing plan): {}", e);
                return self.research_plan.clone();
            }
        };

        let cleaned = Self::strip_code_block(&response);

        // Parse the response as JSON for robust validation
        match serde_json::from_str::<serde_json::Value>(&cleaned) {
            Ok(parsed) => {
                // LLM says no changes needed
                if parsed.get("status").and_then(|s| s.as_str()) == Some("unchanged") {
                    info!("Plan revision: no changes needed after round {}", round_num);
                    return self.research_plan.clone();
                }

                // Validate that the JSON has at least one of the expected plan fields
                // as a non-empty array
                let has_valid_questions = parsed
                    .get("sub_questions")
                    .and_then(|v| v.as_array())
                    .is_some_and(|a| !a.is_empty());
                let has_valid_topics = parsed
                    .get("key_topics")
                    .and_then(|v| v.as_array())
                    .is_some_and(|a| !a.is_empty());

                if has_valid_questions || has_valid_topics {
                    info!("Plan revision: plan updated after round {}", round_num);
                    self.emit_phase(
                        "planning",
                        &format!(
                            "Round {round_num}: Research plan revised based on new findings"
                        ),
                        "completed",
                    );
                    cleaned
                } else {
                    info!("Plan revision: response missing required fields, keeping existing plan");
                    self.research_plan.clone()
                }
            }
            Err(e) => {
                info!(
                    "Plan revision: failed to parse JSON ({}), keeping existing plan",
                    e
                );
                self.research_plan.clone()
            }
        }
    }
}
