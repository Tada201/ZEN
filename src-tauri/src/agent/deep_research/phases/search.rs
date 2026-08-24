//! SEARCH + EXTRACT: web search, page fetch, and per-page extraction.

use std::sync::Arc;

use futures::future::join_all;
use serde_json::json;
use tokio::sync::Semaphore;
use tracing::{error, info};

use super::super::engine::IterativeDeepResearcher;
use super::super::extractor::EXTRACTOR_PROMPT;
use super::super::types::{is_low_quality, Finding};

// ── SEARCH + EXTRACT ───────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    pub(in super::super) async fn search(&self, query: &str) -> Vec<serde_json::Value> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-search-{}", uuid::Uuid::new_v4()),
            name: "web_search".to_string(),
            arguments: json!({"query": query, "max_results": 10}),
        };

        // Race the tool call against the cancellation token so the user's
        // stop action immediately interrupts in-progress searches.
        let result = tokio::select! {
            result = self.ctx.tool_service.execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            ) => result,
            _ = self.token.cancelled() => {
                info!("Deep research cancelled, aborting search for '{}'", query);
                return Vec::new();
            }
        };

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

    pub(in super::super) async fn fetch_page(&self, url: &str) -> Option<String> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-fetch-{}", uuid::Uuid::new_v4()),
            name: "web_fetch".to_string(),
            arguments: json!({"url": url}),
        };

        // Race the tool call against the cancellation token so the user's
        // stop action immediately interrupts in-progress fetches.
        let result = tokio::select! {
            result = self.ctx.tool_service.execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            ) => result,
            _ = self.token.cancelled() => {
                info!("Deep research cancelled, aborting URL fetch for {}", url);
                return None;
            }
        };

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
    pub(in super::super) async fn search_and_extract(
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
        for ((url, title), display_text) in urls_to_fetch.into_iter().zip(url_display) {
            let sem = semaphore.clone();
            futures.push(async move {
                let _permit = sem.acquire().await.expect("Semaphore closed");

                let content = self_ref.fetch_page(&url).await;

                match content {
                    Some(text) => {
                        // Truncate before extraction to limit LLM cost
                        let truncated = if text.len() > max_content_chars {
                            let mut t = text[..max_content_chars].to_string();
                            if let Some(last_para) = t[..(max_content_chars * 8 / 10)].rfind("\n\n")
                            {
                                t.truncate(last_para);
                            }
                            t
                        } else {
                            text
                        };

                        // Use LLM to extract structured info from the page
                        let extraction = self_ref.extract_from_page(&truncated, question).await;

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

        let findings: Vec<Finding> = join_all(futures).await.into_iter().flatten().collect();

        findings
    }

    /// Use LLM to extract relevant information from a page's content.
    pub(super) async fn extract_from_page(
        &self,
        content: &str,
        goal: &str,
    ) -> Option<(String, String, String)> {
        let prompt = EXTRACTOR_PROMPT
            .replace("{goal}", goal)
            .replace("{scope}", &self.scope_context())
            .replace("{webpage_content}", content);

        match self.call_llm(&prompt, 0.2, 2048, 90).await {
            Ok(response) => {
                match Self::parse_json_object(&response) {
                    Some(obj) => {
                        let evidence = obj
                            .get("evidence")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let summary = obj
                            .get("summary")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
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
