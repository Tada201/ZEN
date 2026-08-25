//! Sub-agent output validation: turning a child's raw final text into a
//! status, a summary, and advisory notes.

/// Classification for sub-agent output validation.
///
/// Only `Completed` and `Incomplete` are produced: a run that returns `Ok` with
/// non-empty text is `Completed` (failure-marker heuristics attach advisory
/// notes rather than downgrading it), and empty output is `Incomplete`. Genuine
/// run failures are reported separately as the terminal `"failed"`/`"cancelled"`
/// status on the spawn result, not through this enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SubagentStatus {
    Completed,
    Incomplete,
}

impl SubagentStatus {
    pub(super) fn as_str(&self) -> &'static str {
        match self {
            SubagentStatus::Completed => "completed",
            SubagentStatus::Incomplete => "incomplete",
        }
    }
}

/// Validation result for a sub-agent's output.
#[derive(Debug, Clone)]
pub(super) struct ValidatedOutput {
    pub(super) status: SubagentStatus,
    pub(super) summary: String,
    pub(super) full_content: String,
    pub(super) notes: Vec<String>,
}

/// Validate and normalize the raw output from a child agent.
///
/// This runs only after the child runner returned `Ok` — the run's terminal
/// status is the primary success signal. Text heuristics are advisory: a phrase
/// like "unable to reproduce" or "error:" in a legitimate answer must not flip a
/// successful run to `Failed`, so failure markers only attach notes. Genuinely
/// empty output is still `Incomplete` because there is nothing to return.
pub(super) fn validate_subagent_output(content: &str) -> ValidatedOutput {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return ValidatedOutput {
            status: SubagentStatus::Incomplete,
            summary: "Sub-agent completed with no output.".to_string(),
            full_content: content.to_string(),
            notes: vec!["Output was empty or whitespace-only.".to_string()],
        };
    }

    let lower = trimmed.to_lowercase();
    let failure_markers = [
        "error:",
        "failed to",
        "unable to",
        "could not",
        "cannot complete",
        "task failed",
        "i failed",
        "execution failed",
        "exception occurred",
    ];

    let mut notes = Vec::new();
    for marker in failure_markers {
        if lower.contains(marker) {
            notes.push(format!(
                "Output mentions '{marker}' — verify the result actually satisfies the task."
            ));
        }
    }

    // Advisory only: a short answer may be perfectly valid, so note it without
    // downgrading the runner's successful terminal status.
    if trimmed.len() < 30 {
        notes.push("Output was very short; verify it satisfies the success criteria.".to_string());
    }

    ValidatedOutput {
        status: SubagentStatus::Completed,
        summary: trimmed.chars().take(500).collect::<String>(),
        full_content: content.to_string(),
        notes,
    }
}
