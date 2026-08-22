/// Configuration for the agent runner loop
#[derive(Clone)]
pub struct RunConfig {
    /// Maximum number of LLM calls before stopping
    pub max_iterations: usize,
    /// Maximum times the same tool+args signature can repeat before flagging
    pub max_duplicate_calls: usize,
    /// Number of old tool results to compact (replace with summary) when context grows
    pub compaction_threshold: usize,
    /// Token-based compaction trigger (approximate tokens)
    pub compaction_token_threshold: usize,
    /// Maximum context window size (tokens) - proactive compaction before overflow.
    /// This is Zen's soft compaction cap, NOT the model's hardware window.
    pub max_context_tokens: usize,
    /// The selected model's real context window (`max_context_length`),
    /// when known. Surfaced in the context breakdown so the UI gauge
    /// reflects the true model budget rather than the compaction cap.
    /// `None` when the provider does not report a window.
    pub model_context_window: Option<usize>,
    /// Whether to execute multiple tools in parallel (fan-out) or sequentially
    pub parallel_tools: bool,
    /// Whether tools are enabled for this run. When false, no tools are passed to the LLM.
    pub tools_enabled: bool,
    /// Model name to use for summarization
    pub summarization_model: Option<String>,
    /// Token budget for summarization (default 2000)
    pub summarization_token_budget: usize,
    /// Threshold score for context drift detection (default: 0.3)
    pub drift_threshold: f32,
    /// Whether this run is in voice mode (spawn display agent after completion)
    pub voice_mode: bool,
    /// Model override for the voice display agent (empty = same as main)
    pub display_agent_model: Option<String>,
    /// Provider paired with the voice display model (empty = main provider)
    pub display_agent_provider: Option<String>,
    /// Compact current-board manifest supplied by the voice UI.
    pub voice_display_context: Option<String>,
    /// Maximum messages to keep in the agent's working conversation (None = unlimited)
    pub max_messages_in_memory: Option<usize>,
    /// Optional total token budget for this run. When set, the runner will stop
    /// before the cumulative input+output tokens exceed this limit. None means
    /// no explicit budget (the existing context/compaction limits still apply).
    pub token_budget: Option<usize>,
}

impl Default for RunConfig {
    fn default() -> Self {
        Self {
            max_iterations: 30,
            max_duplicate_calls: 3,
            compaction_threshold: 40,
            compaction_token_threshold: 50000, // Start compaction at ~50K tokens
            max_context_tokens: 100000,        // Hard limit at ~100K tokens (safe for 128K models)
            model_context_window: None,
            parallel_tools: true,
            tools_enabled: true,
            summarization_model: None,
            summarization_token_budget: 2000,
            drift_threshold: 0.3,
            voice_mode: false,
            display_agent_model: None,
            display_agent_provider: None,
            voice_display_context: None,
            max_messages_in_memory: None,
            token_budget: None,
        }
    }
}

pub struct ContextTracker {
    initial_topic_vector: Option<Vec<f32>>,
    drift_threshold: f32,
}

impl ContextTracker {
    pub fn new(initial_topic_vector: Option<Vec<f32>>, drift_threshold: f32) -> Self {
        Self {
            initial_topic_vector,
            drift_threshold,
        }
    }

    pub fn check_drift(&self, current_vector: &[f32]) -> (f32, bool) {
        if let Some(ref initial) = self.initial_topic_vector {
            let similarity = crate::rag::embedding::cosine_similarity(initial, current_vector);
            let has_drifted = similarity < self.drift_threshold;
            (similarity, has_drifted)
        } else {
            (1.0, false)
        }
    }
}
