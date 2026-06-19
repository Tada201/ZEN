use std::sync::{Arc, Mutex as StdMutex};

use tracing::info;

use super::engine::IterativeDeepResearcher;
use crate::db::models::ChatMessage;
use crate::llm::LlmChunk;

// ── LLM helper ─────────────────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Make an LLM call with the given user prompt and collect the full text
    /// response. Uses a synchronous Mutex since the on_chunk callback is Fn
    /// (not async). Automatically strips thinking/reasoning tags.
    pub(super) async fn call_llm(
        &self,
        prompt: &str,
        temperature: f64,
        max_tokens: usize,
        timeout_secs: u64,
    ) -> Result<String, String> {
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
            reasoning_details: None,
            images: None,
            tool_calls: None,
            tool_call_id: None,
        }];

        let mut config = self.config.clone();
        config.temperature = Some(temperature);
        config.max_tokens = Some(max_tokens as i64);

        let full_response: Arc<StdMutex<String>> = Arc::new(StdMutex::new(String::new()));
        let response_clone = full_response.clone();

        let on_chunk = Box::new(move |chunk: LlmChunk| {
            if let LlmChunk::Text(text) = chunk {
                if let Ok(mut resp) = response_clone.lock() {
                    resp.push_str(&text);
                }
            }
        });

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            self.llm_provider.chat_stream(
                self.model,
                messages,
                None, // no tools for internal research calls
                config,
                on_chunk,
                self.token.clone(),
            ),
        )
        .await;

        match result {
            Ok(Ok(_chat_response)) => {
                let text =
                    full_response.lock().map_err(|e| format!("Mutex poisoned: {}", e))?;
                if text.is_empty() {
                    Err("LLM returned empty response".to_string())
                } else {
                    // Strip thinking/reasoning blocks before returning
                    let cleaned = Self::strip_thinking(&text);
                    if cleaned.is_empty() {
                        Err("LLM returned empty response".to_string())
                    } else {
                        Ok(cleaned)
                    }
                }
            }
            Ok(Err(e)) => Err(format!("LLM call failed: {}", e)),
            Err(_) => Err(format!("LLM call timed out after {}s", timeout_secs)),
        }
    }
}

// ── Text parsing helpers ───────────────────────────────────────────────────

impl<'a> IterativeDeepResearcher<'a> {
    /// Strip thinking / reasoning blocks from LLM output.
    ///
    /// Handles common formats:
    /// - `<think>...</think>`
    /// - `{thinking}...{/thinking}`
    /// - `[think]...[/think]`
    /// - `[thinking]...[/thinking]`
    /// - `{think}...{/think}`
    /// - `⟪...⟫` (CoT delimiters)
    pub(super) fn strip_thinking(text: &str) -> String {
        let mut result = text.to_string();
        // Ordered from most specific to least specific
        let pairs = [
            ("<think>", "</think>"),
            ("<thinking>", "</thinking>"),
            ("{thinking}", "{/thinking}"),
            ("[think]", "[/think]"),
            ("[thinking]", "[/thinking]"),
            ("{think}", "{/think}"),
            ("⟪", "⟫"),
        ];
        for (open, close) in &pairs {
            loop {
                let start = result.find(open);
                let end = result.find(close);
                match (start, end) {
                    (Some(s), Some(e)) if e > s => {
                        result.replace_range(s..=e + close.len() - 1, "");
                    }
                    _ => break,
                }
            }
        }
        result.trim().to_string()
    }

    /// Strip surrounding ```json or ``` code fences from text.
    pub(super) fn strip_code_block(text: &str) -> String {
        let text = text.trim();
        if text.starts_with("```") {
            let inner = text
                .strip_prefix("```json")
                .or_else(|| text.strip_prefix("```"))
                .unwrap_or(text);
            inner.strip_suffix("```").unwrap_or(inner).trim().to_string()
        } else {
            text.to_string()
        }
    }

    /// Parse a JSON array of strings, with fallback recovery for truncated output.
    #[allow(clippy::needless_collect)]
    pub(super) fn parse_json_array(text: &str) -> Vec<String> {
        let cleaned = Self::strip_code_block(text);

        // Try direct parse
        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&cleaned) {
            return parsed;
        }

        // Try greedy match for outermost array
        if let Some(start) = cleaned.find('[') {
            if cleaned[start..].contains(']') {
                let end = start + cleaned[start..].rfind(']').unwrap();
                let slice = &cleaned[start..=end];
                if let Ok(parsed) = serde_json::from_str::<Vec<String>>(slice) {
                    return parsed;
                }
                // Last resort: recover incomplete items from truncated array
                let items: Vec<String> = slice
                    .split('"')
                    .enumerate()
                    .filter(|(i, _)| i % 2 == 1)
                    .map(|(_, s)| s.to_string())
                    .collect();
                if !items.is_empty() {
                    info!("Recovered {} items from truncated JSON array", items.len());
                    return items;
                }
            }
        }

        info!(
            "Could not parse JSON array from: {}",
            &text[..text.len().min(200)]
        );
        Vec::new()
    }

    /// Parse a JSON object from LLM output, with fallback for code fences.
    pub(super) fn parse_json_object(text: &str) -> Option<serde_json::Value> {
        let cleaned = Self::strip_code_block(text);
        // Try direct parse
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&cleaned) {
            if val.is_object() {
                return Some(val);
            }
        }
        // Greedy match for outermost object
        if let Some(start) = cleaned.find('{') {
            if let Some(end) = cleaned[start..].rfind('}') {
                let end = start + end;
                let slice = &cleaned[start..=end];
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(slice) {
                    if val.is_object() {
                        return Some(val);
                    }
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::IterativeDeepResearcher;

    // ── strip_thinking ────────────────────────────────────────────────────

    #[test]
    fn strip_think_xml_tags() {
        let input = "Before<think>This is a reasoning step</think>After";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "BeforeAfter");
    }

    #[test]
    fn strip_thinking_long_tags() {
        let input = "Hello<thinking>deep reasoning here</thinking>World";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "HelloWorld");
    }

    #[test]
    fn strip_thinking_brace_tags() {
        let input = "A{thinking}nested thought{/thinking}B";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "AB");
    }

    #[test]
    fn strip_think_bracket_tags() {
        let input = "X[think]reasoning[/think]Y";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "XY");
    }

    #[test]
    fn strip_thinking_bracket_tags() {
        let input = "X[thinking]reasoning[/thinking]Y";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "XY");
    }

    #[test]
    fn strip_think_brace_short() {
        let input = "X{think}thinking{/think}Y";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "XY");
    }

    #[test]
    fn strip_cot_delimiters() {
        let input = "before⟪chain of thought⟫after";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "beforeafter");
    }

    #[test]
    fn strip_multiple_thinking_blocks() {
        let input = "Start<think>first</think>middle<think>second</think>End";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "StartmiddleEnd");
    }

    #[test]
    fn strip_thinking_trims_whitespace() {
        let input = "  <think>reasoning</think>  result  ";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "result");
    }

    #[test]
    fn strip_thinking_no_tags_passthrough() {
        let input = "Hello world, this is a normal response.";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, input.trim());
    }

    #[test]
    fn strip_thinking_unmatched_tags_left_alone() {
        // Unclosed thinking tag should not cause issues
        let input = "Some text<think>unclosed";
        let result = IterativeDeepResearcher::strip_thinking(input);
        assert_eq!(result, "Some text<think>unclosed");
    }

    #[test]
    fn strip_thinking_nested_tags_partial() {
        // Nested tag with different format — should strip outer only
        let input = "A<think>inner{thinking}stuff{/thinking}</think>B";
        let result = IterativeDeepResearcher::strip_thinking(input);
        // Outer think tags stripped, inner thinking tags still inside the stripped region
        assert_eq!(result, "AB");
    }

    // ── strip_code_block ──────────────────────────────────────────────────

    #[test]
    fn strip_json_code_block() {
        let input = "```json\n{\"key\": \"value\"}\n```";
        let result = IterativeDeepResearcher::strip_code_block(input);
        assert_eq!(result, "{\"key\": \"value\"}");
    }

    #[test]
    fn strip_code_block_no_language() {
        let input = "```\nplain code block\n```";
        let result = IterativeDeepResearcher::strip_code_block(input);
        assert_eq!(result, "plain code block");
    }

    #[test]
    fn strip_code_block_no_fence() {
        let input = "Just regular text with no code block.";
        let result = IterativeDeepResearcher::strip_code_block(input);
        assert_eq!(result, "Just regular text with no code block.");
    }

    #[test]
    fn strip_code_block_other_language() {
        let input = "```python\nprint(\"hello\")\n```";
        let result = IterativeDeepResearcher::strip_code_block(input);
        assert_eq!(result, "print(\"hello\")");
    }

    #[test]
    fn strip_code_block_trims_whitespace() {
        let input = "  ```json\n[1, 2, 3]\n```  ";
        let result = IterativeDeepResearcher::strip_code_block(input);
        assert_eq!(result, "[1, 2, 3]");
    }

    // ── parse_json_array ─────────────────────────────────────────────────

    #[test]
    fn parse_valid_json_array() {
        let input = r#"["query one", "query two", "query three"]"#;
        let result = IterativeDeepResearcher::parse_json_array(input);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "query one");
        assert_eq!(result[1], "query two");
        assert_eq!(result[2], "query three");
    }

    #[test]
    fn parse_json_array_with_code_fence() {
        let input = "```json\n[\"a\", \"b\"]\n```";
        let result = IterativeDeepResearcher::parse_json_array(input);
        assert_eq!(result, vec!["a", "b"]);
    }

    #[test]
    fn parse_json_array_greedy_recovery() {
        // Text before and after the array should be ignored
        let input = "Here are the queries: [\"q1\", \"q2\"] that's all.";
        let result = IterativeDeepResearcher::parse_json_array(input);
        assert_eq!(result, vec!["q1", "q2"]);
    }

    #[test]
    fn parse_json_array_truncated_recovery() {
        // Simulate truncated output where the array is incomplete but recoverable
        let input = "[\"item1\", \"item2\", \"item3";
        let result = IterativeDeepResearcher::parse_json_array(input);
        // Should recover what it can
        assert!(!result.is_empty());
        assert!(result.contains(&"item1".to_string()));
    }

    #[test]
    fn parse_json_array_empty_result() {
        let result = IterativeDeepResearcher::parse_json_array("No array here");
        assert!(result.is_empty());
    }

    #[test]
    fn parse_json_array_empty_array() {
        let result = IterativeDeepResearcher::parse_json_array("[]");
        assert!(result.is_empty());
    }

    #[test]
    fn parse_json_array_single_element() {
        let result = IterativeDeepResearcher::parse_json_array(r#"["only one"]"#);
        assert_eq!(result, vec!["only one"]);
    }

    // ── parse_json_object ─────────────────────────────────────────────────

    #[test]
    fn parse_valid_json_object() {
        let input = r#"{"rational": "relevant", "evidence": "some text", "summary": "short"}"#;
        let result = IterativeDeepResearcher::parse_json_object(input);
        assert!(result.is_some());
        let obj = result.unwrap();
        assert_eq!(obj["rational"], "relevant");
        assert_eq!(obj["summary"], "short");
    }

    #[test]
    fn parse_json_object_with_code_fence() {
        let input = "```json\n{\"key\": \"value\"}\n```";
        let result = IterativeDeepResearcher::parse_json_object(input);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["key"], "value");
    }

    #[test]
    fn parse_json_object_greedy_recovery() {
        // Text before and after the object should be ignored
        let input = "Output: {\"count\": 42} End.";
        let result = IterativeDeepResearcher::parse_json_object(input);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["count"], 42);
    }

    #[test]
    fn parse_json_object_non_object_returns_none() {
        // A JSON array is not an object
        let result = IterativeDeepResearcher::parse_json_object("[1, 2, 3]");
        assert!(result.is_none());
    }

    #[test]
    fn parse_json_object_invalid_returns_none() {
        let result = IterativeDeepResearcher::parse_json_object("not json at all");
        assert!(result.is_none());
    }

    #[test]
    fn parse_json_object_empty_returns_none() {
        let result = IterativeDeepResearcher::parse_json_object("");
        assert!(result.is_none());
    }

    // ── Chain integration: strip + code_block + parse ─────────────────────

    #[test]
    fn strip_then_parse_json_array() {
        let input = "<think>reasoning</think>```json\n[\"a\", \"b\"]\n```";
        let cleaned = IterativeDeepResearcher::strip_thinking(input);
        let result = IterativeDeepResearcher::parse_json_array(&cleaned);
        assert_eq!(result, vec!["a", "b"]);
    }

    #[test]
    fn strip_then_parse_json_object() {
        let input = "Here is the result {\"key\": \"value\"}";
        let cleaned = IterativeDeepResearcher::strip_thinking(input);
        let result = IterativeDeepResearcher::parse_json_object(&cleaned);
        assert!(result.is_some());
    }
}
