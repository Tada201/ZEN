use std::collections::HashMap;

const NEON_COLORS: &[&str] = &[
    "#00FF9F", "#FF2266", "#FFCC00", "#00CCFF", "#FF6B00", "#AA44FF", "#39FF14", "#FF44AA",
];

pub(super) fn next_color(used_count: usize) -> String {
    NEON_COLORS[used_count % NEON_COLORS.len()].to_string()
}

/// Extract variable name dependencies from an expression.
pub(super) fn extract_dependencies(expr: &str, known_vars: &HashMap<String, f64>) -> Vec<String> {
    let builtins = [
        "sin", "cos", "tan", "sqrt", "abs", "ln", "log2", "floor", "ceil", "exp", "pi", "e", "x",
        "t", "theta",
    ];

    let tokens: Vec<&str> = expr
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| !s.is_empty() && s.chars().next().map(|c| c.is_alphabetic()).unwrap_or(false))
        .collect();

    let mut deps = Vec::new();
    for tok in tokens {
        if !builtins.contains(&tok)
            && (known_vars.contains_key(tok) || !is_builtin_func(tok))
            && !deps.contains(&tok.to_string())
        {
            deps.push(tok.to_string());
        }
    }
    deps
}

fn is_builtin_func(name: &str) -> bool {
    matches!(
        name,
        "sin"
            | "cos"
            | "tan"
            | "asin"
            | "acos"
            | "atan"
            | "atan2"
            | "sqrt"
            | "abs"
            | "ln"
            | "log"
            | "log2"
            | "log10"
            | "exp"
            | "floor"
            | "ceil"
            | "round"
            | "min"
            | "max"
            | "pi"
            | "e"
    )
}

pub(super) fn parse_operator(expr: &str) -> Option<String> {
    let ops = ["<=", ">=", "==", "=", "<", ">"];
    for op in ops.iter() {
        if expr.contains(op) {
            if *op == "=" || *op == "==" {
                return None;
            }
            return Some(op.to_string());
        }
    }
    None
}

/// Parse the LHS of "y = expr" (variable name before =), else empty.
pub(super) fn parse_lhs(expr: &str) -> String {
    let ops = ["<=", ">=", "==", "=", "<", ">"];
    for op in ops.iter() {
        if let Some(pos) = expr.find(op) {
            return expr[..pos].trim().to_string();
        }
    }
    String::new()
}

/// Parse the RHS of "y = expr" or "f(x) = expr", else return as-is.
pub(super) fn parse_rhs(expr: &str) -> String {
    let ops = ["<=", ">=", "==", "=", "<", ">"];
    for op in ops.iter() {
        if let Some(pos) = expr.find(op) {
            return expr[pos + op.len()..].trim().to_string();
        }
    }
    expr.trim().to_string()
}

pub(super) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
