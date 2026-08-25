//! Generic endpoint request dispatch and a bounded freshness cache for the
//! non-tool MCP features (resources / prompts) added in Phase 5.
//!
//! `call_external_tool` in the parent module hard-codes the `tools/call`
//! payload shape and its `isError` handling. Resources and prompts need the
//! same HTTP-vs-stdio dispatch, modern `_meta` injection, and error unwrapping
//! but with an arbitrary method name and no tool-level `isError` contract, so
//! that shared shape lives here as `request_endpoint`.
//!
//! The cache satisfies the Phase 5 exit gate "cache freshness and
//! private/public scope are respected": a list result is only cached when the
//! server returns a positive `ttlMs`, entries expire on their own TTL, and
//! private-scope entries are dropped when the owning server is torn down (every
//! resync clears the whole cache before re-handshaking). Nothing is persisted
//! to disk.

use std::time::{Duration, Instant};

use serde_json::{Map, Value};
use tokio_util::sync::CancellationToken;

use crate::types::modern_request_meta;
use zen_security::url_safety::build_pinned_http_client;

use super::http_body::read_rpc_response;
use super::{next_http_request_id, validate_mcp_endpoint_url, McpClient, ServerEndpoint};

/// Cache visibility declared by the server. `Public` results may be reused
/// freely for their TTL; `Private` results are additionally dropped whenever
/// the owning server is torn down (which every resync does). In this
/// single-user desktop app both live only in memory and are never persisted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum CacheScope {
    Public,
    Private,
}

pub(super) struct CacheEntry {
    value: Value,
    expires_at: Instant,
    #[allow(dead_code)]
    scope: CacheScope,
}

/// Cap on the number of cached list results across all servers. Prevents a
/// server that rotates cursors/URIs from growing the map without bound.
const MAX_CACHE_ENTRIES: usize = 256;

/// Parse the optional cache hint a modern server may attach to a result. Looks
/// at both the result-level fields and the `_meta` block. A missing or
/// non-positive `ttlMs` means "do not cache".
pub(super) fn parse_cache_hint(result: &Value) -> Option<(Duration, CacheScope)> {
    let meta = result.get("_meta").and_then(Value::as_object);
    let read_u64 = |key: &str| {
        result
            .get(key)
            .and_then(Value::as_u64)
            .or_else(|| meta.and_then(|m| m.get(key)).and_then(Value::as_u64))
    };
    let read_str = |key: &str| {
        result
            .get(key)
            .and_then(Value::as_str)
            .or_else(|| meta.and_then(|m| m.get(key)).and_then(Value::as_str))
    };
    let ttl_ms = read_u64("ttlMs")?;
    if ttl_ms == 0 {
        return None;
    }
    // Clamp so a hostile server can't pin a stale entry for an unreasonable
    // time; one hour is well beyond any realistic list-cache lifetime.
    let ttl = Duration::from_millis(ttl_ms.min(60 * 60 * 1000));
    let scope = match read_str("cacheScope") {
        Some("public") => CacheScope::Public,
        _ => CacheScope::Private,
    };
    Some((ttl, scope))
}

impl McpClient {
    /// Build a stable cache key for a per-server list result.
    pub(super) fn cache_key(server_name: &str, kind: &str) -> String {
        // NUL can't appear in a server name or method, so it's a safe joiner.
        format!("{server_name}\u{0}{kind}")
    }

    /// Return a live (non-expired) cached value, evicting it if it has expired.
    pub(super) fn cache_get(&self, key: &str) -> Option<Value> {
        let mut cache = self.lock_feature_cache();
        match cache.get(key) {
            Some(entry) if entry.expires_at > Instant::now() => Some(entry.value.clone()),
            Some(_) => {
                cache.remove(key);
                None
            }
            None => None,
        }
    }

    /// Store a value under `key` honoring the server's TTL/scope hint. A `None`
    /// hint means the server opted out of caching, so nothing is stored.
    pub(super) fn cache_put(&self, key: String, value: Value, hint: Option<(Duration, CacheScope)>) {
        let Some((ttl, scope)) = hint else {
            return;
        };
        let mut cache = self.lock_feature_cache();
        if cache.len() >= MAX_CACHE_ENTRIES && !cache.contains_key(&key) {
            // Drop any expired entry first; otherwise evict an arbitrary one.
            let now = Instant::now();
            if let Some(stale) = cache
                .iter()
                .find(|(_, entry)| entry.expires_at <= now)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&stale);
            } else if let Some(any) = cache.keys().next().cloned() {
                cache.remove(&any);
            }
        }
        cache.insert(
            key,
            CacheEntry {
                value,
                expires_at: Instant::now() + ttl,
                scope,
            },
        );
    }

    /// Drop every cached entry belonging to `server_name` (all kinds). Called
    /// on teardown/resync and on a `*_list_changed` notification so a stale
    /// list is never served after the server says it changed.
    pub(super) fn cache_invalidate_server(&self, server_name: &str) {
        let prefix = format!("{server_name}\u{0}");
        let mut cache = self.lock_feature_cache();
        cache.retain(|key, _| !key.starts_with(&prefix));
    }

    /// Send a JSON-RPC request to a configured endpoint by method name and
    /// return the unwrapped `result` object. Mirrors `call_external_tool`'s
    /// transport dispatch and modern `_meta` injection but for an arbitrary
    /// method with no tool-level `isError` contract.
    ///
    /// `cancel` cooperatively aborts an in-flight call (HTTP arm races the
    /// request; stdio arm forwards the token). `header_name` overrides the
    /// `Mcp-Name` header value for modern HTTP (tools use the tool name, other
    /// methods use the method name); `None` defaults to the method.
    pub(super) async fn request_endpoint(
        &self,
        server_name: &str,
        method: &str,
        params: Value,
        cancel: Option<&CancellationToken>,
        header_name: Option<&str>,
    ) -> Result<Value, String> {
        let endpoint = {
            let endpoints = self.lock_external_endpoints();
            endpoints
                .get(server_name)
                .cloned()
                .ok_or_else(|| format!("No endpoint for external MCP server '{server_name}'"))?
        };
        let name_header = header_name.unwrap_or(method);

        match endpoint {
            ServerEndpoint::Http(endpoint) => {
                let mut params = params;
                if endpoint.modern {
                    inject_modern_meta(&mut params);
                }
                let body = serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "id": next_http_request_id(),
                });
                // Streamable HTTP posts every method to the single endpoint URL
                // in both eras; legacy has no per-method subpath. Using a
                // `/{method}` suffix makes real servers (e.g. Exa) 404.
                let target_url = endpoint.url.clone();
                let parsed_url = validate_mcp_endpoint_url(&endpoint.url)?;
                let client = build_pinned_http_client(&parsed_url, endpoint.request_timeout).await?;
                let request = Self::apply_mcp_headers(
                    client.post(&target_url),
                    Some(&endpoint),
                    Some(method),
                    Some(name_header),
                )
                .json(&body)
                .timeout(endpoint.request_timeout)
                .send();
                let resp = match cancel {
                    Some(token) => tokio::select! {
                        result = request => result,
                        _ = token.cancelled() => {
                            return Err(format!("MCP {method} cancelled"));
                        }
                    },
                    None => request.await,
                }
                .map_err(|e| format!("MCP {method} failed: {e}"))?;
                if !resp.status().is_success() {
                    return Err(format!("MCP {} returned HTTP {}", method, resp.status()));
                }
                let json = read_rpc_response(resp)
                    .await
                    .map_err(|e| format!("MCP {method}: {e}"))?;
                unwrap_result(json, method)
            }
            ServerEndpoint::Stdio(endpoint) => {
                let mut params = params;
                if endpoint.modern {
                    inject_modern_meta(&mut params);
                }
                let json = endpoint
                    .transport
                    .send_request_cancelable(method, Some(params), cancel)
                    .await?;
                unwrap_result(json, method)
            }
        }
    }
}

fn inject_modern_meta(params: &mut Value) {
    if !params.is_object() {
        *params = Value::Object(Map::new());
    }
    if let Value::Object(object) = params {
        if let Value::Object(meta) = modern_request_meta() {
            for (key, value) in meta {
                object.insert(key, value);
            }
        }
    }
}

fn unwrap_result(json: Value, method: &str) -> Result<Value, String> {
    if let Some(error) = json.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        return Err(format!("MCP {method} error: {message}"));
    }
    json.get("result")
        .cloned()
        .ok_or_else(|| format!("MCP {method} returned no result"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_hint_parsing() {
        // No ttl → not cacheable.
        assert!(parse_cache_hint(&serde_json::json!({})).is_none());
        assert!(parse_cache_hint(&serde_json::json!({"ttlMs": 0})).is_none());

        // Result-level ttl, default private.
        let (ttl, scope) = parse_cache_hint(&serde_json::json!({"ttlMs": 5000})).unwrap();
        assert_eq!(ttl, Duration::from_millis(5000));
        assert_eq!(scope, CacheScope::Private);

        // _meta-level ttl + explicit public scope.
        let (ttl, scope) =
            parse_cache_hint(&serde_json::json!({"_meta": {"ttlMs": 1000, "cacheScope": "public"}}))
                .unwrap();
        assert_eq!(ttl, Duration::from_millis(1000));
        assert_eq!(scope, CacheScope::Public);

        // Absurd ttl is clamped to one hour.
        let (ttl, _) = parse_cache_hint(&serde_json::json!({"ttlMs": 999_999_999u64})).unwrap();
        assert_eq!(ttl, Duration::from_millis(60 * 60 * 1000));
    }

    #[test]
    fn unwrap_result_paths() {
        assert!(unwrap_result(serde_json::json!({"result": {"ok": true}}), "x").is_ok());
        assert!(unwrap_result(serde_json::json!({"error": {"message": "no"}}), "x").is_err());
        assert!(unwrap_result(serde_json::json!({}), "x").is_err());
    }
}
