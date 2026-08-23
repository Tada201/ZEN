//! Resource and prompt discovery/read for `McpClient` (Phase 5).
//!
//! These are the non-tool MCP surfaces. Unlike tools they are never
//! auto-registered or auto-executed: the UI lists them and the user explicitly
//! reads a resource or fetches a prompt. Every value a server returns is passed
//! through the validators in `crate::resources` before it leaves this
//! module, so nothing reaches the UI or the model with an unsafe URI, an
//! oversized/binary payload decoded as text, or embedded control characters.
//!
//! All four calls share the paginated-list shape already used for tools and the
//! `request_endpoint` dispatch in the sibling `rpc` module, with list results
//! cached per the server's `ttlMs`/`cacheScope` hint.

use serde_json::{Map, Value};

use crate::resources::{
    sanitize_blob, sanitize_field, sanitize_mime, sanitize_text, validate_resource_uri,
    McpPrompt, McpPromptArgument, McpPromptMessage, McpResource, McpResourceContents,
    McpResourceTemplate, MAX_LIST_ITEMS, MAX_RESOURCE_BLOB_BYTES, MAX_RESOURCE_TEXT_BYTES,
};
use crate::types::methods;

use super::McpClient;

/// Field-length cap for short display strings (name/title/description).
const MAX_FIELD_BYTES: usize = 4 * 1024;
/// Safety cap on list pagination (mirrors `MAX_TOOLS_LIST_PAGES`).
const MAX_LIST_PAGES: usize = 100;

impl McpClient {
    /// Paginate a `*/list` method, collecting the array at `result[items_key]`
    /// across pages. A live cached first-page result (populated when the server
    /// last returned a positive `ttlMs`) short-circuits the network round-trip;
    /// otherwise the first page's cache hint is stored for next time.
    async fn paginate_list(
        &self,
        server_name: &str,
        method: &str,
        items_key: &str,
    ) -> Result<Vec<Value>, String> {
        let mut all: Vec<Value> = Vec::new();
        let mut cursor: Option<String> = None;
        let mut page = 0usize;
        loop {
            page += 1;
            if page > MAX_LIST_PAGES {
                break;
            }
            // A fresh single-page cache entry (server declared no further pages
            // when it set the ttl) can be served without a request.
            if page == 1 {
                if let Some(cached) = self.cache_get(&Self::cache_key(server_name, method)) {
                    if let Some(items) = cached.get(items_key).and_then(Value::as_array) {
                        if cached.get("nextCursor").and_then(Value::as_str).is_none() {
                            return Ok(items.iter().take(MAX_LIST_ITEMS).cloned().collect());
                        }
                    }
                }
            }
            let mut params = Map::new();
            if let Some(c) = cursor.as_deref() {
                params.insert("cursor".to_string(), Value::String(c.to_string()));
            }
            let result = self
                .request_endpoint(server_name, method, Value::Object(params), None, None)
                .await?;
            if page == 1 {
                let hint = super::rpc::parse_cache_hint(&result);
                self.cache_put(Self::cache_key(server_name, method), result.clone(), hint);
            }
            if let Some(items) = result.get(items_key).and_then(Value::as_array) {
                for item in items {
                    if all.len() >= MAX_LIST_ITEMS {
                        return Ok(all);
                    }
                    all.push(item.clone());
                }
            }
            match result.get("nextCursor").and_then(Value::as_str) {
                Some(c) if !c.is_empty() => cursor = Some(c.to_string()),
                _ => break,
            }
        }
        Ok(all)
    }

    /// `resources/list` — safety-normalized. Entries with an invalid URI are
    /// dropped rather than surfaced.
    pub async fn list_resources(&self, server_name: &str) -> Result<Vec<McpResource>, String> {
        let raw = self
            .paginate_list(server_name, methods::RESOURCES_LIST, "resources")
            .await?;
        Ok(raw.iter().filter_map(normalize_resource).collect())
    }

    /// `resources/templates/list` — safety-normalized.
    pub async fn list_resource_templates(
        &self,
        server_name: &str,
    ) -> Result<Vec<McpResourceTemplate>, String> {
        let raw = self
            .paginate_list(
                server_name,
                methods::RESOURCES_TEMPLATES_LIST,
                "resourceTemplates",
            )
            .await?;
        Ok(raw.iter().filter_map(normalize_template).collect())
    }

    /// `resources/read` — validate the requested URI, then normalize every
    /// content block. Text is control-stripped and size-capped; binary stays
    /// base64 and is never decoded into model text. Routes through the MRTR
    /// loop so a server may elicit input (`app` prompts the user); a `None`
    /// handle fails closed on an input-required result.
    pub async fn read_resource(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        uri: &str,
    ) -> Result<Vec<McpResourceContents>, String> {
        validate_resource_uri(uri)?;
        let params = serde_json::json!({ "uri": uri });
        let result = self
            .request_with_mrtr(ui, server_name, methods::RESOURCES_READ, params, None, None)
            .await?;
        let contents = result
            .get("contents")
            .and_then(Value::as_array)
            .ok_or_else(|| "resources/read: missing contents".to_string())?;
        Ok(contents
            .iter()
            .take(MAX_LIST_ITEMS)
            .filter_map(normalize_contents)
            .collect())
    }

    /// `prompts/list` — safety-normalized. Explicit user action; nothing is
    /// injected into the model automatically.
    pub async fn list_prompts(&self, server_name: &str) -> Result<Vec<McpPrompt>, String> {
        let raw = self
            .paginate_list(server_name, methods::PROMPTS_LIST, "prompts")
            .await?;
        Ok(raw.iter().filter_map(normalize_prompt).collect())
    }

    /// `prompts/get` — fetch a prompt's messages with the user-supplied
    /// arguments. Message content is sanitized to plain text; embedded resource
    /// blocks are summarized to their URI rather than inlined so a prompt can't
    /// smuggle opaque binary or executable content into the conversation.
    /// Routes through the MRTR loop; `app` prompts the user if the server
    /// elicits input, and a `None` handle fails closed.
    pub async fn get_prompt(
        &self,
        ui: Option<&crate::ui::UiBridge>,
        server_name: &str,
        name: &str,
        arguments: Value,
    ) -> Result<Vec<McpPromptMessage>, String> {
        let mut params = serde_json::json!({ "name": name });
        if arguments.is_object() {
            params["arguments"] = arguments;
        }
        let result = self
            .request_with_mrtr(ui, server_name, methods::PROMPTS_GET, params, None, None)
            .await?;
        let messages = result
            .get("messages")
            .and_then(Value::as_array)
            .ok_or_else(|| "prompts/get: missing messages".to_string())?;
        Ok(messages
            .iter()
            .take(MAX_LIST_ITEMS)
            .filter_map(normalize_prompt_message)
            .collect())
    }
}

fn normalize_resource(raw: &Value) -> Option<McpResource> {
    let uri = raw.get("uri").and_then(Value::as_str)?;
    if validate_resource_uri(uri).is_err() {
        return None;
    }
    let name = sanitize_field(raw.get("name"), MAX_FIELD_BYTES)
        .unwrap_or_else(|| uri.chars().take(96).collect());
    Some(McpResource {
        uri: uri.to_string(),
        name,
        title: sanitize_field(raw.get("title"), MAX_FIELD_BYTES),
        description: sanitize_field(raw.get("description"), MAX_FIELD_BYTES),
        mime_type: sanitize_mime(raw.get("mimeType").and_then(Value::as_str)),
        size: raw.get("size").and_then(Value::as_u64),
    })
}

fn normalize_template(raw: &Value) -> Option<McpResourceTemplate> {
    let uri_template = raw.get("uriTemplate").and_then(Value::as_str)?;
    // A template contains `{var}` placeholders, so full URI validation would
    // reject it; we only bound length and strip control chars here.
    let (uri_template, _) = sanitize_text(uri_template, crate::resources::MAX_URI_LEN);
    if uri_template.is_empty() {
        return None;
    }
    let name = sanitize_field(raw.get("name"), MAX_FIELD_BYTES)
        .unwrap_or_else(|| uri_template.chars().take(96).collect());
    Some(McpResourceTemplate {
        uri_template,
        name,
        title: sanitize_field(raw.get("title"), MAX_FIELD_BYTES),
        description: sanitize_field(raw.get("description"), MAX_FIELD_BYTES),
        mime_type: sanitize_mime(raw.get("mimeType").and_then(Value::as_str)),
    })
}

fn normalize_contents(raw: &Value) -> Option<McpResourceContents> {
    let uri = raw.get("uri").and_then(Value::as_str).unwrap_or_default();
    // A returned content block should still name a valid URI; a bad one is a
    // sign of a confused/hostile server, so drop the block.
    if !uri.is_empty() && validate_resource_uri(uri).is_err() {
        return None;
    }
    let mime_type = sanitize_mime(raw.get("mimeType").and_then(Value::as_str));
    let mut truncated = false;
    let (text, blob) = if let Some(raw_text) = raw.get("text").and_then(Value::as_str) {
        let (clean, was) = sanitize_text(raw_text, MAX_RESOURCE_TEXT_BYTES);
        truncated = was;
        (Some(clean), None)
    } else if let Some(raw_blob) = raw.get("blob").and_then(Value::as_str) {
        match sanitize_blob(raw_blob) {
            Some(blob) => (None, Some(blob)),
            // Oversized/invalid binary is dropped rather than decoded.
            None => {
                truncated = raw_blob.len() > MAX_RESOURCE_BLOB_BYTES;
                (None, None)
            }
        }
    } else {
        (None, None)
    };
    Some(McpResourceContents {
        uri: uri.to_string(),
        mime_type,
        text,
        blob_base64: blob,
        truncated,
    })
}

fn normalize_prompt(raw: &Value) -> Option<McpPrompt> {
    let name = sanitize_field(raw.get("name"), MAX_FIELD_BYTES)?;
    let arguments = raw
        .get("arguments")
        .and_then(Value::as_array)
        .map(|args| {
            args.iter()
                .filter_map(|arg| {
                    Some(McpPromptArgument {
                        name: sanitize_field(arg.get("name"), MAX_FIELD_BYTES)?,
                        description: sanitize_field(arg.get("description"), MAX_FIELD_BYTES),
                        required: arg.get("required").and_then(Value::as_bool).unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(McpPrompt {
        name,
        title: sanitize_field(raw.get("title"), MAX_FIELD_BYTES),
        description: sanitize_field(raw.get("description"), MAX_FIELD_BYTES),
        arguments,
    })
}

fn normalize_prompt_message(raw: &Value) -> Option<McpPromptMessage> {
    let role = match raw.get("role").and_then(Value::as_str) {
        Some("user") => "user",
        Some("assistant") => "assistant",
        // Unknown/absent role: treat as user so it can't impersonate a system
        // instruction channel.
        _ => "user",
    };
    let content = summarize_prompt_content(raw.get("content"));
    if content.is_empty() {
        return None;
    }
    Some(McpPromptMessage {
        role: role.to_string(),
        content,
    })
}

/// Reduce a prompt message's `content` (a block or array of blocks) to
/// sanitized plain text. Text blocks are control-stripped; image/audio/resource
/// blocks are replaced with a short `[type: uri]` placeholder so no opaque or
/// executable payload is inlined into the conversation.
fn summarize_prompt_content(content: Option<&Value>) -> String {
    let Some(content) = content else {
        return String::new();
    };
    let blocks: Vec<&Value> = match content {
        Value::Array(items) => items.iter().collect(),
        other => vec![other],
    };
    let mut out = String::new();
    for block in blocks.into_iter().take(64) {
        match block.get("type").and_then(Value::as_str) {
            Some("text") | None => {
                if let Some(text) = block.get("text").and_then(Value::as_str) {
                    let (clean, _) = sanitize_text(text, MAX_RESOURCE_TEXT_BYTES);
                    if !out.is_empty() {
                        out.push('\n');
                    }
                    out.push_str(&clean);
                }
            }
            Some(kind) => {
                let uri = block
                    .get("resource")
                    .and_then(|r| r.get("uri"))
                    .and_then(Value::as_str)
                    .or_else(|| block.get("uri").and_then(Value::as_str))
                    .unwrap_or("");
                let uri = if validate_resource_uri(uri).is_ok() { uri } else { "" };
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(&format!("[{}: {}]", kind, uri));
            }
        }
    }
    let (clean, _) = sanitize_text(&out, MAX_RESOURCE_TEXT_BYTES);
    clean
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_filters() {
        // Bad-URI resource is dropped.
        assert!(normalize_resource(&serde_json::json!({"uri": "javascript:x", "name": "n"})).is_none());
        // Good resource keeps sanitized fields.
        let r = normalize_resource(&serde_json::json!({
            "uri": "file:///a.txt", "name": "a\u{7}b", "mimeType": "TEXT/PLAIN"
        }))
        .unwrap();
        assert_eq!(r.name, "ab");
        assert_eq!(r.mime_type.as_deref(), Some("text/plain"));

        // Binary content stays base64; text is control-stripped.
        let c = normalize_contents(&serde_json::json!({
            "uri": "file:///a.txt", "text": "hi\u{7}there"
        }))
        .unwrap();
        assert_eq!(c.text.as_deref(), Some("hithere"));
        assert!(c.blob_base64.is_none());

        // Prompt message with an embedded resource block is summarized, not inlined.
        let m = normalize_prompt_message(&serde_json::json!({
            "role": "user",
            "content": [
                {"type": "text", "text": "look at"},
                {"type": "resource", "resource": {"uri": "file:///x"}}
            ]
        }))
        .unwrap();
        assert_eq!(m.role, "user");
        assert!(m.content.contains("look at"));
        assert!(m.content.contains("[resource: file:///x]"));

        // Unknown role can't impersonate a system channel.
        let m = normalize_prompt_message(&serde_json::json!({
            "role": "system", "content": {"type": "text", "text": "x"}
        }))
        .unwrap();
        assert_eq!(m.role, "user");
    }
}
