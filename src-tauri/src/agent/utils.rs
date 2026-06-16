//! Shared utilities for the agent system.
/// Returns the current Unix epoch time in milliseconds.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64
}

/// Extract a balanced JSON object starting at the first '{' in the string.
pub(crate) fn extract_json_object(s: &str) -> Option<String> {
    let start_idx = s.find('{')?;
    let s = &s[start_idx..];

    let mut depth = 0;
    let mut in_string = false;
    let mut escape = false;
    for (i, ch) in s.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(s[..=i].to_string());
            }
        }
    }
    None
}
