//! Safety and typed models for MCP resources and prompts (Phase 5).
//!
//! Resource and prompt payloads are untrusted server output. Before any of it
//! reaches the UI or the model we:
//!
//! * allowlist the URI scheme and reject path-traversal in `file:` URIs so a
//!   server can't point us at an arbitrary local path or an executable scheme
//!   (`javascript:`, `data:`, …);
//! * bound the MIME type, text size, and base64 blob size so a hostile server
//!   can't exhaust memory or smuggle a huge payload into a prompt;
//! * keep binary blobs as base64 and never decode them into model text;
//! * strip control characters (except tab/newline) from any text that will be
//!   shown or inserted, so escape sequences and hidden instructions can't ride
//!   in through a resource or prompt message.
//!
//! Nothing here fetches or executes anything — these are pure validators and
//! normalizers the client applies to every `resources/*` and `prompts/*`
//! response.

use serde::Serialize;
use serde_json::Value;

/// Schemes a resource URI may use. Anything else (notably `javascript:`,
/// `data:`, `vbscript:`, `blob:`) is rejected before the URI is shown or read.
///
/// ponytail: fixed allowlist, not user-configurable — add a scheme here if a
/// server ever needs one, rather than opening it to arbitrary input.
const ALLOWED_URI_SCHEMES: &[&str] = &["file", "http", "https", "resource", "git", "ssh", "mcp"];

pub const MAX_URI_LEN: usize = 2048;
pub const MAX_MIME_LEN: usize = 128;
/// Cap on decoded/rendered resource text. Larger text is truncated with a flag.
pub const MAX_RESOURCE_TEXT_BYTES: usize = 256 * 1024;
/// Cap on a base64 blob length (characters). Larger blobs are dropped, never
/// decoded — binary is opaque to the model.
pub const MAX_RESOURCE_BLOB_BYTES: usize = 1024 * 1024;
/// Cap on total list items collected across all pages of a `*/list` call.
pub const MAX_LIST_ITEMS: usize = 500;

/// A single `resources/list` entry, safety-normalized.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

/// A `resources/templates/list` entry (RFC 6570 URI template), normalized.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceTemplate {
    pub uri_template: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

/// One content block from `resources/read`. Exactly one of `text`/`blobBase64`
/// is set; `truncated` marks a payload clipped at the size cap.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceContents {
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob_base64: Option<String>,
    pub truncated: bool,
}

/// A `prompts/list` argument descriptor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptArgument {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub required: bool,
}

/// A `prompts/list` entry, normalized.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPrompt {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub arguments: Vec<McpPromptArgument>,
}

/// One message from `prompts/get`. `content` is sanitized plain text; embedded
/// resources are summarized to their URI rather than inlined so a prompt can't
/// smuggle opaque binary or executable content into the conversation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptMessage {
    pub role: String,
    pub content: String,
}

/// Validate a resource URI: bounded length, no control characters, an
/// allowlisted scheme, and no `..` path traversal for `file:` URIs.
pub fn validate_resource_uri(uri: &str) -> Result<(), String> {
    if uri.is_empty() {
        return Err("resource uri is empty".to_string());
    }
    if uri.len() > MAX_URI_LEN {
        return Err(format!("resource uri exceeds {} bytes", MAX_URI_LEN));
    }
    if uri.chars().any(|c| c.is_control()) {
        return Err("resource uri contains a control character".to_string());
    }
    let scheme = uri
        .split_once(':')
        .map(|(scheme, _)| scheme.to_ascii_lowercase())
        .ok_or_else(|| "resource uri has no scheme".to_string())?;
    if !ALLOWED_URI_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("resource uri scheme '{}' is not allowed", scheme));
    }
    // Path traversal only matters for schemes that map to a filesystem path.
    if scheme == "file" && uri.split(['/', '\\']).any(|seg| seg == "..") {
        return Err("file resource uri contains a path traversal segment".to_string());
    }
    Ok(())
}

/// Bound and sanitize a MIME type string. Returns `None` for an absent or
/// unusable value rather than erroring — a missing MIME is not fatal.
pub fn sanitize_mime(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() || raw.len() > MAX_MIME_LEN {
        return None;
    }
    if raw.chars().any(|c| c.is_control() || !c.is_ascii()) {
        return None;
    }
    // Require a single `type/subtype` shape; reject anything weirder.
    let (kind, rest) = raw.split_once('/')?;
    if kind.is_empty() || rest.is_empty() {
        return None;
    }
    Some(raw.to_ascii_lowercase())
}

/// Strip control characters (keeping tab/newline) and clip to `max_bytes` on a
/// char boundary. Every server-provided string shown or inserted goes through
/// this so hidden escape sequences and oversized text can't get through.
pub fn sanitize_text(input: &str, max_bytes: usize) -> (String, bool) {
    let cleaned: String = input
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\t' | '\r'))
        .collect();
    if cleaned.len() <= max_bytes {
        return (cleaned, false);
    }
    let mut end = max_bytes;
    while end > 0 && !cleaned.is_char_boundary(end) {
        end -= 1;
    }
    (cleaned[..end].to_string(), true)
}

/// Optional-string sanitizer for short display fields (name/title/description).
pub fn sanitize_field(value: Option<&Value>, max_bytes: usize) -> Option<String> {
    let raw = value.and_then(Value::as_str)?;
    let (text, _) = sanitize_text(raw, max_bytes);
    let text = text.trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Bound a base64 blob: reject non-ASCII/oversized payloads (never decoded).
pub fn sanitize_blob(value: &str) -> Option<String> {
    if value.len() > MAX_RESOURCE_BLOB_BYTES {
        return None;
    }
    if value
        .bytes()
        .any(|b| !(b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'\n' | b'\r')))
    {
        return None;
    }
    Some(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn self_check() {
        // Scheme allowlist + traversal.
        assert!(validate_resource_uri("https://example.com/x").is_ok());
        assert!(validate_resource_uri("file:///home/u/readme.md").is_ok());
        assert!(validate_resource_uri("javascript:alert(1)").is_err());
        assert!(validate_resource_uri("data:text/html,<script>").is_err());
        assert!(validate_resource_uri("file:///a/../../etc/passwd").is_err());
        assert!(validate_resource_uri("no-scheme").is_err());
        assert!(validate_resource_uri(&"x".repeat(MAX_URI_LEN + 1)).is_err());

        // MIME shape.
        assert_eq!(sanitize_mime(Some("text/plain")).as_deref(), Some("text/plain"));
        assert_eq!(sanitize_mime(Some("application/JSON")).as_deref(), Some("application/json"));
        assert_eq!(sanitize_mime(Some("garbage")), None);
        assert_eq!(sanitize_mime(Some("a/b\u{7}")), None);

        // Text sanitize strips control chars and truncates on a boundary.
        let (clean, truncated) = sanitize_text("ok\u{7}line\nend", 1024);
        assert_eq!(clean, "okline\nend");
        assert!(!truncated);
        let (clipped, was) = sanitize_text(&"a".repeat(100), 10);
        assert_eq!(clipped.len(), 10);
        assert!(was);

        // Field sanitize collapses empties.
        assert_eq!(sanitize_field(Some(&json!("  Title ")), 64).as_deref(), Some("Title"));
        assert_eq!(sanitize_field(Some(&json!("   ")), 64), None);
        assert_eq!(sanitize_field(None, 64), None);

        // Blob rejects oversized / non-base64.
        assert!(sanitize_blob("aGVsbG8=").is_some());
        assert!(sanitize_blob("not base64!!").is_none());
        assert!(sanitize_blob(&"A".repeat(MAX_RESOURCE_BLOB_BYTES + 1)).is_none());
    }
}
