//! SYNTHESIZE, DECIDE, and FINAL REPORT phases.

use tracing::{error, info};

use super::super::engine::IterativeDeepResearcher;
use super::super::types::{Finding, ResearchCategory};

// ── SYNTHESIZE ─────────────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(in super::super) async fn synthesize(
        &self,
        question: &str,
        all_findings: &[Finding],
        current_report: &str,
    ) -> String {
        // Window to last N findings to avoid context explosion
        let window_start = if all_findings.len() > self.synthesis_window {
            all_findings.len() - self.synthesis_window
        } else {
            0
        };
        let window = &all_findings[window_start..];
        info!(
            "Synthesis using last {} of {} findings",
            window.len(),
            all_findings.len()
        );

        let findings_text = window
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let content = if f.summary.is_empty() {
                    let max_len = f.evidence.len().min(1000);
                    &f.evidence[..max_len]
                } else {
                    &f.summary
                };
                format!(
                    "**Finding {}** — [{}]({})\n{}",
                    i + 1,
                    f.title,
                    f.url,
                    content
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        // Auto-analyze numeric findings with the calculator tool
        let calculator_analysis = self.analyze_numeric_findings().await;

        let report_hint = if current_report.is_empty() {
            "(First round — no report yet.)"
        } else {
            current_report
        };

        let scope_context = self.scope_context();
        let prompt = format!(
            r#"You are updating an evolving research report.

**Original question:** {question}

**Locked research scope:** {scope_context}

Discard findings that do not satisfy the locked scope. Never blend similarly named entities, old events, or unrelated dates into the report.

**Current report:**
{report_hint}

**New findings from this round:**
{findings_text}
{calculator_analysis}

Integrate the new findings into the existing report. Produce an updated, well-organized report that answers the original question as completely as possible given all evidence so far. Remove redundancy, resolve contradictions, and maintain logical flow. Keep source URLs as inline citations where relevant.

Include specific data-driven analysis with relevant statistics (means, medians, trends, percentages) to support conclusions. Numerical data has been pre-analyzed and the results are shown above — incorporate these into the report.

Write only the updated report — no preamble or meta-commentary."#,
            question = question,
            scope_context = scope_context,
            report_hint = report_hint,
            findings_text = findings_text,
            calculator_analysis = calculator_analysis,
        );

        match self
            .call_llm(&prompt, 0.3, self.max_report_tokens as usize, 60)
            .await
        {
            Ok(text) => text,
            Err(e) => {
                error!("Synthesis failed: {}", e);
                current_report.to_string()
            }
        }
    }
}

// ── DECIDE ─────────────────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(in super::super) async fn should_stop(&self, question: &str, report: &str, round_num: usize) -> bool {
        let prompt = format!(
            r#"You are deciding whether a research report is comprehensive enough.

**Original question:** {question}

**Current report:**
{report}

**Rounds completed:** {round_num}

Based on the report so far, do we have enough information to answer the question comprehensively? Consider:
- Are the key aspects of the question addressed?
- Are there obvious gaps or unanswered sub-questions?
- Is the evidence sufficient and from multiple sources?

Reply with ONLY "YES" or "NO" followed by a brief one-sentence reason.
Example: "YES — The report covers all major aspects with evidence from multiple sources."
Example: "NO — We still lack information about the economic impact.""#,
            question = question,
            report = report,
            round_num = round_num,
        );

        match self.call_llm(&prompt, 0.1, 128, 30).await {
            Ok(text) => {
                let clean = text
                    .trim()
                    .trim_start_matches(|c: char| {
                        matches!(c, '*' | '_' | '`' | '"' | '>' | '#' | '-')
                    })
                    .to_uppercase();
                let should_stop = clean.starts_with("YES");
                info!(
                    "Stop decision (round {}): {}",
                    round_num,
                    text.lines().next().unwrap_or(&text)
                );
                should_stop
            }
            Err(e) => {
                info!("Stop decision failed (continuing): {}", e);
                false
            }
        }
    }
}

// ── FINAL REPORT ───────────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Collect unique cited sources from all findings.
    /// Returns a list of (url, title) pairs, deduplicated by URL.
    pub(in super::super) fn collect_cited_sources(&self) -> Vec<(String, String)> {
        let mut seen = std::collections::HashSet::new();
        let mut sources: Vec<(String, String)> = Vec::new();
        for finding in &self.findings {
            if seen.insert(finding.url.clone()) {
                sources.push((finding.url.clone(), finding.title.clone()));
            }
        }
        sources
    }

    /// Build a formatted ## References section from cited sources.
    pub(in super::super) fn format_references(sources: &[(String, String)]) -> String {
        if sources.is_empty() {
            return String::new();
        }
        let mut refs = "\n\n## References\n\n".to_string();
        for (i, (url, title)) in sources.iter().enumerate() {
            let display_title = if title.is_empty() || title == url {
                url.clone()
            } else {
                format!("[{}]({})", title, url)
            };
            refs.push_str(&format!("{}. {}\n", i + 1, display_title));
        }
        refs
    }

    fn final_report_prompt(
        question: &str,
        report: &str,
        scope_context: &str,
        category: Option<&ResearchCategory>,
        sources: &[(String, String)],
    ) -> String {
        // Build a numbered source index for inline citation references
        let source_index: String = if sources.is_empty() {
            String::new()
        } else {
            let mut idx = String::new();
            for (i, (url, title)) in sources.iter().enumerate() {
                let label = if title.is_empty() || title == url {
                    url.clone()
                } else {
                    title.clone()
                };
                idx.push_str(&format!("  [{}] {}\n", i + 1, label));
            }
            idx
        };

        let base_prompt = format!(
            r#"Write a **long, detailed, comprehensive** research report answering this question:

**Question:** {question}

**Locked research scope:** {scope_context}

Do not introduce claims about entities, event editions, or dates outside this scope.

**All collected evidence and analysis:**
{report}

**Source index (cite as [N] in your text):**
{source_index}

Requirements:
- Write at MINIMUM 1000 words — this should be a thorough, article-quality report
- Use clear ## headings and ### subheadings to organize into logical sections
- Each section should have multiple detailed paragraphs, not just bullet points
- Synthesize and analyze the information — explain WHY things matter, draw comparisons, provide context
- Include specific data points, numbers, and statistics from the evidence
- **Cite sources inline** using **[N]** markers (e.g., "According to a 2024 study [1], temperatures...") — every factual claim should have a citation
- Note where sources agree and where they disagree
- Add a brief executive summary at the top
- End with a clear conclusion that directly answers the question
- Write in an engaging, informative style — not dry or robotic
- **Do NOT** include a ## References section — one will be added automatically

Include concrete numbers and data-driven analysis in the report to support conclusions. Where numerical data was found in the sources, pre-computed statistics are included above — reference these figures in your analysis."#,
            question = question,
            scope_context = scope_context,
            report = report,
            source_index = source_index,
        );

        // Append category-specific format override if applicable
        if let Some(cat) = category {
            let override_str = cat.prompt_override();
            if !override_str.is_empty() {
                return format!("{}\n\n{}", base_prompt, override_str);
            }
        }

        base_prompt
    }

    pub(in super::super) async fn final_report(&self, question: &str, report: &str) -> String {
        let sources = self.collect_cited_sources();
        let scope_context = self.scope_context();
        let prompt = Self::final_report_prompt(question, report, &scope_context, self.category.as_ref(), &sources);

        let mut result = match self
            .call_llm(&prompt, 0.3, self.max_report_tokens as usize, 180)
            .await
        {
            Ok(text) => text,
            Err(e) => {
                error!("Final report generation failed: {}", e);
                return format!("{}\n{}", report, Self::format_references(&sources));
            }
        };

        // Expand if too short
        let word_count = result.split_whitespace().count();
        if word_count < 300 {
            info!(
                "Final report too short ({} words), requesting expansion",
                word_count
            );
            let expand_prompt = format!(
                r#"This report is too brief. Please expand it significantly:

- Add detailed paragraphs for each section (not just bullet points)
- Include specific data, numbers, and comparisons from the evidence
- Explain context and significance — don't just list facts
- Use ## headings and ### subheadings
- Use [N] citations from the provided source index
- Target at least 1000 words

Original report:
{result}

Write the full expanded report now."#,
                result = result
            );
            if let Ok(expanded) = self
                .call_llm(&expand_prompt, 0.4, self.max_report_tokens as usize, 180)
                .await
            {
                if expanded.split_whitespace().count() > word_count {
                    result = expanded;
                }
            }
        }

        // Strip any ## References section the LLM may have generated despite our instructions
        let cleaned = if let Some(pos) = result.rfind("\n## References\n") {
            result[..pos].trim().to_string()
        } else if let Some(pos) = result.rfind("## References\n") {
            result[..pos].trim().to_string()
        } else {
            result.trim().to_string()
        };

        // Append structured ## References section
        let references = Self::format_references(&sources);
        format!("{}\n{}", cleaned, references)
    }
}
