//! CALCULATOR: quantitative analysis over collected findings.

use serde_json::json;
use tracing::info;

use super::super::engine::IterativeDeepResearcher;

// ── CALCULATOR: Quantitative analysis helper ──────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Run the calculator tool with a math expression and return the result.
    pub(in super::super) async fn calculate(&self, expression: &str) -> Option<serde_json::Value> {
        let tool_call = crate::tools::ToolCall {
            id: format!("dr-calc-{}", uuid::Uuid::new_v4()),
            name: "calculator".to_string(),
            arguments: json!({"expression": expression}),
        };

        // Race the tool call against the cancellation token.
        let result = tokio::select! {
            result = self.ctx.tool_service.execute_interactive(
                self.app.clone(),
                "deep_research",
                self.chat_id.to_string(),
                tool_call,
            ) => result,
            _ = self.token.cancelled() => {
                info!("Deep research cancelled, aborting calculator call");
                return None;
            }
        };

        match result {
            Ok(content) => Some(content),
            Err(e) => {
                info!("Calculator call failed for '{}': {}", expression, e);
                None
            }
        }
    }

    /// Extract numeric values from findings and compute descriptive statistics.
    /// Returns a formatted string with calculator results, or empty string if
    /// no numeric data is found.
    pub(in super::super) async fn analyze_numeric_findings(&self) -> String {
        // Collect all numeric values from finding summaries and evidence
        let mut numbers: Vec<f64> = Vec::new();
        for finding in &self.findings {
            // Extract numbers from summary and evidence text
            for text in [&finding.summary, &finding.evidence] {
                // Find all numbers (integers and decimals) in the text
                let mut pos = 0;
                let chars: Vec<char> = text.chars().collect();
                while pos < chars.len() {
                    if chars[pos].is_ascii_digit() || chars[pos] == '.' {
                        let start = pos;
                        while pos < chars.len()
                            && (chars[pos].is_ascii_digit()
                                || chars[pos] == '.'
                                || chars[pos] == ',')
                        {
                            if chars[pos] == ',' {
                                pos += 1;
                                continue;
                            }
                            pos += 1;
                        }
                        let num_str: String = chars[start..pos].iter().collect();
                        if let Ok(n) = num_str.parse::<f64>() {
                            // Filter: reasonable data values (not years, small counts, or huge numbers)
                            if (n > 0.01
                                && n < 1_000_000_000.0
                                && n != num_str.parse::<f64>().unwrap_or(0.0).round())
                                || (n > 0.0 && n < 1_000_000.0 && num_str.len() >= 3)
                            {
                                numbers.push(n);
                            }
                        }
                    } else {
                        pos += 1;
                    }
                }
            }
        }

        if numbers.len() < 3 {
            return String::new();
        }

        // Deduplicate and sort
        numbers.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        numbers.dedup();

        // Run calculator statistics on the collected numbers
        let num_strs: Vec<String> = numbers.iter().map(|n| n.to_string()).collect();
        let expr = format!("mean({})", num_strs.join(","));

        let mean_result = self.calculate(&expr).await;
        let median_result = self
            .calculate(&format!("median({})", num_strs.join(",")))
            .await;
        let stddev_result = self
            .calculate(&format!("stddev({})", num_strs.join(",")))
            .await;
        let sum_result = self
            .calculate(&format!("sum({})", num_strs.join(",")))
            .await;

        let mut output = String::from("\n\n**Calculator Analysis — Extracted Data Points:**\n");
        output.push_str(&format!("Data points found: {}\n", numbers.len()));
        output.push_str(&format!(
            "Values: {} ... {}\n",
            numbers.first().unwrap_or(&0.0),
            numbers.last().unwrap_or(&0.0)
        ));

        if let Some(val) = mean_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Mean: {:.2}\n", val));
        }
        if let Some(val) = median_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Median: {:.2}\n", val));
        }
        if let Some(val) = stddev_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Std Dev: {:.2}\n", val));
        }
        if let Some(val) = sum_result.and_then(|v| v.get("result").and_then(|r| r.as_f64())) {
            output.push_str(&format!("Sum: {:.2}\n", val));
        }

        output
    }
}
