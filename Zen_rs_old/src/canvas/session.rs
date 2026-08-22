use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

use crate::canvas::plot::{generate_plot, validate_expression_safety, PlotRequest, PlotType};

mod helpers;
mod types;

use helpers::{extract_dependencies, next_color, now_ms, parse_lhs, parse_operator, parse_rhs};
pub use types::{
    Annotation, Commit, CommitSnapshot, ExprPlotResult, Expression, GraphSession, Issue,
    SessionAction, SessionLimits, Viewport, VisionCapture, VisionExpression, VisionIssue,
    VisionPlot,
};

impl GraphSession {
    pub fn new(id: String, name: String) -> Self {
        let now = now_ms();
        Self {
            id,
            name,
            created_at: now,
            modified_at: now,
            expressions: Vec::new(),
            variables: HashMap::new(),
            viewport: Viewport::default(),
            annotations: Vec::new(),
            history: Vec::new(),
            current_version: 0,
            issues: Vec::new(),
            limits: SessionLimits::default(),
        }
    }

    /// Apply a single action and record it in history
    pub fn apply_action(&mut self, action: SessionAction, author: &str) -> Result<()> {
        // Snapshot current state for rollback
        let snapshot = self.snapshot();

        match action {
            SessionAction::AddExpression {
                expr,
                color,
                plot_type,
                y_expr,
                domain,
                step,
                label,
                renderer,
            } => {
                if self.expressions.len() >= self.limits.max_expressions {
                    bail!(
                        "Maximum expressions ({}) reached",
                        self.limits.max_expressions
                    );
                }
                validate_expression_safety(&expr)?;

                let id = format!("f{}", self.expressions.len() + 1);
                let color = color.unwrap_or_else(|| next_color(self.expressions.len()));
                let deps = extract_dependencies(&expr, &self.variables);
                self.expressions.push(Expression {
                    id: id.clone(),
                    expr: expr.clone(),
                    visible: true,
                    color,
                    thickness: Some(2.0),
                    opacity: Some(1.0),
                    style: Some("solid".to_string()),
                    error: None,
                    dependencies: deps,
                    plot_type,
                    y_expr,
                    domain,
                    step,
                    label,
                    renderer,
                    last_plot_hash: None,
                    cached_plot: None,
                });
                self.commit(
                    snapshot,
                    author,
                    format!("Add expression {} = {}", id, expr),
                );
            }

            SessionAction::UpdateExpression { id, expr } => {
                validate_expression_safety(&expr)?;
                let ex = self
                    .expressions
                    .iter_mut()
                    .find(|e| e.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Expression '{}' not found", id))?;
                ex.expr = expr.clone();
                ex.error = None;
                ex.dependencies = extract_dependencies(&expr, &self.variables);
                self.commit(snapshot, author, format!("Update {} = {}", id, expr));
            }

            SessionAction::UpdateExpressionStyle {
                id,
                color,
                thickness,
                opacity,
                style,
            } => {
                let ex = self
                    .expressions
                    .iter_mut()
                    .find(|e| e.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Expression '{}' not found", id))?;
                if let Some(c) = color {
                    ex.color = c;
                }
                if let Some(t) = thickness {
                    ex.thickness = Some(t);
                }
                if let Some(o) = opacity {
                    ex.opacity = Some(o);
                }
                if let Some(s) = style {
                    ex.style = Some(s);
                }
                self.commit(snapshot, author, format!("Update style for {}", id));
            }

            SessionAction::DeleteExpression { id } => {
                let pos = self
                    .expressions
                    .iter()
                    .position(|e| e.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Expression '{}' not found", id))?;
                self.expressions.remove(pos);
                self.commit(snapshot, author, format!("Delete expression {}", id));
            }

            SessionAction::SetVisible { id, visible } => {
                let ex = self
                    .expressions
                    .iter_mut()
                    .find(|e| e.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Expression '{}' not found", id))?;
                ex.visible = visible;
                self.commit(
                    snapshot,
                    author,
                    format!("Set {}.visible = {}", id, visible),
                );
            }

            SessionAction::SetVariable { name, value } => {
                // Validate name is simple identifier
                if name.chars().any(|c| !c.is_alphanumeric() && c != '_') {
                    bail!("Invalid variable name: '{}'", name);
                }
                if self.variables.len() >= self.limits.max_variables
                    && !self.variables.contains_key(&name)
                {
                    bail!("Maximum variables ({}) reached", self.limits.max_variables);
                }
                self.variables.insert(name.clone(), value);
                self.commit(snapshot, author, format!("Set {} = {}", name, value));
            }

            SessionAction::DeleteVariable { name } => {
                self.variables.remove(&name);
                self.commit(snapshot, author, format!("Delete variable {}", name));
            }

            SessionAction::SetViewport {
                x_min,
                x_max,
                y_min,
                y_max,
            } => {
                if x_min >= x_max || y_min >= y_max {
                    bail!("Invalid viewport: mins must be less than maxes");
                }
                self.viewport = Viewport {
                    x_min,
                    x_max,
                    y_min,
                    y_max,
                };
                self.commit(snapshot, author, "Update viewport".to_string());
            }

            // Annotation actions
            SessionAction::AddAnnotation {
                x,
                y,
                label,
                color,
                style,
                expr_id,
            } => {
                if self.annotations.len() >= 50 {
                    bail!("Maximum annotations (50) reached");
                }
                let id = format!("a{}", self.annotations.len() + 1);
                let color = color.unwrap_or_else(|| "#FFCC00".to_string());
                let style = style.unwrap_or_else(|| "point".to_string());
                self.annotations.push(Annotation {
                    id,
                    expr_id,
                    x,
                    y,
                    label,
                    color,
                    style,
                    visible: true,
                });
                self.commit(
                    snapshot,
                    author,
                    format!("Add annotation at ({}, {})", x, y),
                );
            }

            SessionAction::DeleteAnnotation { id } => {
                let pos = self
                    .annotations
                    .iter()
                    .position(|a| a.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Annotation '{}' not found", id))?;
                self.annotations.remove(pos);
                self.commit(snapshot, author, format!("Delete annotation {}", id));
            }

            SessionAction::SetAnnotationVisible { id, visible } => {
                let ann = self
                    .annotations
                    .iter_mut()
                    .find(|a| a.id == id)
                    .ok_or_else(|| anyhow::anyhow!("Annotation '{}' not found", id))?;
                ann.visible = visible;
                self.commit(
                    snapshot,
                    author,
                    format!("Set annotation {}.visible = {}", id, visible),
                );
            }

            // Read-only actions (no state modification)
            SessionAction::GetState => {
                // GetState is read-only - no commit needed
                // Feedback will include full state snapshot
                tracing::info!("GetState requested for session {}", self.id);
            }

            SessionAction::ListExpressions => {
                // ListExpressions is read-only - no commit needed
                tracing::info!("ListExpressions requested for session {}", self.id);
            }

            SessionAction::ResetSession => {
                self.expressions.clear();
                self.variables.clear();
                self.annotations.clear();
                self.viewport = Viewport::default();
                self.issues.clear();
                self.commit(snapshot, author, "Reset session".to_string());
            }

            SessionAction::CaptureVision => {
                // CaptureVision doesn't modify state - just triggers plot generation for feedback
                // No commit needed as this is a read-only operation
                tracing::info!("CaptureVision requested for session {}", self.id);
            }
        }

        // Re-validate after every action
        self.validate();
        self.modified_at = now_ms();
        Ok(())
    }

    /// Rollback to a specific version
    pub fn rollback_to_version(&mut self, version: usize) -> Result<()> {
        let commit = self
            .history
            .get(version)
            .ok_or_else(|| anyhow::anyhow!("Version {} not found", version))?
            .clone();

        self.expressions = commit.snapshot.expressions;
        self.variables = commit.snapshot.variables;
        self.viewport = commit.snapshot.viewport;
        self.annotations = commit.snapshot.annotations;
        self.current_version = version;

        // Trim future history
        self.history.truncate(version + 1);

        self.validate();
        self.modified_at = now_ms();
        Ok(())
    }

    /// Generate plot points for all visible expressions (with caching)
    pub fn generate_plots(&mut self) -> Vec<ExprPlotResult> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let step = (self.viewport.x_max - self.viewport.x_min) / 1000.0;

        let mut results = Vec::new();
        for expr in &mut self.expressions {
            if !expr.visible {
                continue;
            }

            // Skip native plotting for tables and regressions as they are Desmos-only
            if expr.expr.starts_with("table ") || expr.expr.contains('~') {
                continue;
            }

            // Create cache key from expression + variables + viewport
            let mut hasher = DefaultHasher::new();
            expr.expr.hash(&mut hasher);
            self.viewport.x_min.to_bits().hash(&mut hasher);
            self.viewport.x_max.to_bits().hash(&mut hasher);
            for (k, v) in &self.variables {
                k.hash(&mut hasher);
                v.to_bits().hash(&mut hasher);
            }
            let cache_key = format!("{:x}", hasher.finish());

            // Check cache
            if let Some(cached) = &expr.cached_plot {
                if expr.last_plot_hash.as_ref() == Some(&cache_key) {
                    let mut res = cached.clone();
                    res.color = expr.color.clone();
                    res.thickness = expr.thickness.unwrap_or(2.0);
                    res.opacity = expr.opacity.unwrap_or(1.0);
                    res.line_style = expr.style.clone().unwrap_or_else(|| "solid".to_string());
                    let ineq_op = parse_operator(&expr.expr);
                    res.inequality_op = ineq_op;
                    results.push(res);
                    continue;
                }
            }

            // Generate new plot
            let rhs = parse_rhs(&expr.expr);
            let ineq_op = parse_operator(&expr.expr);
            let pt = if ineq_op.is_some() {
                PlotType::Inequality
            } else {
                PlotType::Function
            };

            // Handle piecewise
            let mut all_points = Vec::new();
            let mut current_bounds = [
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ];
            let mut current_error = None;

            let trimmed = rhs.trim();
            let is_piecewise = trimmed.starts_with('{') && trimmed.ends_with('}');

            let segments = if is_piecewise {
                let inner = trimmed[1..trimmed.len() - 1].trim();
                let mut segs = Vec::new();
                for piece in inner.split(',') {
                    if let Some(colon_pos) = piece.find(':') {
                        let cond_str = piece[..colon_pos].trim();
                        let exp_str = piece[colon_pos + 1..].trim();

                        let mut op = "";
                        let ops = ["<=", ">=", "==", "<", ">"];
                        let mut val_str = "";
                        for o in ops {
                            if let Some(pos) = cond_str.find(o) {
                                op = o;
                                val_str = cond_str[pos + o.len()..].trim();
                                break;
                            }
                        }

                        let mut vmin = self.viewport.x_min;
                        let mut vmax = self.viewport.x_max;
                        if !op.is_empty() {
                            if let Ok(val) =
                                crate::canvas::plot::eval_expr(val_str, &self.variables)
                            {
                                match op {
                                    "<" | "<=" => vmax = val.min(vmax),
                                    ">" | ">=" => vmin = val.max(vmin),
                                    _ => {}
                                }
                            }
                        }

                        // Valid overlap check
                        if vmin < vmax {
                            segs.push((exp_str.to_string(), [vmin, vmax]));
                        }
                    } else {
                        segs.push((
                            piece.trim().to_string(),
                            [self.viewport.x_min, self.viewport.x_max],
                        ));
                    }
                }
                segs
            } else {
                vec![(rhs.clone(), [self.viewport.x_min, self.viewport.x_max])]
            };

            for (expr_str, domain) in segments {
                let req = PlotRequest {
                    plot_type: pt.clone(),
                    x_expr: expr_str,
                    y_expr: None,
                    domain,
                    step: step.max(1e-5),
                    max_points: 5000,
                    variables: self.variables.clone(),
                    inequality_op: ineq_op.clone(),
                };

                match generate_plot(&req) {
                    Ok(out) => {
                        if !all_points.is_empty() {
                            all_points.push([f64::NAN, f64::NAN]); // Pen lift
                        }
                        all_points.extend(out.points);
                        current_bounds[0] = current_bounds[0].min(out.bounds[0]);
                        current_bounds[1] = current_bounds[1].min(out.bounds[1]);
                        current_bounds[2] = current_bounds[2].max(out.bounds[2]);
                        current_bounds[3] = current_bounds[3].max(out.bounds[3]);
                    }
                    Err(e) => {
                        current_error = Some(e.to_string());
                    }
                }
            }

            if current_bounds[0] == f64::INFINITY {
                current_bounds = [0.0; 4];
            }

            let plot_result = ExprPlotResult {
                id: expr.id.clone(),
                color: expr.color.clone(),
                points: all_points,
                bounds: current_bounds,
                error: current_error,
                thickness: expr.thickness.unwrap_or(2.0),
                opacity: expr.opacity.unwrap_or(1.0),
                line_style: expr.style.clone().unwrap_or_else(|| "solid".to_string()),
                inequality_op: ineq_op.clone(),
            };

            // Cache the result
            expr.cached_plot = Some(plot_result.clone());
            expr.last_plot_hash = Some(cache_key);
            results.push(plot_result);
        }
        results
    }

    /// Validate all expressions against current variable bindings
    pub fn validate(&mut self) {
        let mut issues = Vec::new();

        for expr in &mut self.expressions {
            // Skip validation for tables and regressions
            if expr.expr.starts_with("table ") || expr.expr.contains('~') {
                continue;
            }

            // Check undefined variables
            for dep in &expr.dependencies {
                if !self.variables.contains_key(dep.as_str()) {
                    // Also allow x, t, theta as implicit
                    if dep != "x" && dep != "t" && dep != "theta" && dep != "pi" && dep != "e" {
                        issues.push(Issue {
                            id: Uuid::new_v4().to_string(),
                            severity: "error".to_string(),
                            code: "undefined_variable".to_string(),
                            message: format!(
                                "Variable '{}' used in {} but not defined",
                                dep, expr.id
                            ),
                            affected_expression: Some(expr.id.clone()),
                            suggestion: format!("Add variable: set_variable({}, 1.0)", dep),
                        });
                    }
                }
            }

            // Check division by zero patterns
            if expr.expr.contains("/x") || expr.expr.contains("/ x") {
                issues.push(Issue {
                    id: Uuid::new_v4().to_string(),
                    severity: "warning".to_string(),
                    code: "division_by_zero".to_string(),
                    message: format!("{} may be undefined at x=0", expr.id),
                    affected_expression: Some(expr.id.clone()),
                    suggestion: "Consider restricting domain or using (x+ε) instead".to_string(),
                });
            }
        }

        // Check for circular variable dependencies
        if let Some(cycle) = self.detect_circular_dependencies() {
            issues.push(Issue {
                id: Uuid::new_v4().to_string(),
                severity: "error".to_string(),
                code: "circular_dependency".to_string(),
                message: format!("Circular dependency detected: {}", cycle.join(" → ")),
                affected_expression: None,
                suggestion: "Reorder variable definitions to break the cycle".to_string(),
            });
        }

        self.issues = issues;
    }

    /// Detect circular variable dependencies (a → b → a)
    fn detect_circular_dependencies(&self) -> Option<Vec<String>> {
        use std::collections::HashSet;

        for var_name in self.variables.keys() {
            let mut visited = HashSet::new();
            if self.has_circular_dep(var_name, &mut visited) {
                return Some(visited.into_iter().collect());
            }
        }
        None
    }

    fn has_circular_dep(&self, var: &str, visited: &mut std::collections::HashSet<String>) -> bool {
        if visited.contains(var) {
            return true;
        }
        visited.insert(var.to_string());

        // Find all expressions that compute this variable or depend on it
        for expr in &self.expressions {
            let lhs = parse_lhs(&expr.expr);
            if lhs == var {
                for dep in &expr.dependencies {
                    if self.has_circular_dep(dep, visited) {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Export full session state as JSON for LLM context
    pub fn export_state(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "expressions": self.expressions.iter().map(|e| json!({
                "id": e.id,
                "expr": e.expr,
                "visible": e.visible,
                "color": e.color,
                "error": e.error,
            })).collect::<Vec<_>>(),
            "variables": self.variables,
            "viewport": {
                "x_min": self.viewport.x_min,
                "x_max": self.viewport.x_max,
                "y_min": self.viewport.y_min,
                "y_max": self.viewport.y_max,
            },
            "version": self.current_version,
            "issues_count": self.issues.len(),
        })
    }

    /// Generate vision capture data for LLM analysis
    /// Returns plot points and metadata that can be rendered client-side
    /// or used with a server-side renderer for PNG generation
    pub fn generate_vision_capture(&mut self) -> VisionCapture {
        let plots = self.generate_plots();

        VisionCapture {
            session_id: self.id.clone(),
            viewport: self.viewport.clone(),
            expressions: self
                .expressions
                .iter()
                .map(|e| VisionExpression {
                    id: e.id.clone(),
                    expr: e.expr.clone(),
                    color: e.color.clone(),
                    visible: e.visible,
                    error: e.error.clone(),
                })
                .collect(),
            variables: self.variables.clone(),
            plots: plots
                .into_iter()
                .map(|p| VisionPlot {
                    id: p.id,
                    color: p.color,
                    point_count: p.points.len(),
                    bounds: p.bounds,
                    error: p.error,
                })
                .collect(),
            issues: self
                .issues
                .iter()
                .map(|i| VisionIssue {
                    severity: i.severity.clone(),
                    code: i.code.clone(),
                    message: i.message.clone(),
                    suggestion: i.suggestion.clone(),
                })
                .collect(),
        }
    }

    fn snapshot(&self) -> CommitSnapshot {
        CommitSnapshot {
            expressions: self.expressions.clone(),
            variables: self.variables.clone(),
            viewport: self.viewport.clone(),
            annotations: self.annotations.clone(),
        }
    }

    fn commit(&mut self, snapshot: CommitSnapshot, author: &str, summary: String) {
        if self.history.len() >= self.limits.max_history {
            self.history.remove(0);
        }
        self.current_version = self.history.len();
        self.history.push(Commit {
            version: self.current_version,
            timestamp: now_ms(),
            author: author.to_string(),
            summary,
            snapshot,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_session() -> GraphSession {
        GraphSession::new("test".to_string(), "Test Session".to_string())
    }

    #[test]
    fn test_add_expression() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        assert_eq!(s.expressions.len(), 1);
        assert_eq!(s.expressions[0].id, "f1");
    }

    #[test]
    fn test_set_variable() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::SetVariable {
                name: "a".to_string(),
                value: 3.5,
            },
            "user",
        )
        .unwrap();
        assert_eq!(*s.variables.get("a").unwrap(), 3.5);
    }

    #[test]
    fn test_update_expression() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        s.apply_action(
            SessionAction::UpdateExpression {
                id: "f1".to_string(),
                expr: "cos(x)".to_string(),
            },
            "llm",
        )
        .unwrap();
        assert_eq!(s.expressions[0].expr, "cos(x)");
    }

    #[test]
    fn test_version_rollback() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "cos(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        assert_eq!(s.expressions.len(), 2);
        s.rollback_to_version(0).unwrap();
        assert_eq!(s.expressions.len(), 1);
    }

    #[test]
    fn test_validation_undefined_variable() {
        let mut s = make_session();
        // Add expression with undefined variable 'b'
        s.apply_action(
            SessionAction::AddExpression {
                expr: "a * sin(x) + b".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        // 'a' and 'b' not defined
        assert!(!s.issues.is_empty());
        let undefined: Vec<_> = s
            .issues
            .iter()
            .filter(|i| i.code == "undefined_variable")
            .collect();
        assert!(!undefined.is_empty());
    }

    #[test]
    fn test_define_variable_clears_issue() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "a * sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        let errors_before = s.issues.iter().filter(|i| i.severity == "error").count();
        // Define 'a'
        s.apply_action(
            SessionAction::SetVariable {
                name: "a".to_string(),
                value: 2.0,
            },
            "user",
        )
        .unwrap();
        let errors_after = s.issues.iter().filter(|i| i.severity == "error").count();
        assert!(errors_after < errors_before);
    }

    #[test]
    fn test_max_expressions() {
        let mut s = make_session();
        s.limits.max_expressions = 2;
        s.apply_action(
            SessionAction::AddExpression {
                expr: "sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "cos(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        let result = s.apply_action(
            SessionAction::AddExpression {
                expr: "tan(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_reset_session() {
        let mut s = make_session();
        s.apply_action(
            SessionAction::AddExpression {
                expr: "sin(x)".to_string(),
                color: None,
                plot_type: None,
                y_expr: None,
                domain: None,
                step: None,
                label: None,
                renderer: None,
            },
            "llm",
        )
        .unwrap();
        s.apply_action(
            SessionAction::SetVariable {
                name: "a".to_string(),
                value: 3.0,
            },
            "user",
        )
        .unwrap();
        s.apply_action(SessionAction::ResetSession, "user").unwrap();
        assert!(s.expressions.is_empty());
        assert!(s.variables.is_empty());
    }
}
