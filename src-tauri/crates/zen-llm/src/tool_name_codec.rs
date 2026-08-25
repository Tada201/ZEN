//! Reversible tool-name codec for the provider wire boundary.
//!
//! Canonical tool ids — most importantly external MCP tools shaped as
//! `ext:{server}:{tool}` — can contain characters that model providers reject
//! in a function name. OpenAI/Cohere/OpenRouter require `^[A-Za-z0-9_-]{1,64}$`
//! and forbid a leading digit; Anthropic is similar (128 chars); Gemini also
//! allows `.`. None allow `:`, so `ext:exa:web_search_exa` triggers a 400.
//!
//! We sanitize every outbound tool name to the strict charset and record a
//! per-request map so an inbound tool call can be decoded back to the exact
//! canonical id before dispatch. Sanitization is deterministic and collisions
//! get a stable numeric suffix, so decode is unambiguous within a request.

use std::collections::HashMap;

/// Longest function name any current provider accepts (OpenAI/Cohere = 64).
const MAX_NAME_LEN: usize = 64;

/// Builds provider-legal tool names and remembers how to reverse them.
#[derive(Default)]
pub struct ToolNameCodec {
    to_canonical: HashMap<String, String>,
}

impl ToolNameCodec {
    /// Sanitize one canonical name to the provider charset and record the
    /// reverse mapping. The same canonical always encodes to the same output.
    pub fn encode(&mut self, canonical: &str) -> String {
        let sanitized = sanitize(canonical);
        let mut candidate = sanitized.clone();
        let mut n = 1;
        // On collision (two distinct canonicals sanitize identically, e.g. via
        // truncation) disambiguate with a stable suffix so decode stays 1:1.
        while let Some(existing) = self.to_canonical.get(&candidate) {
            if existing == canonical {
                return candidate;
            }
            candidate = truncate_with_suffix(&sanitized, n);
            n += 1;
        }
        self.to_canonical.insert(candidate.clone(), canonical.to_string());
        candidate
    }

    /// Reverse a provider-returned name. Unknown names pass through unchanged:
    /// internal tools are already legal and encode to themselves, and a partial
    /// streamed name simply isn't in the map yet.
    pub fn decode(&self, wire: &str) -> String {
        self.to_canonical
            .get(wire)
            .cloned()
            .unwrap_or_else(|| wire.to_string())
    }
}

fn sanitize(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if out.is_empty() {
        out.push('_');
    }
    // Providers reject a leading digit.
    if out.as_bytes()[0].is_ascii_digit() {
        out.insert(0, '_');
    }
    if out.len() > MAX_NAME_LEN {
        out.truncate(MAX_NAME_LEN);
    }
    out
}

fn truncate_with_suffix(base: &str, n: usize) -> String {
    let suffix = format!("_{n}");
    let keep = MAX_NAME_LEN.saturating_sub(suffix.len());
    let mut s: String = base.chars().take(keep).collect();
    s.push_str(&suffix);
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colon_names_round_trip() {
        let mut codec = ToolNameCodec::default();
        let wire = codec.encode("ext:exa:web_search_exa");
        assert_eq!(wire, "ext_exa_web_search_exa");
        assert!(wire.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
        assert_eq!(codec.decode(&wire), "ext:exa:web_search_exa");
    }

    #[test]
    fn legal_internal_names_are_identity() {
        let mut codec = ToolNameCodec::default();
        assert_eq!(codec.encode("tool_exec"), "tool_exec");
        assert_eq!(codec.decode("tool_exec"), "tool_exec");
    }

    #[test]
    fn unknown_inbound_name_passes_through() {
        let codec = ToolNameCodec::default();
        assert_eq!(codec.decode("never_seen"), "never_seen");
    }

    #[test]
    fn leading_digit_is_prefixed() {
        let mut codec = ToolNameCodec::default();
        let wire = codec.encode("3d_render");
        assert!(!wire.as_bytes()[0].is_ascii_digit());
        assert_eq!(codec.decode(&wire), "3d_render");
    }

    #[test]
    fn colliding_names_disambiguate_and_reverse() {
        let mut codec = ToolNameCodec::default();
        let long_a = format!("ext:srv:{}", "a".repeat(80));
        let long_b = format!("ext:srv:{}", "a".repeat(79)) + "b";
        let wire_a = codec.encode(&long_a);
        let wire_b = codec.encode(&long_b);
        assert_ne!(wire_a, wire_b, "truncated collisions must diverge");
        assert!(wire_a.len() <= MAX_NAME_LEN && wire_b.len() <= MAX_NAME_LEN);
        assert_eq!(codec.decode(&wire_a), long_a);
        assert_eq!(codec.decode(&wire_b), long_b);
    }

    #[test]
    fn collision_via_charset_not_truncation_reverses() {
        // Two distinct canonicals that sanitize to the SAME short string
        // (colon vs underscore) must not alias to one wire name; each decodes
        // back to its own original regardless of insertion order.
        let mut codec = ToolNameCodec::default();
        let wire_a = codec.encode("ext:exa:foo");
        let wire_b = codec.encode("ext_exa_foo");
        assert_ne!(wire_a, wire_b, "same-sanitization collisions must diverge");
        assert_eq!(codec.decode(&wire_a), "ext:exa:foo");
        assert_eq!(codec.decode(&wire_b), "ext_exa_foo");
    }

    #[test]
    fn re_encode_is_stable_after_collision() {
        // Re-encoding an already-registered canonical returns its prior wire
        // name, never a new suffix, so a decode map built across turns stays 1:1.
        let mut codec = ToolNameCodec::default();
        let a1 = codec.encode("ext:exa:foo");
        let _b = codec.encode("ext_exa_foo");
        let a2 = codec.encode("ext:exa:foo");
        assert_eq!(a1, a2);
        assert_eq!(codec.decode(&a2), "ext:exa:foo");
    }
}
