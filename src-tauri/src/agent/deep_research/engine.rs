use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use tracing::info;

use crate::commands::AppState;
use crate::llm::{ChatRequestConfig, LlmProvider};

use super::types::{
    Finding, ResearchCategory, DEFAULT_COMPRESSION_INTERVAL, DEFAULT_EXTRACTION_CONCURRENCY,
    DEFAULT_MAX_CONTENT_CHARS, DEFAULT_MAX_EMPTY_ROUNDS, DEFAULT_MAX_REPORT_TOKENS,
    DEFAULT_MAX_ROUNDS, DEFAULT_MAX_TIME_SECS, DEFAULT_MAX_URLS_PER_ROUND, DEFAULT_MIN_ROUNDS,
    DEFAULT_SUB_AGENT_COUNT, DEFAULT_SYNTHESIS_WINDOW,
};

// ── Research Engine ────────────────────────────────────────────────────────

pub(super) struct IterativeDeepResearcher<'a> {
    pub(super) app: &'a AppHandle,
    pub(super) llm_provider: &'a dyn LlmProvider,
    pub(super) state: &'a AppState,
    pub(super) model: &'a str,
    pub(super) config: &'a ChatRequestConfig,
    pub(super) token: &'a CancellationToken,
    pub(super) chat_id: &'a str,
    pub(super) message_id: &'a str,
    pub(super) emit_step: &'a (dyn Fn(&str, &str, &str, &str) + Sync),

    // Config
    pub(super) max_rounds: usize,
    pub(super) min_rounds: usize,
    pub(super) max_time_secs: u64,
    pub(super) max_urls_per_round: usize,
    pub(super) max_content_chars: usize,
    pub(super) max_report_tokens: i64,
    pub(super) max_empty_rounds: usize,
    pub(super) synthesis_window: usize,
    pub(super) extraction_concurrency: usize,

    // Config
    pub(super) compression_interval: usize,
    pub(super) sub_agent_count: usize,

    // Mutable state
    /// Thread-safe accumulator of research step events emitted during the
    /// session. Used for persistence — after run() completes, mod.rs
    /// serializes this vec and saves it to the message's metadata column
    /// in the DB so the state survives page refresh.
    pub(super) research_steps_events: Arc<Mutex<Vec<serde_json::Value>>>,

    pub(super) research_plan: String,
    pub(super) evolving_report: String,
    /// Compressed summary of earlier rounds used for query generation
    /// and plan revision to prevent context bloat.
    pub(super) compressed_report: String,
    pub(super) queries_used: HashSet<String>,
    pub(super) urls_fetched: HashSet<String>,
    pub(super) findings: Vec<Finding>,
    pub(super) round_count: usize,
    pub(super) start_time: std::time::Instant,
    /// Auto-detected research category for format-specific final reports
    pub(super) category: Option<ResearchCategory>,
}

impl<'a> IterativeDeepResearcher<'a> {
    /// Construct a new researcher with default configuration.
    pub(super) fn new(
        app: &'a AppHandle,
        llm_provider: &'a dyn LlmProvider,
        state: &'a AppState,
        model: &'a str,
        config: &'a ChatRequestConfig,
        token: &'a CancellationToken,
        chat_id: &'a str,
        message_id: &'a str,
        emit_step: &'a (dyn Fn(&str, &str, &str, &str) + Sync),
    ) -> Self {
        Self {
            app,
            llm_provider,
            state,
            model,
            config,
            token,
            chat_id,
            message_id,
            emit_step,
            max_rounds: DEFAULT_MAX_ROUNDS,
            min_rounds: DEFAULT_MIN_ROUNDS,
            max_time_secs: DEFAULT_MAX_TIME_SECS,
            max_urls_per_round: DEFAULT_MAX_URLS_PER_ROUND,
            max_content_chars: DEFAULT_MAX_CONTENT_CHARS,
            max_report_tokens: DEFAULT_MAX_REPORT_TOKENS,
            max_empty_rounds: DEFAULT_MAX_EMPTY_ROUNDS,
            synthesis_window: DEFAULT_SYNTHESIS_WINDOW,
            extraction_concurrency: DEFAULT_EXTRACTION_CONCURRENCY,
            compression_interval: DEFAULT_COMPRESSION_INTERVAL,
            sub_agent_count: DEFAULT_SUB_AGENT_COUNT,
            research_steps_events: Arc::new(Mutex::new(Vec::new())),
            research_plan: String::new(),
            evolving_report: String::new(),
            compressed_report: String::new(),
            queries_used: HashSet::new(),
            urls_fetched: HashSet::new(),
            findings: Vec::new(),
            round_count: 0,
            start_time: std::time::Instant::now(),
            category: None,
        }
    }

    pub(super) fn emit_phase(&self, phase: &str, text: &str, status: &str) {
        (self.emit_step)(text, status, self.message_id, phase);
        // Accumulate step for DB persistence
        let _ = self.research_steps_events.lock().map(|mut steps| {
            steps.push(serde_json::json!({
                "text": text,
                "status": status,
                "phase": phase,
            }));
        });
    }

    pub(super) fn time_exceeded(&self) -> bool {
        self.start_time.elapsed().as_secs() > self.max_time_secs
    }

    pub(super) fn cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    // ── Main loop ─────────────────────────────────────────────────────────

    pub(super) async fn run(&mut self, question: &str) -> Result<String, String> {
        // PLAN
        self.emit_phase("planning", "Creating research plan...", "running");
        let plan = self.create_plan(question).await;
        self.research_plan = plan;
        self.emit_phase("planning", "Research plan created", "completed");

        // CATEGORY DETECTION: classify question type for format-optimized report
        self.emit_phase("planning", "Classifying research category...", "running");
        self.category = self.classify_category(question).await;
        if let Some(ref cat) = self.category {
            info!("Research category detected: {}", cat.as_str());
        } else {
            info!("No specific category detected, using landscape format");
        }

        // LOOP: think → search → extract → synthesize → decide
        let mut consecutive_empty_rounds: usize = 0;

        for round_num in 1..=self.max_rounds {
            if self.cancelled() {
                return Err("Research cancelled by user.".to_string());
            }
            if self.time_exceeded() {
                info!("Time limit reached after {} rounds", round_num - 1);
                break;
            }

            info!("=== Research Round {} ===", round_num);

            // THINK + SEARCH + EXTRACT
            // Round 1 uses parallel sub-agent dispatch for 2-4x speedup.
            // Rounds 2+ use sequential query generation + parallel search/extract.
            let round_findings = if round_num == 1 {
                let findings = self.dispatch_sub_agents(question, round_num).await;
                // Track sub-agent queries for metadata
                for i in 0..self.sub_agent_count {
                    self.queries_used
                        .insert(format!("sub-agent-{}-round-{}", i, round_num));
                }
                findings
            } else {
                self.emit_phase(
                    "searching",
                    &format!("Round {}: Generating search queries...", round_num),
                    "running",
                );
                let queries = self.generate_queries(question, round_num).await;
                if queries.is_empty() {
                    info!("Round {}: no queries generated, stopping", round_num);
                    break;
                }
                self.emit_phase(
                    "searching",
                    &format!("Round {}: Searching with {} queries", round_num, queries.len()),
                    "running",
                );
                self.search_and_extract(&queries, question).await
            };

            if !round_findings.is_empty() {
                let finding_count = round_findings.len();
                self.findings.extend(round_findings);
                consecutive_empty_rounds = 0;
                info!("Round {}: extracted {} findings", round_num, finding_count);

                self.emit_phase(
                    "analyzing",
                    &format!("Round {}: Synthesizing {} new findings...", round_num, finding_count),
                    "running",
                );

                // SYNTHESIZE
                self.evolving_report =
                    self.synthesize(question, &self.findings, &self.evolving_report).await;

                // FINDINGS LOG COMPRESSION: periodically condense the evolving
                // report to prevent context bloat in subsequent query generation
                // and plan revision calls.
                if round_num >= 2 && round_num % self.compression_interval == 0 {
                    self.emit_phase(
                        "analyzing",
                        &format!("Round {}: Compressing findings log...", round_num),
                        "running",
                    );
                    self.compress_report(question, round_num).await;
                }

                self.emit_phase("analyzing", &format!("Round {}: Analysis complete", round_num), "completed");

                // PLAN REVISION (from round 2 onwards): re-evaluate and adjust
                // the research strategy based on what we've found so far
                if round_num >= 2 {
                    self.emit_phase(
                        "planning",
                        &format!("Round {}: Reviewing research plan...", round_num),
                        "running",
                    );
                    let updated_plan = self.revise_plan(question, round_num).await;
                    self.research_plan = updated_plan;
                }
            } else {
                consecutive_empty_rounds += 1;
                info!("Round {}: no new findings ({} consecutive empty)", round_num, consecutive_empty_rounds);
                if consecutive_empty_rounds >= self.max_empty_rounds {
                    info!("Stopping after {} empty rounds", consecutive_empty_rounds);
                    break;
                }
            }

            self.round_count = round_num;

            // DECIDE
            if round_num >= self.min_rounds && !self.evolving_report.is_empty() {
                let should_stop = self.should_stop(question, &self.evolving_report, round_num).await;
                if should_stop {
                    info!("LLM decided to stop after round {}", round_num);
                    break;
                }
            }
        }

        if self.evolving_report.is_empty() {
            return Err("No information could be gathered for this question.".to_string());
        }

        // FINAL REPORT (category-aware format + structured citations)
        self.emit_phase("writing", "Writing final research report...", "running");
        let final_report = self.final_report(question, &self.evolving_report).await;
        self.emit_phase("writing", "Research report complete", "completed");

        // Collect citation stats for metadata
        let citation_count = self.collect_cited_sources().len();

        // Append research metadata block (table format for the markdown viewer)
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let category_str = self
            .category
            .as_ref()
            .map(|c| c.display_name())
            .unwrap_or("Landscape");
        let stats = format!(
            "\n\n---\n\n## Research Metadata\n\n| Metric | Value |\n|--------|-------|\n| Category | {} |\n| Duration | {:.0}s |\n| Research Rounds | {} |\n| Search Queries | {} |\n| URLs Analyzed | {} |\n| Sources Cited | {} |\n",
            category_str, elapsed, self.round_count, self.queries_used.len(), self.urls_fetched.len(), citation_count,
        );

        Ok(format!("{}\n{}", final_report.trim(), stats))
    }
}
