use anyhow::Result;
use async_trait::async_trait;
/// GraphSessionTool — Agent tool for interactive math graph co-creation
/// Allows the LLM to create, edit, and iterate on mathematical expressions
/// with real-time validation feedback and plot generation.
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::agent::tools::AgentTool;
use crate::canvas::protocol::{generate_error_feedback, generate_feedback, parse_session_action};
use crate::canvas::session::GraphSession;

pub struct GraphSessionTool;

#[async_trait]
impl AgentTool for GraphSessionTool {
    fn id(&self) -> &str {
        "graph_session"
    }

    fn description(&self) -> &str {
        "Interactive math graphing co-creation tool. Plot functions, parametric curves, polar equations, and inequalities.\n\n\
         WHEN TO USE:\n\
         - Visualizing mathematical functions (sin, cos, polynomials)\n\
         - Exploring parameter effects with sliders (set_variable + update_expression)\n\
         - Comparing multiple functions on same axes\n\
         - Plotting data points with annotations\n\
         - Creating parametric animations (x=cos(t), y=sin(t))\n\
         - Graphing polar equations (r=1+cos(theta))\n\
         - Visualizing inequalities (y>x^2)\n\n\
         WHEN NOT TO USE:\n\
         - Inline formulas in chat → use LaTeX notation directly in messages\n\
         - Symbolic algebra → LLM can solve symbolically without graphing\n\
         - Simple arithmetic → just compute directly\n\
         - Statistical plots → use dedicated statistics tools instead\n\n\
         QUICK START:\n\
         1. Add function: {\"action\":\"add_expression\",\"expr\":\"sin(x)\",\"color\":\"#00FF9F\"}\n\
         2. If 'undefined_variable' error → {\"action\":\"set_variable\",\"name\":\"a\",\"value\":2}\n\
         3. Adjust view: {\"action\":\"set_viewport\",\"x_min\":-5,\"x_max\":5}\n\
         4. Add annotation: {\"action\":\"add_annotation\",\"x\":0,\"y\":1,\"label\":\"max\"}\n\n\
         ACTIONS:\n\
         [Expressions]\n\
         - add_expression: {\"expr\":\"sin(x)\",\"color\":\"#00FF9F\",\"label\":\"Wave\",\"renderer\":\"auto\"}\n\
           Optional: plot_type (function|parametric|polar|inequality), y_expr (for parametric),\n\
           domain ([min,max]), step (float), renderer (native|desmos|auto)\n\
         - update_expression: {\"id\":\"f1\",\"expr\":\"2*sin(x)\"}\n\
         - delete_expression: {\"id\":\"f1\"}\n\
         - set_visible: {\"id\":\"f1\",\"visible\":false}\n\
         [Variables]\n\
         - set_variable: {\"name\":\"a\",\"value\":2.5}  [for parameters in expressions]\n\
         - delete_variable: {\"name\":\"a\"}\n\
         [Annotations]\n\
         - add_annotation: {\"x\":0,\"y\":1,\"label\":\"Origin\",\"color\":\"#FFCC00\",\"style\":\"point\"}\n\
         - delete_annotation: {\"id\":\"a1\"}\n\
         - set_annotation_visible: {\"id\":\"a1\",\"visible\":false}\n\
         [Viewport]\n\
         - set_viewport: {\"x_min\":-5,\"x_max\":5,\"y_min\":-3,\"y_max\":3}\n\
         [Session]\n\
         - get_state: {}  [read-only: returns full session state]\n\
         - list_expressions: {}  [read-only: returns expression list with status]\n\
         - reset_session: {}  [clear all]\n\
         - capture_vision: {}  [for vision model analysis - returns plot data]\n\n\
         SUPPORTED MATH:\n\
         - Functions: y=f(x) → sin(x), a*x^2+b, tan(x)\n\
         - Parametric: x=cos(t), y=sin(t) [use plot_type:\"parametric\", y_expr:\"sin(t)\"]\n\
         - Polar: r=1+cos(theta) [use plot_type:\"polar\"]\n\
         - Inequalities: y>sin(x), y<x^2 [use plot_type:\"inequality\"]\n\
         - Piecewise: {condition1: expr1, condition2: expr2} → e.g., {x<0: -x, x>=0: x}\n\
         - Constants: pi, e\n\
         - Functions: sin,cos,tan,asin,acos,atan,sqrt,abs,ln,log2,log10,exp,floor,ceil\n\n\
         RENDERER OPTIONS:\n\
         - \"native\": Fast meval-based plotting (default, works offline)\n\
         - \"desmos\": Desmos API (better for complex/implicit equations)\n\
         - \"auto\": Try native first, fallback to Desmos on error\n\n\
         ERROR RECOVERY:\n\
         - 'undefined_variable:X' → set_variable(X, value)\n\
         - 'domain error' → adjust viewport with set_viewport\n\
         - 'too many points' → reduce range or increase step\n\
         - 'circular_dependency' → reorder variable definitions\n\n\
         TIPS:\n\
         - x,t,theta are implicit variables (don't need set_variable)\n\
         - Default viewport: [-10,10] x [-10,10]\n\
         - Expression IDs auto-increment: f1, f2, f3...\n\
         - Annotation IDs auto-increment: a1, a2, a3...\n\
         - Use get_state to inspect current session before making changes\n\
         - Use capture_vision BEFORE asking vision models to analyze graphs\n\
         - Check feedback for issues after every action"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "Leave empty to auto-use current chat's graph session. Each chat has its own persistent session."
                },
                "action": {
                    "type": "string",
                    "enum": ["add_expression", "update_expression", "delete_expression", "set_visible", "set_variable", "delete_variable", "set_viewport", "add_annotation", "delete_annotation", "set_annotation_visible", "get_state", "list_expressions", "reset_session", "capture_vision"],
                    "description": "Action to perform"
                },
                // Expression fields
                "expr": {
                    "type": "string",
                    "description": "Math expression (for add_expression, update_expression). Examples: sin(x), a*x^2+b, tan(x)"
                },
                "id": {
                    "type": "string",
                    "description": "Expression ID (f1, f2, f3...) or annotation ID (a1, a2...). Use ID from feedback to reference."
                },
                "color": {
                    "type": "string",
                    "pattern": "^#[0-9A-Fa-f]{6}$",
                    "description": "Hex color #RRGGBB (e.g. #00FF9F). Default: auto-assigned neon colors."
                },
                "plot_type": {
                    "type": "string",
                    "enum": ["function", "parametric", "polar", "inequality"],
                    "description": "Plot type override. Auto-detected if not specified."
                },
                "y_expr": {
                    "type": "string",
                    "description": "For parametric plots: y = g(t) expression. x expression goes in 'expr' field."
                },
                "domain": {
                    "type": "array",
                    "items": {"type": "number"},
                    "minItems": 2,
                    "maxItems": 2,
                    "description": "Domain override [min, max] for this expression."
                },
                "step": {
                    "type": "number",
                    "description": "Sampling step size override. Default: auto based on viewport."
                },
                "label": {
                    "type": "string",
                    "description": "Human-readable label for legend/UI."
                },
                "renderer": {
                    "type": "string",
                    "enum": ["native", "desmos", "auto"],
                    "description": "Renderer hint: native (meval), desmos (Desmos API), auto (try native, fallback to desmos)."
                },
                // Variable fields
                "name": {
                    "type": "string",
                    "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$",
                    "description": "Variable name (for set_variable, delete_variable). Must be valid identifier."
                },
                "value": {
                    "type": "number",
                    "description": "Variable value (for set_variable)"
                },
                // Visibility field
                "visible": {
                    "type": "boolean",
                    "description": "Visibility flag (for set_visible, set_annotation_visible)"
                },
                // Viewport fields
                "x_min": { "type": "number", "description": "Viewport left bound" },
                "x_max": { "type": "number", "description": "Viewport right bound" },
                "y_min": { "type": "number", "description": "Viewport bottom bound" },
                "y_max": { "type": "number", "description": "Viewport top bound" },
                // Annotation fields
                "x": {
                    "type": "number",
                    "description": "X coordinate for annotation (for add_annotation)."
                },
                "y": {
                    "type": "number",
                    "description": "Y coordinate for annotation (for add_annotation)."
                },
                "style": {
                    "type": "string",
                    "enum": ["point", "label", "marker", "arrow"],
                    "description": "Annotation style (for add_annotation). Default: point."
                },
                "expr_id": {
                    "type": "string",
                    "description": "Associated expression ID for annotation (optional)."
                }
            },
            "required": ["action"],
            "additionalProperties": false
        })
    }

    async fn run(
        &self,
        app: AppHandle,
        chat_id: String,
        input: Value,
        _depth: u32,
        _allowed_tools: Option<
            std::sync::Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
        >,
        _token: tokio_util::sync::CancellationToken,
    ) -> Result<Value> {
        use crate::commands::AppState;
        use tauri::{Emitter, Manager};

        let session_id = input
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("chat_{}", chat_id));

        let state = app.state::<AppState>();
        let mut sessions = state.graph_sessions.lock().await;

        // Auto-create session if it doesn't exist
        if !sessions.contains_key(&session_id) {
            sessions.insert(
                session_id.clone(),
                GraphSession::new(session_id.clone(), format!("Session for {}", chat_id)),
            );
        }

        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| anyhow::anyhow!("Graph session {} not found", session_id))?;

        // Handle capture_vision separately - it doesn't modify state
        let action_str = input.get("action").and_then(|v| v.as_str()).unwrap_or("");
        if action_str == "capture_vision" {
            let vision_capture = session.generate_vision_capture();
            tracing::info!(
                session_id = %session_id,
                expressions = vision_capture.expressions.len(),
                "GraphSessionTool: capture_vision requested"
            );

            // Emit to frontend as well
            let _ = app.emit("graph:session:vision_capture", &vision_capture);

            return Ok(serde_json::to_value(vision_capture)?);
        }

        // Parse action from input
        let action_result = parse_session_action(input.clone());
        match action_result {
            Ok(action) => {
                match session.apply_action(action, "llm") {
                    Ok(()) => {
                        let summary = describe_action(&input);
                        let feedback = generate_feedback(session, summary);
                        tracing::info!(
                            session_id = %session_id,
                            version = feedback.version,
                            issues = feedback.issues.len(),
                            "GraphSessionTool: action applied"
                        );
                        // Emit feedback to frontend
                        let _ = app.emit("graph:session:feedback", &feedback);
                        Ok(serde_json::to_value(feedback)?)
                    }
                    Err(e) => {
                        let feedback = generate_error_feedback(session_id, e.to_string());
                        // Emit error feedback to frontend
                        let _ = app.emit("graph:session:feedback", &feedback);
                        Ok(serde_json::to_value(feedback)?)
                    }
                }
            }
            Err(e) => {
                let feedback = generate_error_feedback(session_id, e.to_string());
                // Emit error feedback to frontend
                let _ = app.emit("graph:session:feedback", &feedback);
                Ok(serde_json::to_value(feedback)?)
            }
        }
    }
}

/// Generate a human-readable summary of an action for commit history
fn describe_action(input: &Value) -> String {
    let action = input
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    match action {
        "add_expression" => {
            let expr = input.get("expr").and_then(|v| v.as_str()).unwrap_or("?");
            format!("LLM added expression: {}", expr)
        }
        "update_expression" => {
            let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("?");
            let expr = input.get("expr").and_then(|v| v.as_str()).unwrap_or("?");
            format!("LLM updated {} = {}", id, expr)
        }
        "delete_expression" => {
            let id = input.get("id").and_then(|v| v.as_str()).unwrap_or("?");
            format!("LLM deleted {}", id)
        }
        "set_variable" => {
            let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let val = input.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
            format!("LLM set {} = {}", name, val)
        }
        "capture_vision" => "LLM captured graph for vision analysis".to_string(),
        "reset_session" => "LLM reset session".to_string(),
        other => format!("LLM action: {}", other),
    }
}
