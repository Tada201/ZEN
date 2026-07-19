//! Dynamic context window discovery from provider overflow errors.
//!
//! When a provider returns a "context length exceeded" error, the error message
//! typically includes the exact token limit. We parse that limit, cache it per
//! model ID, and use it as a fallback when the provider's `/v1/models` endpoint
//! does not return `context_length`.

use dashmap::DashMap;
use lazy_static::lazy_static;
use regex::Regex;
use tracing::debug;

// Global cache: model_id (lowercase) → discovered context window (tokens).
// Provider-specific regex patterns for extracting context window sizes from
// overflow error messages.
lazy_static! {
    static ref DISCOVERED: DashMap<String, u64> = DashMap::new();

    // OpenAI / OpenRouter / Groq / Kilocode:
    // "This model's maximum context length is 128000 tokens."
    // "maximum context length is 128000 tokens. However, your messages resulted in..."
    // "This model's maximum context length is 128000 tokens. You requested 142837 tokens."
    static ref RE_OPENAI: Regex = Regex::new(
        r"(?i)maximum\s+(?:context|prompt)\s+length\s+is\s+([0-9]+)\s*tokens?"
    ).unwrap();

    // Anthropic:
    // "input length and max_tokens exceed context limit: 188240 + 21333 > 200000"
    // "Your input has 41 tokens that exceed the context window limit of 200,000 tokens."
    static ref RE_ANTHROPIC: Regex = Regex::new(
        r"(?i)(?:exceed[s]?\s+(?:the\s+)?(?:context|prompt)\s+(?:limit|window)|context\s+limit\s+exceeded)[^\d]*?(\d[\d,]*)"
    ).unwrap();

    // Anthropic alt: "> 200000" at end of inequality
    static ref RE_ANTHROPIC_ALT: Regex = Regex::new(
        r"(?i)>\s*([0-9]+)\s*\)?$"
    ).unwrap();

    // Google / Gemini:
    // "input token count (1048602) exceeds the maximum number of tokens allowed (1048576)"
    // "Request payload size exceeds the limit: 1049061 tokens > 1048576 maximum"
    static ref RE_GEMINI: Regex = Regex::new(
        r"(?i)(?:exceeds?\s+(?:the\s+)?(?:maximum|limit)|>\s*)\s*(?:of\s+)?(\d[\d,]*)\s*(?:maximum|tokens?\s*$)"
    ).unwrap();

    // Gemini alt: "maximum ... (Y)"
    static ref RE_GEMINI_ALT: Regex = Regex::new(
        r"(?i)allowed\s*\((\d[\d,]*)\)"
    ).unwrap();

    // xAI / Grok:
    // "maximum prompt length is 131072 but the request contains 537812 tokens"
    // "context length of 131072 tokens"
    static ref RE_XAI: Regex = Regex::new(
        r"(?i)(?:maximum\s+(?:prompt|context)\s+length|context\s+length\s+of)\s+(?:is\s+)?(\d[\d,]+)"
    ).unwrap();

    // Mistral:
    // Response body contains "max_tokens" or "max_input_tokens" fields
    static ref RE_MISTRAL: Regex = Regex::new(
        r#"(?i)(?:max_input_tokens|max_tokens)["']?\s*[:=]\s*(\d+)"#
    ).unwrap();

    // Cohere:
    // "input too long, max token count is 128000"
    static ref RE_COHERE: Regex = Regex::new(
        r"(?i)max\s+token\s+count\s+is\s+(\d+)"
    ).unwrap();

    // Generic fallback: "context window of N" or "context limit of N"
    static ref RE_GENERIC: Regex = Regex::new(
        r"(?i)(?:context\s+(?:window|limit)\s+of|window\s+size\s+of)\s+(\d[\d,]*)"
    ).unwrap();
}

/// Returns `true` if the error message indicates a context-length overflow.
pub fn is_context_length_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("context_length_exceeded")
        || lower.contains("context length exceeded")
        || lower.contains("maximum context length")
        || lower.contains("maximum prompt length")
        || lower.contains("context limit exceeded")
        || lower.contains("context window exceeded")
        || (lower.contains("exceed") && lower.contains("context"))
        || (lower.contains("exceed") && lower.contains("limit") && lower.contains("token"))
        || lower.contains("prompt is too long")
        || lower.contains("input too long")
        || lower.contains("request too large")
        || (lower.contains("token") && lower.contains("limit") && lower.contains("exceed"))
}

/// Try to extract the context window size (in tokens) from an overflow error message.
///
/// Returns `None` if the error does not contain an extractable number.
pub fn extract_context_window(error: &str) -> Option<u64> {
    // Try each provider-specific regex in order of specificity.
    let patterns: &[&Regex] = &[
        &RE_OPENAI,
        &RE_ANTHROPIC,
        &RE_XAI,
        &RE_MISTRAL,
        &RE_COHERE,
        &RE_GEMINI,
        &RE_GEMINI_ALT,
        &RE_GENERIC,
    ];

    for re in patterns {
        if let Some(caps) = re.captures(error) {
            if let Some(m) = caps.get(1) {
                let num_str = m.as_str().replace(',', "");
                if let Ok(tokens) = num_str.parse::<u64>() {
                    // Sanity: context windows are at least 1K and at most 10M tokens.
                    if tokens >= 1_000 && tokens <= 10_000_000 {
                        return Some(tokens);
                    }
                }
            }
        }
    }

    // Anthropic inequality fallback: "> 200000"
    if let Some(caps) = RE_ANTHROPIC_ALT.captures(error) {
        if let Some(m) = caps.get(1) {
            if let Ok(tokens) = m.as_str().parse::<u64>() {
                if tokens >= 1_000 && tokens <= 10_000_000 {
                    return Some(tokens);
                }
            }
        }
    }

    None
}

/// Parse an overflow error, extract the context window, and cache it.
///
/// Returns the discovered context window if one was extracted.
pub fn record_discovery(model_id: &str, error: &str) -> Option<u64> {
    let tokens = extract_context_window(error)?;
    let key = model_id.to_lowercase();
    debug!(
        model = %model_id,
        tokens = tokens,
        "Discovered context window from overflow error"
    );
    DISCOVERED.insert(key, tokens);
    Some(tokens)
}

/// Look up a previously discovered context window for `model_id`.
pub fn lookup_discovered(model_id: &str) -> Option<u64> {
    let key = model_id.to_lowercase();
    DISCOVERED.get(&key).map(|v| *v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_context_length_error() {
        assert!(is_context_length_error(
            "openai returned 400: {\"error\":{\"type\":\"context_length_exceeded\"}}"
        ));
        assert!(is_context_length_error(
            "This model's maximum context length is 128000 tokens."
        ));
        assert!(is_context_length_error(
            "Your input has 41 tokens that exceed the context window limit of 200,000 tokens."
        ));
        assert!(is_context_length_error(
            "prompt is too long: 150000 tokens > 128000 maximum"
        ));
        assert!(is_context_length_error(
            "input too long, max token count is 128000"
        ));
        assert!(!is_context_length_error("connection refused"));
        assert!(!is_context_length_error("invalid api key"));
    }

    #[test]
    fn test_extract_openai() {
        let err = "This model's maximum context length is 128000 tokens. However, your messages resulted in 142837 tokens.";
        assert_eq!(extract_context_window(err), Some(128_000));
    }

    #[test]
    fn test_extract_openai_alt() {
        let err = "maximum context length is 200000 tokens. You requested 250000 tokens.";
        assert_eq!(extract_context_window(err), Some(200_000));
    }

    #[test]
    fn test_extract_anthropic() {
        let err = "input length and max_tokens exceed context limit: 188240 + 21333 > 200000";
        assert_eq!(extract_context_window(err), Some(200_000));
    }

    #[test]
    fn test_extract_anthropic_alt() {
        let err = "Your input has 41 tokens that exceed the context window limit of 200,000 tokens.";
        // This should match via the RE_ANTHROPIC pattern capturing "200000"
        assert_eq!(extract_context_window(err), Some(200_000));
    }

    #[test]
    fn test_extract_gemini() {
        let err = "input token count (1048602) exceeds the maximum number of tokens allowed (1048576)";
        assert_eq!(extract_context_window(err), Some(1_048_576));
    }

    #[test]
    fn test_extract_xai() {
        let err = "maximum prompt length is 131072 but the request contains 537812 tokens";
        assert_eq!(extract_context_window(err), Some(131_072));
    }

    #[test]
    fn test_extract_cohere() {
        let err = "input too long, max token count is 128000";
        assert_eq!(extract_context_window(err), Some(128_000));
    }

    #[test]
    fn test_extract_generic() {
        let err = "context window of 1048576 exceeded";
        assert_eq!(extract_context_window(err), Some(1_048_576));
    }

    #[test]
    fn test_no_match() {
        assert_eq!(extract_context_window("connection refused"), None);
        assert_eq!(extract_context_window("invalid api key"), None);
    }

    #[test]
    fn test_record_and_lookup() {
        let model = "test-model-123";
        let err = "maximum context length is 100000 tokens";
        let discovered = record_discovery(model, err);
        assert_eq!(discovered, Some(100_000));
        assert_eq!(lookup_discovered(model), Some(100_000));
    }

    #[test]
    fn test_comma_in_number() {
        let err = "context window of 1,048,576 exceeded";
        assert_eq!(extract_context_window(err), Some(1_048_576));
    }

    #[test]
    fn test_reject_too_small() {
        // Numbers below 1000 are not context windows
        let err = "exceeded context limit: 500 tokens";
        assert_eq!(extract_context_window(err), None);
    }
}
