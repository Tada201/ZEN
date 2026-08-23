//! Calculator built-in tool (moved verbatim from src/tools/calculator.rs,
//! Phase 5). The only pure executor: implements the host-generic Tool trait
//! for every host, so it needs no tauri dependency.

use async_trait::async_trait;
use serde_json::json;
use crate::registry::{Tool, ToolError, ToolOutput};
use zen_security::risk::RiskLevel;

pub struct CalculatorTool;

// ── Expression evaluator ───────────────────────────────────────────────────

/// A minimal, safe expression token.
#[derive(Debug, Clone)]
enum Token {
    Number(f64),
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    LParen,
    RParen,
    Comma,
    Percent,
    Ident(String),
}

/// Tokenize an expression string into tokens.
fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let num_str: String = chars[start..i].iter().collect();
            let val: f64 = num_str
                .parse()
                .map_err(|_| format!("Invalid number: '{}'", num_str))?;
            tokens.push(Token::Number(val));
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let ident: String = chars[start..i].iter().collect();
            tokens.push(Token::Ident(ident.to_lowercase()));
            continue;
        }
        match c {
            '+' => tokens.push(Token::Plus),
            '-' => tokens.push(Token::Minus),
            '*' => tokens.push(Token::Star),
            '/' => tokens.push(Token::Slash),
            '^' => tokens.push(Token::Caret),
            '(' => tokens.push(Token::LParen),
            ')' => tokens.push(Token::RParen),
            ',' => tokens.push(Token::Comma),
            '%' => tokens.push(Token::Percent),
            other => return Err(format!("Unexpected character: '{}'", other)),
        }
        i += 1;
    }
    Ok(tokens)
}

/// A minimal recursive-descent parser for expressions.
/// Grammar:
///   expr     → term ( ('+' | '-') term )*
///   term     → power ( ('*' | '/') power )*
///   power    → unary ('^' unary)?
///   unary    → ('-') unary | primary
///   primary  → NUMBER | IDENT '(' expr (',' expr)* ')' | '(' expr ')' | IDENT
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<Token> {
        if self.pos < self.tokens.len() {
            let tok = self.tokens[self.pos].clone();
            self.pos += 1;
            Some(tok)
        } else {
            None
        }
    }

    fn expect(&mut self, msg: &str) -> Result<Token, String> {
        self.advance().ok_or_else(|| msg.to_string())
    }

    /// Parse a complete expression.
    fn parse(&mut self) -> Result<f64, String> {
        let val = self.parse_expr()?;
        if self.peek().is_some() {
            return Err("Unexpected trailing tokens after expression".to_string());
        }
        Ok(val)
    }

    fn parse_expr(&mut self) -> Result<f64, String> {
        let mut left = self.parse_term()?;
        while let Some(tok) = self.peek().cloned() {
            match tok {
                Token::Plus => {
                    self.advance();
                    let right = self.parse_term()?;
                    left += right;
                }
                Token::Minus => {
                    self.advance();
                    let right = self.parse_term()?;
                    left -= right;
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<f64, String> {
        let mut left = self.parse_power()?;
        while let Some(tok) = self.peek().cloned() {
            match tok {
                Token::Star => {
                    self.advance();
                    let right = self.parse_power()?;
                    left *= right;
                }
                Token::Slash => {
                    self.advance();
                    let right = self.parse_power()?;
                    if right == 0.0 {
                        return Err("Division by zero".to_string());
                    }
                    left /= right;
                }
                Token::Percent => {
                    self.advance();
                    // "X% of Y": convert to percentage
                    // e.g. "200 * 15%" → means 15% of 200
                    // So we treat `number %` alone as just the percentage
                    // and `expr % expr` is percentage-of
                    // If the next token is another expression, it's a percentage-of
                    if self.peek().is_some() {
                        // Try to parse the following expression as "of Y"
                        // We just multiply: left * (percentage / 100)
                        // But the percentage (left) might already be a number
                        // Actually, let's handle this differently:
                        // When we see N%, N is the percentage value
                        // If there's a following expression, it's "N% of expr"
                        // We'll leave left as a raw percentage marker and handle
                        // in a special way by interpreting percent as "left / 100"
                        left /= 100.0;
                        // If next token is an operand (number, ident, paren),
                        // it's "N% of expr" — multiply
                        if let Some(Token::Number(_) | Token::Ident(_) | Token::LParen) = self.peek() {
                            let of_val = self.parse_expr()?;
                            left *= of_val;
                        }
                    } else {
                        left /= 100.0;
                    }
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_power(&mut self) -> Result<f64, String> {
        let left = self.parse_unary()?;
        if let Some(Token::Caret) = self.peek() {
            self.advance();
            let right = self.parse_unary()?;
            return Ok(left.powf(right));
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<f64, String> {
        if let Some(Token::Minus) = self.peek() {
            self.advance();
            let val = self.parse_unary()?;
            return Ok(-val);
        }
        if let Some(Token::Plus) = self.peek() {
            self.advance();
            return self.parse_unary();
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<f64, String> {
        match self.expect("Expected expression")? {
            Token::Number(n) => Ok(n),
            Token::LParen => {
                let val = self.parse_expr()?;
                match self.expect("Expected ')' after expression")? {
                    Token::RParen => Ok(val),
                    _ => Err("Expected ')'".to_string()),
                }
            }
            Token::Ident(name) => {
                // Could be a constant or a function call
                if self
                    .peek()
                    .map(|t| matches!(t, Token::LParen))
                    .unwrap_or(false)
                {
                    self.advance(); // consume '('
                    let mut args = Vec::new();
                    if !self
                        .peek()
                        .map(|t| matches!(t, Token::RParen))
                        .unwrap_or(false)
                    {
                        args.push(self.parse_expr()?);
                        while self
                            .peek()
                            .map(|t| matches!(t, Token::Comma))
                            .unwrap_or(false)
                        {
                            self.advance(); // consume ','
                            args.push(self.parse_expr()?);
                        }
                    }
                    match self.expect("Expected ')' after function arguments")? {
                        Token::RParen => {}
                        _ => return Err("Expected ')'".to_string()),
                    }
                    call_function(&name, &args)
                } else {
                    // Constant
                    match name.as_str() {
                        "pi" => Ok(std::f64::consts::PI),
                        "e" => Ok(std::f64::consts::E),
                        _ => Err(format!("Unknown identifier: '{}'", name)),
                    }
                }
            }
            _ => Err("Expected a number, '(', or identifier".to_string()),
        }
    }
}

fn call_function(name: &str, args: &[f64]) -> Result<f64, String> {
    match name {
        "sqrt" => {
            if args.len() != 1 {
                return Err("sqrt() requires exactly 1 argument".to_string());
            }
            if args[0] < 0.0 {
                return Err("sqrt() of negative number".to_string());
            }
            Ok(args[0].sqrt())
        }
        "abs" => {
            if args.len() != 1 {
                return Err("abs() requires exactly 1 argument".to_string());
            }
            Ok(args[0].abs())
        }
        "round" => {
            if args.len() != 1 {
                return Err("round() requires exactly 1 argument".to_string());
            }
            Ok(args[0].round())
        }
        "ceil" => {
            if args.len() != 1 {
                return Err("ceil() requires exactly 1 argument".to_string());
            }
            Ok(args[0].ceil())
        }
        "floor" => {
            if args.len() != 1 {
                return Err("floor() requires exactly 1 argument".to_string());
            }
            Ok(args[0].floor())
        }
        "sin" => {
            if args.len() != 1 {
                return Err("sin() requires exactly 1 argument (radians)".to_string());
            }
            Ok(args[0].sin())
        }
        "cos" => {
            if args.len() != 1 {
                return Err("cos() requires exactly 1 argument (radians)".to_string());
            }
            Ok(args[0].cos())
        }
        "tan" => {
            if args.len() != 1 {
                return Err("tan() requires exactly 1 argument (radians)".to_string());
            }
            Ok(args[0].tan())
        }
        "log" | "ln" => {
            if args.len() != 1 {
                return Err("log/ln() requires exactly 1 argument".to_string());
            }
            if args[0] <= 0.0 {
                return Err("log() of non-positive number".to_string());
            }
            Ok(args[0].ln())
        }
        "log10" => {
            if args.len() != 1 {
                return Err("log10() requires exactly 1 argument".to_string());
            }
            if args[0] <= 0.0 {
                return Err("log10() of non-positive number".to_string());
            }
            Ok(args[0].log10())
        }
        "mean" | "average" => {
            if args.is_empty() {
                return Err("mean() requires at least 1 argument".to_string());
            }
            Ok(args.iter().sum::<f64>() / args.len() as f64)
        }
        "median" => {
            if args.is_empty() {
                return Err("median() requires at least 1 argument".to_string());
            }
            let mut sorted = args.to_vec();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let n = sorted.len();
            if n.is_multiple_of(2) {
                Ok((sorted[n / 2 - 1] + sorted[n / 2]) / 2.0)
            } else {
                Ok(sorted[n / 2])
            }
        }
        "stddev" | "stdev" => {
            if args.len() < 2 {
                return Err("stddev() requires at least 2 arguments".to_string());
            }
            let mean = args.iter().sum::<f64>() / args.len() as f64;
            let variance = args.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / args.len() as f64;
            Ok(variance.sqrt())
        }
        "min" => {
            if args.is_empty() {
                return Err("min() requires at least 1 argument".to_string());
            }
            args.iter()
                .cloned()
                .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .ok_or_else(|| "min() failed".to_string())
        }
        "max" => {
            if args.is_empty() {
                return Err("max() requires at least 1 argument".to_string());
            }
            args.iter()
                .cloned()
                .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .ok_or_else(|| "max() failed".to_string())
        }
        "sum" => {
            if args.is_empty() {
                return Err("sum() requires at least 1 argument".to_string());
            }
            Ok(args.iter().sum())
        }
        "count" => Ok(args.len() as f64),
        _ => Err(format!("Unknown function: '{}'", name)),
    }
}

/// Evaluate a math expression string safely.
fn eval_expression(expr: &str) -> Result<f64, String> {
    let tokens = tokenize(expr)?;
    if tokens.is_empty() {
        return Err("Empty expression".to_string());
    }
    let mut parser = Parser::new(tokens);
    let result = parser.parse()?;
    if result.is_nan() {
        return Err(
            "Expression produced NaN (not a number). Check for invalid operations like 0/0."
                .to_string(),
        );
    }
    if result.is_infinite() {
        return Err(
            "Expression overflowed to infinity. Try smaller or different values.".to_string(),
        );
    }
    Ok(result)
}

// ── Statistics helpers ─────────────────────────────────────────────────────

fn format_data_stats(data: &[f64]) -> serde_json::Value {
    if data.is_empty() {
        return json!({"error": "No data provided"});
    }
    let n = data.len() as f64;
    let sum: f64 = data.iter().sum();
    let mean = sum / n;
    let mut sorted = data.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = if sorted.len().is_multiple_of(2) {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    } else {
        sorted[sorted.len() / 2]
    };
    let variance = data.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let stddev = variance.sqrt();
    let min = data.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = data.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    json!({
        "count": data.len(),
        "sum": sum,
        "mean": mean,
        "median": median,
        "min": min,
        "max": max,
        "range": max - min,
        "stddev": stddev,
        "variance": variance,
    })
}

// ── Tool impl ──────────────────────────────────────────────────────────────

#[async_trait]
impl<A: Send + Sync + 'static> Tool<A> for CalculatorTool {
    fn name(&self) -> &str {
        "calculator"
    }

    fn description(&self) -> &str {
        "Performs mathematical calculations and statistical analysis. Supports arithmetic (+, -, *, /, ^), percentages, functions (sqrt, abs, round, ceil, floor, sin, cos, tan, log, ln), and statistics (mean, median, stddev, min, max, sum, count). Pass an expression string or set mode='stats' with a data array for descriptive statistics."
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "A mathematical expression to evaluate. Supports arithmetic (2 + 3 * 4), parentheses, percentages (15% of 200), power (2^3), functions like sqrt(144), abs(-5), round(3.7), mean(1,2,3), median(1,2,3), stddev(1,2,3,4,5), min, max, sum, count, sin, cos, tan, log, ln, log10, and constants pi, e. Example: '(mean(10,20,30) - 5) * 2'"
                },
                "mode": {
                    "type": "string",
                    "enum": ["auto", "expression", "stats"],
                    "description": "Defaults to 'auto'. 'expression' evaluates a math expression. 'stats' computes descriptive statistics on the provided data array.",
                    "default": "auto"
                },
                "data": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "Array of numbers for statistical analysis (mean, median, stddev, min, max, sum, count). Used when mode='stats' or in 'auto' mode."
                }
            },
            "required": ["expression"]
        })
    }

    fn risk_level(&self) -> RiskLevel {
        RiskLevel::Low
    }

    async fn execute(
        &self,
        _app: A,
        _chat_id: String,
        args: serde_json::Value,
    ) -> Result<ToolOutput, ToolError> {
        let expression = args
            .get("expression")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("auto");
        let data: Vec<f64> = args
            .get("data")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
            .unwrap_or_default();

        let trimmed = expression.trim();

        // If mode is 'stats' or expression is empty but data is provided
        if mode == "stats" || (trimmed.is_empty() && !data.is_empty()) {
            let stats = format_data_stats(&data);
            return Ok(ToolOutput {
                content: stats,
                metadata: None,
            });
        }

        // Evaluate the expression
        if trimmed.is_empty() {
            return Err(ToolError::InvalidArguments {
                details: "Expression is required. Provide a math expression like '2 + 2' or 'mean(1,2,3)' or set mode='stats' with a data array.".to_string(),
            });
        }

        // Check if the expression looks like it's trying to run code
        if trimmed.contains("unsafe") || trimmed.contains("std::") || trimmed.contains("fn ") {
            return Err(ToolError::InvalidArguments {
                details: "Only mathematical expressions are supported. Use basic arithmetic, functions, and statistical operations.".to_string(),
            });
        }

        match eval_expression(trimmed) {
            Ok(result) => {
                let mut output = json!({
                    "expression": trimmed,
                    "result": result,
                });
                // If data was also provided, include basic stats too
                if !data.is_empty() {
                    let stats = format_data_stats(&data);
                    if let Some(obj) = output.as_object_mut() {
                        obj.insert("data_stats".to_string(), stats);
                    }
                }
                Ok(ToolOutput {
                    content: output,
                    metadata: None,
                })
            }
            Err(e) => Err(ToolError::ExecutionFailed {
                message: format!("Failed to evaluate '{}': {}", trimmed, e),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_arithmetic() {
        assert_eq!(eval_expression("2 + 3").unwrap(), 5.0);
        assert_eq!(eval_expression("10 - 4").unwrap(), 6.0);
        assert_eq!(eval_expression("3 * 4").unwrap(), 12.0);
        assert_eq!(eval_expression("10 / 2").unwrap(), 5.0);
    }

    #[test]
    fn operator_precedence() {
        assert_eq!(eval_expression("2 + 3 * 4").unwrap(), 14.0);
        assert_eq!(eval_expression("(2 + 3) * 4").unwrap(), 20.0);
    }

    #[test]
    fn power() {
        assert_eq!(eval_expression("2 ^ 3").unwrap(), 8.0);
        assert_eq!(eval_expression("2 ^ 0.5").unwrap(), 2.0f64.sqrt());
    }

    #[test]
    fn unary_minus() {
        assert_eq!(eval_expression("-5 + 3").unwrap(), -2.0);
        assert_eq!(eval_expression("-(5 + 3)").unwrap(), -8.0);
    }

    #[test]
    fn percentages() {
        let result = eval_expression("15%").unwrap();
        assert!((result - 0.15).abs() < 1e-10);
    }

    #[test]
    fn percentage_of() {
        // 15% of 200 = 30
        let result = eval_expression("200 * 15%").unwrap();
        assert!((result - 30.0).abs() < 1e-10);
    }

    #[test]
    fn nan_guard() {
        assert!(eval_expression("0 / 0").is_err());
    }

    #[test]
    fn infinity_guard() {
        assert!(eval_expression("1e999").is_err());
    }

    #[test]
    fn functions_sqrt() {
        assert_eq!(eval_expression("sqrt(144)").unwrap(), 12.0);
    }

    #[test]
    fn functions_mean() {
        assert_eq!(eval_expression("mean(1,2,3,4,5)").unwrap(), 3.0);
    }

    #[test]
    fn functions_median_odd() {
        assert_eq!(eval_expression("median(1,3,5,7,9)").unwrap(), 5.0);
    }

    #[test]
    fn functions_median_even() {
        assert_eq!(eval_expression("median(1,2,3,4)").unwrap(), 2.5);
    }

    #[test]
    fn functions_stddev() {
        // stddev of [1,2,3,4,5] = sqrt(2) ≈ 1.414
        let result = eval_expression("stddev(1,2,3,4,5)").unwrap();
        assert!((result - 2.0f64.sqrt()).abs() < 1e-10);
    }

    #[test]
    fn constants_pi() {
        let result = eval_expression("pi").unwrap();
        assert!((result - std::f64::consts::PI).abs() < 1e-10);
    }

    #[test]
    fn constants_e() {
        let result = eval_expression("e").unwrap();
        assert!((result - std::f64::consts::E).abs() < 1e-10);
    }

    #[test]
    fn complex_expression() {
        let result = eval_expression("(mean(10,20,30) - 5) * 2").unwrap();
        assert_eq!(result, 30.0);
    }

    #[test]
    fn division_by_zero() {
        assert!(eval_expression("10 / 0").is_err());
    }

    #[test]
    fn format_data_stats_test() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let stats = format_data_stats(&data);
        assert_eq!(stats["count"], 5);
        assert_eq!(stats["mean"], 3.0);
        assert_eq!(stats["sum"], 15.0);
        assert_eq!(stats["min"], 1.0);
        assert_eq!(stats["max"], 5.0);
        assert_eq!(stats["range"], 4.0);
    }

    #[test]
    fn empty_data_stats() {
        let data: Vec<f64> = vec![];
        let stats = format_data_stats(&data);
        assert_eq!(stats["error"], "No data provided");
    }
}
