use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSession {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub modified_at: u64,

    /// Current expressions
    pub expressions: Vec<Expression>,

    /// Current variable values
    pub variables: HashMap<String, f64>,

    /// Graph viewport settings
    pub viewport: Viewport,

    /// Annotations (points, labels, markers)
    pub annotations: Vec<Annotation>,

    /// Commit history (git-like versioning)
    pub history: Vec<Commit>,
    pub current_version: usize,

    /// Current validation issues
    pub issues: Vec<Issue>,

    /// Safety limits
    #[serde(skip)]
    pub limits: SessionLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Expression {
    pub id: String,
    pub expr: String,
    pub visible: bool,
    pub color: String,
    pub error: Option<String>,
    pub dependencies: Vec<String>,
    pub thickness: Option<f64>,
    pub opacity: Option<f64>,
    pub style: Option<String>,
    /// Plot type override: "function", "parametric", "polar", "inequality".
    pub plot_type: Option<String>,
    /// For parametric plots: x = f(t), y = g(t).
    pub y_expr: Option<String>,
    /// Domain override for this expression: [min, max].
    pub domain: Option<[f64; 2]>,
    /// Step size override.
    pub step: Option<f64>,
    /// Human-readable label for legend/UI.
    pub label: Option<String>,
    /// Renderer hint: "native", "desmos", "auto".
    pub renderer: Option<String>,
    #[serde(skip)]
    pub last_plot_hash: Option<String>,
    #[serde(skip)]
    pub cached_plot: Option<ExprPlotResult>,
}

/// Annotation on a plot (point, label, marker).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub expr_id: Option<String>,
    pub x: f64,
    pub y: f64,
    pub label: Option<String>,
    pub color: String,
    pub style: String,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            x_min: -10.0,
            x_max: 10.0,
            y_min: -10.0,
            y_max: 10.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commit {
    pub version: usize,
    pub timestamp: u64,
    pub author: String,
    pub summary: String,
    pub snapshot: CommitSnapshot,
}

/// Lightweight snapshot for rollback.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSnapshot {
    pub expressions: Vec<Expression>,
    pub variables: HashMap<String, f64>,
    pub viewport: Viewport,
    pub annotations: Vec<Annotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: String,
    pub severity: String,
    pub code: String,
    pub message: String,
    pub affected_expression: Option<String>,
    pub suggestion: String,
}

#[derive(Debug, Clone)]
pub struct SessionLimits {
    pub max_expressions: usize,
    pub max_variables: usize,
    pub max_history: usize,
}

impl Default for SessionLimits {
    fn default() -> Self {
        Self {
            max_expressions: 20,
            max_variables: 15,
            max_history: 50,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum SessionAction {
    AddExpression {
        expr: String,
        color: Option<String>,
        plot_type: Option<String>,
        y_expr: Option<String>,
        domain: Option<[f64; 2]>,
        step: Option<f64>,
        label: Option<String>,
        renderer: Option<String>,
    },
    UpdateExpression {
        id: String,
        expr: String,
    },
    UpdateExpressionStyle {
        id: String,
        color: Option<String>,
        thickness: Option<f64>,
        opacity: Option<f64>,
        style: Option<String>,
    },
    DeleteExpression {
        id: String,
    },
    SetVisible {
        id: String,
        visible: bool,
    },
    SetVariable {
        name: String,
        value: f64,
    },
    DeleteVariable {
        name: String,
    },
    SetViewport {
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    },
    AddAnnotation {
        x: f64,
        y: f64,
        label: Option<String>,
        color: Option<String>,
        style: Option<String>,
        expr_id: Option<String>,
    },
    DeleteAnnotation {
        id: String,
    },
    SetAnnotationVisible {
        id: String,
        visible: bool,
    },
    ResetSession,
    /// Capture current graph state for vision-enabled LLM analysis.
    CaptureVision,
    /// Get current session state (read-only, no modification).
    GetState,
    /// List all expressions with their current status (read-only).
    ListExpressions,
}

/// Per-expression plot output sent back to frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExprPlotResult {
    pub id: String,
    pub color: String,
    pub points: Vec<[f64; 2]>,
    pub bounds: [f64; 4],
    pub error: Option<String>,
    pub thickness: f64,
    pub opacity: f64,
    pub line_style: String,
    pub inequality_op: Option<String>,
}

/// Vision capture data for LLM analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionCapture {
    pub session_id: String,
    pub viewport: Viewport,
    pub expressions: Vec<VisionExpression>,
    pub variables: HashMap<String, f64>,
    pub plots: Vec<VisionPlot>,
    pub issues: Vec<VisionIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionExpression {
    pub id: String,
    pub expr: String,
    pub color: String,
    pub visible: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionPlot {
    pub id: String,
    pub color: String,
    pub point_count: usize,
    pub bounds: [f64; 4],
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionIssue {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub suggestion: String,
}
