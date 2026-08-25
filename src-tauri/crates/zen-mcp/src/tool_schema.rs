//! Discovery-time validation of external MCP tool descriptors (Phase 4).
//!
//! A `tools/list` entry is untrusted input from a remote server. Before an
//! `McpToolAdapter` is registered we:
//!
//! * bound and meta-validate its `inputSchema` / `outputSchema` against JSON
//!   Schema 2020-12 so a malformed or maliciously-deep schema can't be handed
//!   to the LLM or later crash the argument validator;
//! * reject any `x-mcp-header` extension that tries to set a reserved protocol
//!   header or a sensitive credential header (header injection via the tool
//!   descriptor);
//! * fold the spec's top-level `title` into the annotations so the display
//!   name survives even when the server only sets `title` at the tool root.
//!
//! Tools that fail validation are skipped (not registered) rather than failing
//! the whole server sync — the caller logs a `malformed-schema` warning and
//! moves on.

use serde_json::Value;

use crate::config::{is_reserved_mcp_header, is_sensitive_header};

/// Max nesting depth accepted in a tool schema. A deeper schema is rejected
/// before compilation so a hostile server can't drive the validator into
/// pathological recursion.
const MAX_SCHEMA_DEPTH: usize = 32;
/// Max total JSON nodes (objects/arrays/scalars) accepted in a tool schema.
const MAX_SCHEMA_NODES: usize = 4096;

/// Validate one tool schema (input or output). `label` is only used in the
/// error message. Bounds are checked first (cheap, fail-fast) and only then is
/// the schema compiled as a Draft 2020-12 validator, which structurally
/// rejects malformed schemas.
pub fn validate_tool_schema(label: &str, schema: &Value) -> Result<(), String> {
    // A tool with no schema, or an explicit `null`, is allowed — the adapter
    // falls back to `{"type":"object"}`.
    if schema.is_null() {
        return Ok(());
    }
    if !schema.is_object() {
        return Err(format!("{label} must be a JSON object"));
    }
    let mut nodes = 0usize;
    check_bounds(schema, 0, &mut nodes)
        .map_err(|reason| format!("{label} rejected: {reason}"))?;
    // Pin to 2020-12: compilation is the meta-validation. A schema the crate
    // can't build is unusable at call time, so refuse it now.
    jsonschema::draft202012::new(schema)
        .map(|_| ())
        .map_err(|error| format!("{label} is not a valid JSON Schema 2020-12: {error}"))
}

fn check_bounds(value: &Value, depth: usize, nodes: &mut usize) -> Result<(), String> {
    if depth > MAX_SCHEMA_DEPTH {
        return Err(format!("nesting exceeds {MAX_SCHEMA_DEPTH} levels"));
    }
    *nodes += 1;
    if *nodes > MAX_SCHEMA_NODES {
        return Err(format!("exceeds {MAX_SCHEMA_NODES} nodes"));
    }
    match value {
        Value::Object(map) => {
            for child in map.values() {
                check_bounds(child, depth + 1, nodes)?;
            }
        }
        Value::Array(items) => {
            for child in items {
                check_bounds(child, depth + 1, nodes)?;
            }
        }
        _ => {}
    }
    Ok(())
}

/// Reject a tool whose `x-mcp-header` extension tries to inject a reserved
/// protocol header or a sensitive credential header. The extension may be an
/// object (`{name: value}`) or an array of header names; either shape is
/// scanned for unsafe *names* only (values are never inspected or logged).
pub fn tool_header_extension_is_safe(tool_json: &Value) -> Result<(), String> {
    let Some(ext) = tool_json.get("x-mcp-header") else {
        return Ok(());
    };
    let names: Vec<&str> = match ext {
        Value::Object(map) => map.keys().map(String::as_str).collect(),
        Value::Array(items) => items.iter().filter_map(Value::as_str).collect(),
        Value::Null => return Ok(()),
        _ => return Err("x-mcp-header must be an object or array of header names".to_string()),
    };
    for name in names {
        if name.is_empty() || name.chars().any(|c| c.is_control()) {
            return Err("x-mcp-header contains an empty or control-character header name".to_string());
        }
        if is_reserved_mcp_header(name) {
            return Err(format!("x-mcp-header '{name}' is controlled by the MCP client"));
        }
        if is_sensitive_header(name) {
            return Err(format!(
                "x-mcp-header '{name}' would inject a credential header; not allowed"
            ));
        }
    }
    Ok(())
}

/// Fold the MCP 2025-06-18 top-level `title` into `annotations.title` when the
/// annotations block does not already carry one, so the human-facing display
/// name is preserved regardless of where the server placed it.
pub fn fold_title(
    tool_json: &Value,
    annotations: Option<zen_tools::ToolAnnotations>,
) -> Option<zen_tools::ToolAnnotations> {
    let top_title = tool_json
        .get("title")
        .and_then(Value::as_str)
        .filter(|title| !title.trim().is_empty());
    match (annotations, top_title) {
        (Some(mut ann), Some(title)) => {
            if ann.title.as_deref().unwrap_or("").trim().is_empty() {
                ann.title = Some(title.to_string());
            }
            Some(ann)
        }
        (Some(ann), None) => Some(ann),
        (None, Some(title)) => Some(zen_tools::ToolAnnotations {
            title: Some(title.to_string()),
            ..Default::default()
        }),
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn self_check() {
        // A well-formed object schema passes; a null/absent schema is allowed.
        assert!(validate_tool_schema("inputSchema", &json!({"type": "object"})).is_ok());
        assert!(validate_tool_schema("inputSchema", &Value::Null).is_ok());
        // A non-object schema and a structurally-invalid schema are rejected.
        assert!(validate_tool_schema("inputSchema", &json!("nope")).is_err());
        assert!(validate_tool_schema("inputSchema", &json!({"type": 123})).is_err());

        // Depth bound: build a schema nested past MAX_SCHEMA_DEPTH.
        let mut deep = json!({"type": "object"});
        for _ in 0..(MAX_SCHEMA_DEPTH + 2) {
            deep = json!({"properties": {"x": deep}});
        }
        assert!(validate_tool_schema("inputSchema", &deep).is_err());

        // x-mcp-header: safe custom header ok; reserved/sensitive rejected.
        assert!(tool_header_extension_is_safe(&json!({})).is_ok());
        assert!(tool_header_extension_is_safe(&json!({"x-mcp-header": {"X-Trace": "1"}})).is_ok());
        assert!(tool_header_extension_is_safe(&json!({"x-mcp-header": ["Authorization"]})).is_err());
        assert!(tool_header_extension_is_safe(&json!({"x-mcp-header": {"Mcp-Session-Id": "x"}})).is_err());

        // Title fold: top-level title flows into empty annotations.
        let folded = fold_title(&json!({"title": "Nice Name"}), None).unwrap();
        assert_eq!(folded.title.as_deref(), Some("Nice Name"));
        // Existing annotation title is not overwritten.
        let existing = Some(zen_tools::ToolAnnotations {
            title: Some("Kept".to_string()),
            ..Default::default()
        });
        let folded = fold_title(&json!({"title": "Ignored"}), existing).unwrap();
        assert_eq!(folded.title.as_deref(), Some("Kept"));
    }
}
