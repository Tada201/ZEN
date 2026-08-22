use anyhow::{bail, Result};
/// Math Plot Engine - Parametric, Function, and Polar Plotting
/// Enables precise curve generation from mathematical expressions
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlotType {
    /// y = f(x)
    #[serde(rename = "function")]
    Function,
    /// x = f(t), y = g(t)
    #[serde(rename = "parametric")]
    Parametric,
    /// r = f(θ)
    #[serde(rename = "polar")]
    Polar,
    /// y > f(x) or y < f(x)
    #[serde(rename = "inequality")]
    Inequality,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotRequest {
    /// Type of plot
    pub plot_type: PlotType,

    /// Expression to evaluate:
    /// - For Function: y = f(x) — the expression defines y in terms of x variable
    /// - For Parametric: x = f(t) — the expression defines x in terms of t variable
    /// - For Polar: r = f(θ) — the expression defines radius in terms of theta variable
    /// - For Inequality: y >/< f(x) — the expression defines the boundary function
    pub x_expr: String,

    /// For Parametric: y expression (e.g. "sin(t)")
    pub y_expr: Option<String>,

    /// Domain/range for the independent variable: [start, end]
    pub domain: [f64; 2],

    /// Sampling step size
    #[serde(default = "default_step")]
    pub step: f64,

    /// Maximum points to generate (safety limit)
    #[serde(default = "default_max_points")]
    pub max_points: usize,

    /// Variables to bind during evaluation (e.g. {"a": 2.5})
    #[serde(default)]
    pub variables: std::collections::HashMap<String, f64>,

    /// For Inequality: the operator ">", "<", ">=", "<="
    #[serde(default)]
    pub inequality_op: Option<String>,
}

fn default_step() -> f64 {
    0.01 // finer default for smooth curves
}

fn default_max_points() -> usize {
    5000 // Reduced for real-time browser rendering safety
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotOutput {
    /// Generated points in math coordinates: [[x1, y1], [x2, y2], ...]
    /// NaN values indicate discontinuities (pen lift)
    pub points: Vec<[f64; 2]>,
    /// Number of finite points
    pub point_count: usize,
    /// Computed bounding box [x_min, y_min, x_max, y_max]
    pub bounds: [f64; 4],
    /// For Inequality: the operator ">", "<", ">=", "<="
    #[serde(default)]
    pub inequality_op: Option<String>,
}

/// Normalize Unicode math symbols to ASCII equivalents for meval compatibility.
/// Converts: π → pi, θ → theta, × → *, ÷ → /, ≤ → <=, ≥ => >=, ≠ => !=
fn normalize_unicode(expr: &str) -> String {
    expr.replace('π', "pi")
        .replace('θ', "theta")
        .replace('×', "*")
        .replace('÷', "/")
        .replace('≤', "<=")
        .replace('≥', ">=")
        .replace('≠', "!=")
}

/// Evaluate a math expression string with given variable bindings.
/// Uses meval for proper parsing (sin, cos, tan, sqrt, abs, ln, log2, floor, etc.)
pub fn eval_expr(expr: &str, vars: &std::collections::HashMap<String, f64>) -> Result<f64> {
    // Normalize Unicode symbols to ASCII before evaluation
    let normalized = normalize_unicode(expr);

    let mut ctx = meval::Context::new();
    for (name, val) in vars {
        ctx.var(name.clone(), *val);
    }
    // meval needs `pi` and `e` as built-in vars
    ctx.var("pi", std::f64::consts::PI);
    ctx.var("e", std::f64::consts::E);

    let result = meval::eval_str_with_context(&normalized, ctx)
        .map_err(|e| anyhow::anyhow!("Expression error in '{}': {}", expr, e))?;
    Ok(result)
}

/// Generate plot points from mathematical expressions.
/// Returns math-space coordinates ready for frontend rendering.
pub fn generate_plot(request: &PlotRequest) -> Result<PlotOutput> {
    let [start, end] = request.domain;
    if start >= end {
        bail!("domain start must be less than end");
    }
    let step = request.step.max(1e-6);

    let est_points = ((end - start) / step).ceil() as usize + 1;
    if est_points > request.max_points {
        bail!(
            "Too many points ({est_points}). Reduce range or increase step size. Max: {}",
            request.max_points
        );
    }

    let mut points: Vec<[f64; 2]> = Vec::with_capacity(est_points);
    let mut x_min = f64::INFINITY;
    let mut x_max = f64::NEG_INFINITY;
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;

    // Build variable map from request (including loop variable injected per iteration)
    let base_vars: std::collections::HashMap<String, f64> = request.variables.clone();

    let mut param = start;
    let mut finite_count = 0usize;
    // Track y-range dynamically for viewport-relative discontinuity detection
    let mut y_values_seen: Vec<f64> = Vec::with_capacity(est_points);

    loop {
        if param > end + step * 0.5 {
            break;
        }

        let (x, y) = match request.plot_type {
            PlotType::Function | PlotType::Inequality => {
                let mut vars = base_vars.clone();
                vars.insert("x".to_string(), param);
                let y = eval_expr(&request.x_expr, &vars)?;
                (param, y)
            }
            PlotType::Parametric => {
                let mut vars = base_vars.clone();
                vars.insert("t".to_string(), param);
                let x = eval_expr(&request.x_expr, &vars)?;
                let y_expr = request
                    .y_expr
                    .as_deref()
                    .ok_or_else(|| anyhow::anyhow!("Parametric plot requires y_expr"))?;
                let y = eval_expr(y_expr, &vars)?;
                (x, y)
            }
            PlotType::Polar => {
                let mut vars = base_vars.clone();
                vars.insert("theta".to_string(), param);
                let r = eval_expr(&request.x_expr, &vars)?;
                let x = r * param.cos();
                let y = r * param.sin();
                (x, y)
            }
        };

        if x.is_finite() && y.is_finite() {
            // Detect discontinuities using viewport-relative threshold
            // Jump is significant if it exceeds 10% of current y-range or 50 units (whichever is larger)
            if let Some(last) = points.last() {
                if last[0].is_finite() && last[1].is_finite() {
                    let dy = (y - last[1]).abs();
                    let dx = (x - last[0]).abs();

                    // Compute dynamic threshold based on observed y-range
                    let y_range = if !y_values_seen.is_empty() {
                        let y_min_seen =
                            y_values_seen.iter().cloned().fold(f64::INFINITY, f64::min);
                        let y_max_seen = y_values_seen
                            .iter()
                            .cloned()
                            .fold(f64::NEG_INFINITY, f64::max);
                        (y_max_seen - y_min_seen).max(50.0)
                    } else {
                        50.0
                    };

                    let threshold = (y_range * 0.1).max(50.0);

                    // If vertical jump exceeds threshold with small horizontal step, insert pen lift
                    if dy > threshold && dx < step * 2.0 {
                        points.push([f64::NAN, f64::NAN]);
                    }
                }
            }

            y_values_seen.push(y);

            // Track bounds
            if x < x_min {
                x_min = x;
            }
            if x > x_max {
                x_max = x;
            }
            if y < y_min {
                y_min = y;
            }
            if y > y_max {
                y_max = y;
            }
            finite_count += 1;
            points.push([x, y]);
        } else {
            // NaN sentinel = discontinuity marker (pen lift)
            points.push([f64::NAN, f64::NAN]);
        }

        param += step;
    }

    if finite_count == 0 {
        bail!("No valid points generated — expression may be undefined over the domain");
    }

    let bounds = if x_min.is_finite() {
        [x_min, y_min, x_max, y_max]
    } else {
        [-10.0, -10.0, 10.0, 10.0]
    };

    Ok(PlotOutput {
        point_count: finite_count,
        points,
        bounds,
        inequality_op: request.inequality_op.clone(),
    })
}

/// Simplify path by removing near-duplicate points (Douglas-Peucker light pass)
pub fn simplify_path(points: &[[f64; 2]], tolerance: f64) -> Vec<[f64; 2]> {
    if points.len() <= 2 {
        return points.to_vec();
    }

    let mut simplified = vec![points[0]];

    for current in points.iter().copied().skip(1) {
        let last = simplified[simplified.len() - 1];

        // Always keep NaN sentinels
        if current[0].is_nan() || current[1].is_nan() {
            simplified.push(current);
            continue;
        }
        if last[0].is_nan() || last[1].is_nan() {
            simplified.push(current);
            continue;
        }

        let dx = current[0] - last[0];
        let dy = current[1] - last[1];
        let dist = (dx * dx + dy * dy).sqrt();

        if dist > tolerance {
            simplified.push(current);
        }
    }

    simplified
}

/// Validate an expression string is safe (no code injection)
pub fn validate_expression_safety(expr: &str) -> Result<()> {
    // Block suspicious patterns
    let forbidden = [
        ";", "__", "eval", "exec", "import", "system", "unsafe", "drop",
    ];
    for f in &forbidden {
        if expr.contains(f) {
            bail!("Expression contains forbidden pattern: '{}'", f);
        }
    }

    // Allowlist chars: letters, digits, operators, parens, dot, comma, space, underscore, tilde
    let allowed: &str =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/^().,= _πθ~";
    for ch in expr.chars() {
        if !allowed.contains(ch) {
            bail!("Expression contains disallowed character: '{}'", ch);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simplify_path() {
        let points = vec![
            [0.0, 0.0],
            [0.5, 0.5], // close to first — should be removed
            [100.0, 100.0],
            [100.3, 100.2], // close to middle — should be removed
            [200.0, 0.0],
        ];
        let simplified = simplify_path(&points, 1.0);
        assert!(simplified.len() < points.len());
    }

    #[test]
    fn test_eval_constant() {
        let vars = std::collections::HashMap::new();
        let result = eval_expr("42", &vars).unwrap();
        assert!((result - 42.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_sin() {
        let mut vars = std::collections::HashMap::new();
        vars.insert("x".to_string(), std::f64::consts::FRAC_PI_2);
        let result = eval_expr("sin(x)", &vars).unwrap();
        assert!((result - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_with_variable() {
        let mut vars = std::collections::HashMap::new();
        vars.insert("a".to_string(), 3.0);
        vars.insert("x".to_string(), 2.0);
        let result = eval_expr("a * x + 1", &vars).unwrap();
        assert!((result - 7.0).abs() < 1e-10);
    }

    #[test]
    fn test_generate_function_plot() {
        let req = PlotRequest {
            plot_type: PlotType::Function,
            x_expr: "sin(x)".to_string(),
            y_expr: None,
            domain: [0.0, std::f64::consts::TAU],
            step: 0.1,
            max_points: 1000,
            variables: Default::default(),
            inequality_op: None,
        };
        let output = generate_plot(&req).unwrap();
        assert!(output.point_count > 0);
        assert!(output.bounds[2] > output.bounds[0]); // x_max > x_min
    }

    #[test]
    fn test_validate_safety_ok() {
        assert!(validate_expression_safety("a * sin(x) + 2").is_ok());
    }

    #[test]
    fn test_validate_safety_block() {
        assert!(validate_expression_safety("y=x; rm -rf /").is_err());
    }

    #[test]
    fn test_default_step() {
        assert_eq!(default_step(), 0.01);
    }

    #[test]
    fn test_default_max_points() {
        assert_eq!(default_max_points(), 5000);
    }

    #[test]
    fn test_normalize_unicode() {
        assert_eq!(normalize_unicode("π * 2"), "pi * 2");
        assert_eq!(normalize_unicode("θ + π"), "theta + pi");
        assert_eq!(normalize_unicode("2 × 3"), "2 * 3");
        assert_eq!(normalize_unicode("6 ÷ 2"), "6 / 2");
        assert_eq!(normalize_unicode("x ≤ 5"), "x <= 5");
        assert_eq!(normalize_unicode("x ≥ 0"), "x >= 0");
    }

    #[test]
    fn test_eval_unicode_pi() {
        let vars = std::collections::HashMap::new();
        // Test that π is normalized to pi and evaluated correctly
        let result = eval_expr("π", &vars).unwrap();
        assert!((result - std::f64::consts::PI).abs() < 1e-10);
    }
}
