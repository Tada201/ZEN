//! THINK + parallel sub-agent dispatch: query generation and the
//! bounded-concurrency sub-agent fan-out.

use std::collections::HashSet;
use std::sync::Arc;

use futures::future::join_all;
use serde_json::json;
use tokio::sync::Semaphore;
use tracing::{error, info};

use super::super::engine::IterativeDeepResearcher;
use super::super::types::{is_low_quality, Finding};

// ── THINK: Generate queries ────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(in super::super) async fn generate_queries(
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

        let scope_context = self.scope_context();
        let prompt = format!(
            r#"You are a research assistant planning web searches.

**Original question:** {question}

**Locked research scope:** {scope_context}

**Research plan:**
{plan_str}

**What we know so far:**
{report_str}

**Round:** {round_num}

Generate {num_queries} focused search queries that will help answer the question.
{round_instruction}

Return ONLY a JSON array of query strings, nothing else.
Example: ["query one", "query two", "query three"]"#,
        );

        let response = match self.call_llm(&prompt, 0.5, 4096, 60).await {
            Ok(text) => text,
            Err(e) => {
                error!("Query generation failed: {}", e);
                return Vec::new();
            }
        };

        let mut parsed = Self::parse_json_array(&response);
        let new_queries: Vec<String> = parsed
            .drain(..)
            .filter(|q| !self.queries_used.contains(q))
            .collect();
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
    pub(in super::super) fn parse_sub_questions(&self) -> Vec<String> {
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

        let scope_context = self.scope_context();
        let prompt = format!(
            r#"You are one of several parallel research agents investigating a question.

**Original question:** {question}

**Locked research scope:** {scope_context}

**Your assigned sub-question:** {sub_question_hint}

**What we know so far:**
{report_str}

Generate exactly ONE focused search query that will help answer your assigned sub-question. Make it specific and targeted — avoid generic queries.

Return ONLY the query string, nothing else."#,
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
    pub(in super::super) async fn dispatch_sub_agents(
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
                "Round {round_num}: Dispatching {count} parallel sub-agents..."
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
                    .get(i)
                    .map(|_sq| format!("Agent {}", i + 1))
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
            self_ref.ctx.events.emit(
                "chat:research-step",
                &json!({
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

        for (i, agent_name) in agent_names.iter().enumerate().take(count) {
            agent_start_times.push(std::time::Instant::now());
            let sem = semaphore.clone();
            let question = question.to_string();
            let sub_q = sub_questions.get(i).cloned().unwrap_or_default();
            let agent_name = agent_name.clone();

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
                    let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("");
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
                    self_ref.ctx.events.emit(
                        "chat:research-step",
                        &json!({
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
                            let extraction =
                                self_ref.extract_from_page(&truncated, &question).await;

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
                                            summary: summary.chars().take(500).collect(),
                                            evidence: if evidence.is_empty() {
                                                truncated.chars().take(max_content_half).collect()
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

                            // Emit agent-indexed completion/error status
                            let status_str = if finding.is_some() {
                                "completed"
                            } else {
                                "error"
                            };
                            let display = if title.is_empty() { &url } else { &title };
                            self_ref.ctx.events.emit(
                                "chat:research-step",
                                &json!({
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
                            self_ref.ctx.events.emit(
                                "chat:research-step",
                                &json!({
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
        let agent_had_findings: Vec<bool> =
            all_results.iter().map(|batch| !batch.is_empty()).collect();

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
            let had_findings = agent_had_findings.get(i).copied().unwrap_or(false);

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

            self_ref.ctx.events.emit(
                "chat:research-step",
                &json!({
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
            info!(
                "Sub-agent {} {} in {}s",
                i,
                if had_findings { "completed" } else { "failed" },
                elapsed
            );
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
