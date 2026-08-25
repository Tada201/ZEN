use anyhow::Result;
/// LLM ↔ Engine bidirectional protocol types
/// Handles deserialization of LLM actions and generation of structured feedback.
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::canvas::session::{Annotation, ExprPlotResult, GraphSession, Issue, SessionAction};

// ─── Feedback (Engine → Frontend / LLM) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFeedback {
    pub session_id: String,
    pub status: String, // "success" | "error"
    pub version: usize,
    pub state_snapshot: StateSnapshot,
    pub plots: Vec<ExprPlotResult>,
    pub issues: Vec<Issue>,
    pub summary: String, // Human-readable summary of what changed
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSnapshot {
    pub expressions: Vec<ExprSnapshot>,
    pub variables: std::collections::HashMap<String, f64>,
    pub viewport: ViewportSnap,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExprSnapshot {
    pub id: String,
    pub expr: String,
    pub visible: bool,
    pub color: String,
    pub error: Option<String>,
    pub thickness: Option<f64>,
    pub opacity: Option<f64>,
    pub style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportSnap {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
}

/// Generate a full feedback payload from the current session state
pub fn generate_feedback(session: &mut GraphSession, summary: String) -> SessionFeedback {
    let plots = session.generate_plots();

    SessionFeedback {
        session_id: session.id.clone(),
        status: "success".to_string(),
        version: session.current_version,
        state_snapshot: StateSnapshot {
            expressions: session
                .expressions
                .iter()
                .map(|e| ExprSnapshot {
                    id: e.id.clone(),
                    expr: e.expr.clone(),
                    visible: e.visible,
                    color: e.color.clone(),
                    error: e.error.clone(),
                    thickness: e.thickness,
                    opacity: e.opacity,
                    style: e.style.clone(),
                })
                .collect(),
            variables: session.variables.clone(),
            viewport: ViewportSnap {
                x_min: session.viewport.x_min,
                x_max: session.viewport.x_max,
                y_min: session.viewport.y_min,
                y_max: session.viewport.y_max,
            },
            annotations: session.annotations.clone(),
        },
        plots,
        issues: session.issues.clone(),
        summary,
    }
}

/// Generate error feedback without touching session state
pub fn generate_error_feedback(session_id: String, error: String) -> SessionFeedback {
    SessionFeedback {
        session_id,
        status: "error".to_string(),
        version: 0,
        state_snapshot: StateSnapshot {
            expressions: vec![],
            variables: Default::default(),
            viewport: ViewportSnap {
                x_min: -10.0,
                x_max: 10.0,
                y_min: -10.0,
                y_max: 10.0,
            },
            annotations: vec![],
        },
        plots: vec![],
        issues: vec![crate::canvas::session::Issue {
            id: "err".to_string(),
            severity: "error".to_string(),
            code: "action_failed".to_string(),
            message: error,
            affected_expression: None,
            suggestion: "Review the action parameters and try again".to_string(),
        }],
        summary: "Action failed".to_string(),
    }
}

/// Parse a `SessionAction` from the raw JSON value provided by the LLM
pub fn parse_session_action(value: Value) -> Result<SessionAction> {
    let action: SessionAction = serde_json::from_value(value).map_err(|e| {
        anyhow::anyhow!(
            "Failed to parse session action: {e}. Provide a valid 'action' field."
        )
    })?;
    Ok(action)
}

/// Format issues as a concise string for LLM context injection
pub fn format_issues_for_llm(issues: &[Issue]) -> String {
    if issues.is_empty() {
        return "No issues found.".to_string();
    }
    issues
        .iter()
        .map(|i| {
            format!(
                "[{}] {}: {}  → {}",
                i.severity.to_uppercase(),
                i.affected_expression.as_deref().unwrap_or("session"),
                i.message,
                i.suggestion
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
