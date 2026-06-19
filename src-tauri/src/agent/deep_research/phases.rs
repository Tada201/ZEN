use std::collections::HashSet;
use std::sync::Arc;

use futures::future::join_all;
use serde_json::json;
use tauri::Emitter;
use tokio::sync::Semaphore;
use tracing::{error, info};

use super::engine::IterativeDeepResearcher;
use super::extractor::EXTRACTOR_PROMPT;
use super::types::{is_low_quality, Finding, ResearchCategory};

// ── PLAN: Research strategy ────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(super) async fn create_plan(&self, question: &str) -> String {
        let prompt = format!(
            r#"You are a research strategist. Before searching, analyze this question and create a research plan.

**Question:** {question}

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
            question = question
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
    pub(super) async fn classify_category(&self, question: &str) -> Option<ResearchCategory> {
        let prompt = format!(
            r#"Classify this research question into exactly ONE category.

Categories: product, comparison, howto, factcheck, landscape

- "product" — asking about best products, tools, software, gear, items to buy, recommendations
- "comparison" — comparing two or more specific options (X vs Y, alternatives, differences)
- "howto" — how to do something, step-by-step guidance, tutorials, procedures
- "factcheck" — verifying claims, is X true, debunking, evidence for/against
- "landscape" — general research, overview, analysis, background, everything else

Question: {question}

Respond with ONLY the category name, nothing else."#,
            question = question
        );

        let result = self.call_llm(&prompt, 0.0, 20, 15).await;
        match result.as_deref() {
            Ok(cat) => {
                let cat = cat.trim().to_lowercase();
                // Handle "product" or " product " or "\"product\"" etc.
                let first = cat.trim_matches(|c: char| c == '"' || c == '\'' || c == '`' || c == '*' || c == '_');
                match first {
                    "product" => Some(ResearchCategory::Product),
                    "comparison" => Some(ResearchCategory::Comparison),
                    "howto" => Some(ResearchCategory::HowTo),
                    "factcheck" | "fact" | "fact-check" => Some(ResearchCategory::FactCheck),
                    "landscape" | "general" | _ => Some(ResearchCategory::Landscape),
                }
            }
            Err(e) => {
                info!("Category classification failed (proceeding with landscape): {}", e);
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
    pub(super) async fn compress_report(&mut self, question: &str, round_num: usize) {
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
    pub(super) async fn revise_plan(
        &mut self,
        question: &str,
        round_num: usize,
    ) -> String {
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
            question = question,
            plan_str = plan_str,
            round_num = round_num,
            report_str = report_str,
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
                    .map_or(false, |a| !a.is_empty());
                let has_valid_topics = parsed
                    .get("key_topics")
                    .and_then(|v| v.as_array())
                    .map_or(false, |a| !a.is_empty());

                if has_valid_questions || has_valid_topics {
                    info!("Plan revision: plan updated after round {}", round_num);
                    self.emit_phase(
                        "planning",
                        &format!("Round {}: Research plan revised based on new findings", round_num),
                        "completed",
                    );
                    cleaned
                } else {
                    info!(
                        "Plan revision: response missing required fields, keeping existing plan"
                    );
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

// ── THINK: Generate queries ────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(super) async fn generate_queries(
        &mut self,
        question: &str,
        round_num: usize,
    ) -> Vec<String> {
        let (num_queries, round_instruction) = if round_num == 1 {
            (4, "This is the first round — generate broad, diverse queries that explore the key facets of the question.")
        } else {
            (3, "We already have partial findings. Generate targeted follow-up queries to fill gaps, verify claims, or explore specific aspects that the report doesn't yet cover well.")
        };

        let plan_str = if self.research_plan.is_empty() {
            "(No plan — search broadly.)"
        } else {
            &self.research_plan
        };
        // Use compressed report if available to keep context manageable;
        // otherwise fall back to the full evolving report.
        let report_str: &str = if !self.compressed_report.is_empty() {
            &self.compressed_report
        } else if !self.evolving_report.is_empty() {
            &self.evolving_report
        } else {
            "(No findings yet.)"
        };

        let prompt = format!(
            r#"You are a research assistant planning web searches.

**Original question:** {question}

**Research plan:**
{plan_str}

**What we know so far:**
{report_str}

**Round:** {round_num}

Generate {num_queries} focused search queries that will help answer the question.
{round_instruction}

Return ONLY a JSON array of query strings, nothing else.
Example: ["query one", "query two", "query three"]"#,
            question = question,
            plan_str = plan_str,
            report_str = report_str,
            round_num = round_num,
            num_queries = num_queries,
            round_instruction = round_instruction,
        );

        let response = match self.call_llm(&prompt, 0.5, 4096, 60).await {
            Ok(text) => text,
            Err(e) => {
                error!("Query generation failed: {}", e);
                return Vec::new();
            }
        };

        let mut parsed = Self::parse_json_array(&response);
        let new_queries: Vec<String> =
            parsed.drain(..).filter(|q| !self.queries_used.contains(q)).collect();
        for q in &new_queries {
            self.queries_used.insert(q.clone());
        }

        info!(
            "Round {} generated {} new queries: {:?}",
            round_num,
            new_queries.len(),
            &new_queries
        );
        new_queries
    }
}

// ── PARALLEL SUB-AGENT DISPATCH ────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Parse sub-questions from the research plan JSON (created by `create_plan`).
    /// Returns an empty vec if the plan has no sub_questions field or parsing fails.
    pub(super) fn parse_sub_questions(&self) -> Vec<String> {
        let cleaned = Self::strip_code_block(&self.research_plan);
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cleaned) {
            if let Some(sqs) = parsed.get("sub_questions").and_then(|v| v.as_array()) {
                let result: Vec<String> = sqs
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                if !result.is_empty() {
                    return result;
                }
            }
        }
        Vec::new()
    }

    /// Generate a single focused search query for a sub-agent.
    /// Each sub-agent gets a different sub-question (or slot number) so their
    /// queries naturally cover different angles in parallel.
    async fn generate_single_query(
        &self,
        question: &str,
        sub_question: &str,
        slot: usize,
        _round_num: usize,
    ) -> String {
        let report_str: &str = if !self.compressed_report.is_empty() {
            &self.compressed_report
        } else if !self.evolving_report.is_empty() {
            &self.evolving_report
        } else {
            "(No findings yet.)"
        };

        // Construct a focused prompt: each sub-agent owns one sub-question
        // so they naturally cover diverse angles without explicit coordination.
        let sub_question_hint = if sub_question.is_empty() {
            format!("aspect/angle #{}", slot + 1)
        } else {
            sub_question.to_string()
        };

        let prompt = format!(
            r#"You are one of several parallel research agents investigating a question.

**Original question:** {question}

**Your assigned sub-question:** {sub_question_hint}

**What we know so far:**
{report_str}

Generate exactly ONE focused search query that will help answer your assigned sub-question. Make it specific and targeted — avoid generic queries.

Return ONLY the query string, nothing else."#,
            question = question,
            sub_question_hint = sub_question_hint,
            report_str = report_str,
        );

        match self.call_llm(&prompt, 0.5, 256, 30).await {
            Ok(text) => {
                // Strip quotes and whitespace
                let query = text
                    .trim()
                    .trim_matches(|c: char| c == '"' || c == '\'' || c == '`')
                    .to_string();
                if query.len() < 3 {
                    String::new()
                } else {
                    query
                }
            }
            Err(e) => {
                info!("Sub-agent {} query generation failed: {}", slot, e);
                // Fallback: use sub-question as the query itself
                if !sub_question.is_empty() && sub_question.len() > 5 {
                    sub_question.to_string()
                } else {
                    String::new()
                }
            }
        }
    }

    /// Dispatch N parallel sub-agents, each independently generating a query,
    /// searching, fetching, and extracting for its assigned sub-question.
    ///
    /// All sub-agents run concurrently via `join_all` on async blocks. The
    /// total wall time is roughly the time of the *slowest* sub-agent instead
    /// of the *sum* of all query-generation → search → extract steps.
    ///
    /// Returns deduplicated findings from all sub-agents.
    pub(super) async fn dispatch_sub_agents(
        &mut self,
        question: &str,
        round_num: usize,
    ) -> Vec<Finding> {
        // Parse sub-questions from the plan for diverse coverage
        let sub_questions = self.parse_sub_questions();
        let count = std::cmp::min(self.sub_agent_count, std::cmp::max(1, sub_questions.len()));

        self.emit_phase(
            "searching",
            &format!(
                "Round {}: Dispatching {} parallel sub-agents...",
                round_num, count
            ),
            "running",
        );

        let semaphore = Arc::new(Semaphore::new(self.extraction_concurrency));
        let max_content_chars = self.max_content_chars;
        let max_content_half = self.max_content_chars / 2;
        let self_ref: &Self = self;

        // Build agent names from sub-questions (or slot numbers)
        let agent_names: Vec<String> = (0..count)
            .map(|i| {
                sub_questions
                    .get(i).map(|_sq| format!("Agent {}", i + 1))
                            .unwrap_or_else(|| format!("Agent {}", i + 1))
            })
            .collect();

        // Emit agent-spawn events so the frontend knows about each one
        for (i, name) in agent_names.iter().enumerate() {
            let sq_display = sub_questions
                .get(i)
                .map(|sq| sq.chars().take(60).collect::<String>())
                .unwrap_or_default();
            // Extract clean sub-question (without "Agent N: " prefix) for badge display
            let clean_sub_q = sub_questions.get(i).map(|sq| sq.as_str()).unwrap_or("");
            let _ = self_ref.app.emit(
                "chat:research-step",
                json!({
                    "chat_id": self_ref.chat_id,
                    "message_id": self_ref.message_id,
                    "text": format!("{}: {}", name, sq_display),
                    "status": "running",
                    "phase": "agent_spawn",
                    "agent_index": i,
                    "agent_name": name,
                    "sub_question": clean_sub_q,
                }),
            );
            // Accumulate for DB persistence
            let _ = self_ref.research_steps_events.lock().map(|mut steps| {
                steps.push(serde_json::json!({
                    "text": format!("{}: {}", name, sq_display),
                    "status": "running",
                    "phase": "agent_spawn",
                    "agentIndex": i,
                    "agentName": name,
                    "subQuestion": clean_sub_q,
                }));
            });
        }

        // Track start times for each agent so we can emit duration
        // in the completion event.
        let mut agent_start_times: Vec<std::time::Instant> = Vec::with_capacity(count);
        let mut futures = Vec::with_capacity(count);

        for i in 0..count {
            agent_start_times.push(std::time::Instant::now());
            let sem = semaphore.clone();
            let question = question.to_string();
            let sub_q = sub_questions.get(i).cloned().unwrap_or_default();
            let agent_name = agent_names[i].clone();

            futures.push(async move {
                // ── 1. Generate focused query for this sub-question ────────
                let query = self_ref
                    .generate_single_query(&question, &sub_q, i, round_num)
                    .await;

                if query.is_empty() {
                    info!("Sub-agent {}: no query generated, skipping", i);
                    return Vec::new();
                }

                // ── 2. Search ─────────────────────────────────────────────
                let results = self_ref.search(&query).await;
                if results.is_empty() {
                    info!("Sub-agent {}: no search results for '{}'", i, query);
                    return Vec::new();
                }

                // ── 3. Fetch + extract top results ───────────────────────
                // Collect unique URLs from results
                let mut urls: Vec<(String, String)> = Vec::new();
                for item in &results {
                    let url = item.get("url").and_then(|u| u.as_str()).unwrap_or("");
                    let title = item
                        .get("title")
                        .and_then(|t| t.as_str())
                        .unwrap_or("");
                    if !url.is_empty() && urls.len() < 2 {
                        urls.push((url.to_string(), title.to_string()));
                    }
                }

                if urls.is_empty() {
                    return Vec::new();
                }

                // Emit agent-indexed per-URL progress events directly via app.emit
                for (url, title) in &urls {
                    let display = if title.is_empty() {
                        url.clone()
                    } else {
                        title.chars().take(80).collect()
                    };
                    // Use direct app.emit instead of emit_phase so we can
                    // attach agent_index and agent_name for the frontend
                    // split-panel rendering.
                    let _ = self_ref.app.emit(
                        "chat:research-step",
                        json!({
                            "chat_id": self_ref.chat_id,
                            "message_id": self_ref.message_id,
                            "text": display,
                            "status": "running",
                            "phase": "reading",
                            "agent_index": i,
                            "agent_name": agent_name,
                        }),
                    );
                    // Accumulate for DB persistence
                    let _ = self_ref.research_steps_events.lock().map(|mut steps| {
                        steps.push(serde_json::json!({
                            "text": display,
                            "status": "running",
                            "phase": "reading",
                            "agentIndex": i,
                            "agentName": agent_name,
                        }));
                    });
                }

                let mut findings = Vec::with_capacity(urls.len());
                for (url, title) in urls {
                    let _permit = match sem.acquire().await {
                        Ok(p) => p,
                        Err(_) => break,
                    };

                    let content = self_ref.fetch_page(&url).await;
                    let finding = match content {
                        Some(text) => {
                            // Truncate before extraction
                            let truncated = if text.len() > max_content_chars {
                                let mut t = text[..max_content_chars].to_string();
                                if let Some(last_para) =
                                    t[..(max_content_chars * 8 / 10)].rfind("\n\n")
                                {
                                    t.truncate(last_para);
                                }
                                t
                            } else {
                                text
                            };

                            // Use LLM to extract structured info
                            let extraction = self_ref
                                .extract_from_page(&truncated, &question)
                                .await;

                            let finding = match extraction {
                            Some((_, evidence, summary)) => {
                                // ── QUALITY FILTER ────────────────
                                    if is_low_quality(&summary) {
                                        None
                                    } else {
                                        Some(Finding {
                                            url: url.clone(),
                                            title: if title.is_empty() {
                                                url.clone()
                                            } else {
                                                title.clone()
                                            },
                                            summary: summary
                                                .chars()
                                                .take(500)
                                                .collect(),
                                            evidence: if evidence.is_empty() {
                                                truncated
                                                    .chars()
                                                    .take(max_content_half)
                                                    .collect()
                                            } else {
                                                evidence
                                            },
                                        })
                                    }
                                }
                                None => {
                                    // Fall back to raw content
                                    Some(Finding {
                                        url: url.clone(),
                                        title: if title.is_empty() {
                                            url.clone()
                                        } else {
                                            title.clone()
                                        },
                                        summary: truncated
                                            .chars()
                                            .take(500)
                                            .collect(),
                                        evidence: truncated,
                                    })
                                }
                            };

                            // Emit agent-indexed completion/error status
                            let status_str = if finding.is_some() { "completed" } else { "error" };
                            let display = if title.is_empty() { &url } else { &title };
                            let _ = self_ref.app.emit(
                                "chat:research-step",
                                json!({
                                    "chat_id": self_ref.chat_id,
                                    "message_id": self_ref.message_id,
                                    "text": display,
                                    "status": status_str,
                                    "phase": "reading",
                                    "agent_index": i,
                                    "agent_name": agent_name,
                                }),
                            );
                            // Accumulate for DB persistence
                            let _ = self_ref.research_steps_events.lock().map(|mut steps| {
                                steps.push(serde_json::json!({
                                    "text": display,
                                    "status": status_str,
                                    "phase": "reading",
                                    "agentIndex": i,
                                    "agentName": agent_name,
                                }));
                            });

                            finding
                        }
                        None => {
                            let display = if title.is_empty() { &url } else { &title };
                            let _ = self_ref.app.emit(
                                "chat:research-step",
                                json!({
                                    "chat_id": self_ref.chat_id,
                                    "message_id": self_ref.message_id,
                                    "text": display,
                                    "status": "error",
                                    "phase": "reading",
                                    "agent_index": i,
                                    "agent_name": agent_name,
                                }),
                            );
                            // Accumulate for DB persistence
                            let _ = self_ref.research_steps_events.lock().map(|mut steps| {
                                steps.push(serde_json::json!({
                                    "text": display,
                                    "status": "error",
                                    "phase": "reading",
                                    "agentIndex": i,
                                    "agentName": agent_name,
                                }));
                            });
                            None
                        }
                    };

                    if let Some(f) = finding {
                        findings.push(f);
                    }
                }

                info!(
                    "Sub-agent {} ('{}'): {} findings",
                    i,
                    sub_q.chars().take(60).collect::<String>(),
                    findings.len()
                );
                findings
            });
        }

        // ── Wait for all sub-agents and flatten ───────────────────────────
        let all_results: Vec<Vec<Finding>> = join_all(futures).await;

        // Check which agents produced findings BEFORE consuming all_results
        let agent_had_findings: Vec<bool> = all_results.iter().map(|batch| !batch.is_empty()).collect();

        let mut all_findings: Vec<Finding> = Vec::new();
        let mut seen_urls: HashSet<String> = HashSet::new();
        for batch in all_results {
            for finding in batch {
                // Deduplicate by URL across all sub-agents
                if seen_urls.insert(finding.url.clone()) {
                    all_findings.push(finding);
                }
            }
        }

        // ── Emit agent-complete/agent-error events with duration ──────
        // Must happen BEFORE mutating self.urls_fetched to avoid borrow
        // conflict with self_ref (used by app.emit).
        for (i, _) in agent_names.iter().enumerate() {
            let elapsed = agent_start_times[i].elapsed().as_secs();
            let had_findings = agent_had_findings
                .get(i)
                .copied()
                .unwrap_or(false);

            let (phase, status, format_text) = if had_findings {
                ("agent_complete", "completed", "Completed")
            } else {
                ("agent_error", "error", "Failed")
            };

            let evt_text = format!(
                "{} — {} in {}m {}s",
                agent_names[i],
                format_text,
                elapsed / 60,
                elapsed % 60
            );

            let _ = self_ref.app.emit(
                "chat:research-step",
                json!({
                    "chat_id": self_ref.chat_id,
                    "message_id": self_ref.message_id,
                    "text": evt_text,
                    "status": status,
                    "phase": phase,
                    "agent_index": i,
                    "agent_name": agent_names[i],
                    "duration_secs": elapsed,
                }),
            );
            // Accumulate for DB persistence
            let _ = self_ref.research_steps_events.lock().map(|mut steps| {
                steps.push(serde_json::json!({
                    "text": evt_text,
                    "status": status,
                    "phase": phase,
                    "agentIndex": i,
                    "agentName": agent_names[i],
                    "durationSecs": elapsed,
                }));
            });
            info!("Sub-agent {} {} in {}s", i, if had_findings { "completed" } else { "failed" }, elapsed);
        }

        // Track fetched URLs for cross-round dedup (after self_ref is no
        // longer used, so NLL can drop the immutable borrow).
        for finding in &all_findings {
            self.urls_fetched.insert(finding.url.clone());
        }

        info!(
            "Sub-agents: {} total deduplicated findings from {} parallel agents",
            all_findings.len(),
            count
        );
        all_findings
    }
}

// ── SEARCH + EXTRACT ───────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(super) async fn search(&self, query: &str) -> Vec<serde_json::Value> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-search-{}", uuid::Uuid::new_v4()),
            name: "web_search".to_string(),
            arguments: json!({"query": query, "max_results": 10}),
        };

        let result = self
            .state
            .tool_service
            .execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            )
            .await;

        match result {
            Ok(content) => content
                .get("results")
                .and_then(|r| r.as_array())
                .cloned()
                .unwrap_or_default(),
            Err(e) => {
                error!("Web search failed for '{}': {}", query, e);
                Vec::new()
            }
        }
    }

    pub(super) async fn fetch_page(&self, url: &str) -> Option<String> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-fetch-{}", uuid::Uuid::new_v4()),
            name: "web_fetch".to_string(),
            arguments: json!({"url": url}),
        };

        let result = self
            .state
            .tool_service
            .execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            )
            .await;

        match result {
            Ok(content) => content
                .get("content")
                .and_then(|c| c.as_str())
                .map(|s| s.to_string()),
            Err(e) => {
                error!("Failed to fetch URL {}: {}", url, e);
                None
            }
        }
    }

    /// Search all queries in parallel, then fetch and extract pages
    /// concurrently with structured LLM extraction. Filters low-quality findings.
    /// Emits individual per-URL progress events for the frontend research timeline.
    pub(super) async fn search_and_extract(
        &mut self,
        queries: &[String],
        question: &str,
    ) -> Vec<Finding> {
        // ── PARALLEL SEARCH ────────────────────────────────────────────────
        // Search all queries concurrently instead of sequentially
        let search_futures: Vec<_> = queries
            .iter()
            .map(|q| async {
                let results = self.search(q).await;
                (q.clone(), results)
            })
            .collect();

        let search_results = join_all(search_futures).await;

        // Collect unique URLs from all search results
        let mut urls_to_fetch: Vec<(String, String)> = Vec::new();
        for (_query, results) in &search_results {
            for item in results {
                let url = item.get("url").and_then(|u| u.as_str()).unwrap_or("");
                let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("");
                if !url.is_empty()
                    && !self.urls_fetched.contains(url)
                    && urls_to_fetch.len() < self.max_urls_per_round * queries.len()
                {
                    urls_to_fetch.push((url.to_string(), title.to_string()));
                    self.urls_fetched.insert(url.to_string());
                }
            }
        }

        if urls_to_fetch.is_empty() {
            return Vec::new();
        }

        // ── PER-URL PROGRESS EVENTS ────────────────────────────────────────
        // Emit individual "reading" events for each source so the frontend
        // research timeline shows per-URL progress instead of a batch count.
        let url_display: Vec<String> = urls_to_fetch
            .iter()
            .map(|(url, title)| {
                let display = if title.is_empty() {
                    url.clone()
                } else {
                    // Show title, clipped to 80 chars for readability
                    let clipped: String = title.chars().take(80).collect();
                    clipped
                };
                self.emit_phase("reading", &display, "running");
                display
            })
            .collect();

        // ── CONCURRENT FETCH + EXTRACTION WITH BACKPRESSURE ────────────────
        // Local model servers often serialize requests behind one GPU; flooding
        // them makes every request slower. The semaphore limits concurrent
        // fetches + LLM extractions to `extraction_concurrency` at a time.
        let semaphore = Arc::new(Semaphore::new(self.extraction_concurrency));
        let max_content_chars = self.max_content_chars;
        let max_content_half = self.max_content_chars / 2;
        let question: &str = question;

        // Explicitly borrow self as &Self so the ref (Copy) is captured
        // by each async move block instead of the &mut self pointer.
        let self_ref: &Self = self;

        // Zip urls with their display texts so each future can emit completion
        let mut futures = Vec::with_capacity(urls_to_fetch.len());

        // Build each future in a for loop that moves owned url/title/display_text
        // into the async block while keeping self_ref and semaphore as &-borrows
        // (cloned outside the async move to avoid moving the shared Arc/Self).
        for ((url, title), display_text) in
            urls_to_fetch.into_iter().zip(url_display.into_iter())
        {
            let sem = semaphore.clone();
            futures.push(async move {
                let _permit = sem.acquire().await.expect("Semaphore closed");

                let content = self_ref.fetch_page(&url).await;

                match content {
                    Some(text) => {
                        // Truncate before extraction to limit LLM cost
                        let truncated = if text.len() > max_content_chars {
                            let mut t = text[..max_content_chars].to_string();
                            if let Some(last_para) =
                                t[..(max_content_chars * 8 / 10)].rfind("\n\n")
                            {
                                t.truncate(last_para);
                            }
                            t
                        } else {
                            text
                        };

                        // Use LLM to extract structured info from the page
                        let extraction =
                            self_ref.extract_from_page(&truncated, question).await;

                        let finding = match extraction {
                            Some((_, evidence, summary)) => {
                                // ── QUALITY FILTER ─────────────────────────
                                if is_low_quality(&summary) {
                                    info!("Filtering low-quality finding from: {}", url);
                                    None
                                } else {
                                    Some(Finding {
                                        url: url.clone(),
                                        title: if title.is_empty() {
                                            url.clone()
                                        } else {
                                            title.clone()
                                        },
                                        summary: summary.chars().take(500).collect(),
                                        evidence: if evidence.is_empty() {
                                            truncated
                                                .chars()
                                                .take(max_content_half)
                                                .collect()
                                        } else {
                                            evidence
                                        },
                                    })
                                }
                            }
                            None => {
                                // Fall back to raw content
                                Some(Finding {
                                    url: url.clone(),
                                    title: if title.is_empty() {
                                        url.clone()
                                    } else {
                                        title.clone()
                                    },
                                    summary: truncated.chars().take(500).collect(),
                                    evidence: truncated,
                                })
                            }
                        };

                        // Emit completion for this individual URL
                        self_ref.emit_phase("reading", &display_text, "completed");

                        finding
                    }
                    None => {
                        // Fetch failed — emit error for this URL
                        self_ref.emit_phase("reading", &display_text, "error");
                        None
                    }
                }
            });
        }

        let findings: Vec<Finding> = join_all(futures)
            .await
            .into_iter()
            .flatten()
            .collect();

        findings
    }

    /// Use LLM to extract relevant information from a page's content.
    async fn extract_from_page(
        &self,
        content: &str,
        goal: &str,
    ) -> Option<(String, String, String)> {
        let prompt = EXTRACTOR_PROMPT
            .replace("{goal}", goal)
            .replace("{webpage_content}", content);

        match self.call_llm(&prompt, 0.2, 2048, 90).await {
            Ok(response) => {
                match Self::parse_json_object(&response) {
                    Some(obj) => {
                        let evidence = obj.get("evidence").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let summary = obj.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        Some((String::new(), evidence, summary))
                    }
                    None => {
                        // Use raw response as evidence
                        let summary = response.chars().take(500).collect();
                        Some(("LLM extraction (raw)".to_string(), response, summary))
                    }
                }
            }
            Err(e) => {
                info!("Page extraction failed (falling back to raw): {}", e);
                None
            }
        }
    }
}

// ── CALCULATOR: Quantitative analysis helper ──────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Run the calculator tool with a math expression and return the result.
    pub(super) async fn calculate(&self, expression: &str) -> Option<serde_json::Value> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-calc-{}", uuid::Uuid::new_v4()),
            name: "calculator".to_string(),
            arguments: json!({"expression": expression}),
        };

        let result = self
            .state
            .tool_service
            .execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            )
            .await;

        match result {
            Ok(content) => Some(content),
            Err(e) => {
                info!("Calculator call failed for '{}': {}", expression, e);
                None
            }
        }
    }

    /// Extract numeric values from findings and compute descriptive statistics.
    /// Returns a formatted string with calculator results, or empty string if
    /// no numeric data is found.
    pub(super) async fn analyze_numeric_findings(&self) -> String {
        // Collect all numeric values from finding summaries and evidence
        let mut numbers: Vec<f64> = Vec::new();
        for finding in &self.findings {
            // Extract numbers from summary and evidence text
            for text in [&finding.summary, &finding.evidence] {
                // Find all numbers (integers and decimals) in the text
                let mut pos = 0;
                let chars: Vec<char> = text.chars().collect();
                while pos < chars.len() {
                    if chars[pos].is_ascii_digit() || chars[pos] == '.' {
                        let start = pos;
                        while pos < chars.len() && (chars[pos].is_ascii_digit() || chars[pos] == '.' || chars[pos] == ',') {
                            if chars[pos] == ',' {
                                pos += 1;
                                continue;
                            }
                            pos += 1;
                        }
                        let num_str: String = chars[start..pos].iter().collect();
                        if let Ok(n) = num_str.parse::<f64>() {
                            // Filter: reasonable data values (not years, small counts, or huge numbers)
                            if n > 0.01 && n < 1_000_000_000.0 && n != num_str.parse::<f64>().unwrap_or(0.0).round() {
                                numbers.push(n);
                            } else if n > 0.0 && n < 1_000_000.0 && num_str.len() >= 3 {
                                numbers.push(n);
                            }
                        }
                    } else {
                        pos += 1;
                    }
                }
            }
        }

        if numbers.len() < 3 {
            return String::new();
        }

        // Deduplicate and sort
        numbers.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        numbers.dedup();

        // Run calculator statistics on the collected numbers
        let num_strs: Vec<String> = numbers.iter().map(|n| n.to_string()).collect();
        let expr = format!("mean({})", num_strs.join(","));

        let mean_result = self.calculate(&expr).await;
        let median_result = self.calculate(&format!("median({})", num_strs.join(","))).await;
        let stddev_result = self.calculate(&format!("stddev({})", num_strs.join(","))).await;
        let sum_result = self.calculate(&format!("sum({})", num_strs.join(","))).await;

        let mut output = String::from("\n\n**Calculator Analysis — Extracted Data Points:**\n");
        output.push_str(&format!("Data points found: {}\n", numbers.len()));
        output.push_str(&format!("Values: {} ... {}\n", numbers.first().unwrap_or(&0.0), numbers.last().unwrap_or(&0.0)));

        if let Some(val) = mean_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Mean: {:.2}\n", val));
        }
        if let Some(val) = median_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Median: {:.2}\n", val));
        }
        if let Some(val) = stddev_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Std Dev: {:.2}\n", val));
        }
        if let Some(val) = sum_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Sum: {:.2}\n", val));
        }

        output
    }
}

// ── SYNTHESIZE ─────────────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(super) async fn synthesize(
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

        let prompt = format!(
            r#"You are updating an evolving research report.

**Original question:** {question}

**Current report:**
{report_hint}

**New findings from this round:**
{findings_text}
{calculator_analysis}

Integrate the new findings into the existing report. Produce an updated, well-organized report that answers the original question as completely as possible given all evidence so far. Remove redundancy, resolve contradictions, and maintain logical flow. Keep source URLs as inline citations where relevant.

Include specific data-driven analysis with relevant statistics (means, medians, trends, percentages) to support conclusions. Numerical data has been pre-analyzed and the results are shown above — incorporate these into the report.

Write only the updated report — no preamble or meta-commentary."#,
            question = question,
            report_hint = report_hint,
            findings_text = findings_text,
            calculator_analysis = calculator_analysis,
        );

        match self.call_llm(&prompt, 0.3, self.max_report_tokens as usize, 60).await {
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
    pub(super) async fn should_stop(
        &self,
        question: &str,
        report: &str,
        round_num: usize,
    ) -> bool {
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
                    .trim_start_matches(
                        |c: char| matches!(c, '*' | '_' | '`' | '"' | '>' | '#' | '-'),
                    )
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
    pub(super) fn collect_cited_sources(&self) -> Vec<(String, String)> {
        let mut seen = std::collections::HashSet::new();
        let mut sources: Vec<(String, String)> = Vec::new();
        for finding in &self.findings {
            if seen.insert(finding.url.clone()) {
                sources.push((
                    finding.url.clone(),
                    finding.title.clone(),
                ));
            }
        }
        sources
    }

    /// Build a formatted ## References section from cited sources.
    pub(super) fn format_references(sources: &[(String, String)]) -> String {
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

    pub(super) async fn final_report(
        &self,
        question: &str,
        report: &str,
    ) -> String {
        let sources = self.collect_cited_sources();
        let prompt = Self::final_report_prompt(question, report, self.category.as_ref(), &sources);

        let mut result =
            match self.call_llm(&prompt, 0.3, self.max_report_tokens as usize, 180).await {
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
            if let Ok(expanded) =
                self.call_llm(&expand_prompt, 0.4, self.max_report_tokens as usize, 180).await
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
