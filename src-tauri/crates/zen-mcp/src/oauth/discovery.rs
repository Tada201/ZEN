//! OAuth 2.1 metadata discovery for MCP HTTP servers.
//!
//! Implements the discovery half of the MCP authorization spec:
//! - **RFC 9728** protected-resource metadata
//!   (`.well-known/oauth-protected-resource`) to learn which authorization
//!   server(s) guard a given MCP resource, plus the canonical `resource`
//!   identifier used as the token audience.
//! - **RFC 8414** authorization-server metadata
//!   (`.well-known/oauth-authorization-server`) to learn the
//!   `authorization_endpoint` / `token_endpoint`.
//! - Parsing the `WWW-Authenticate: Bearer resource_metadata="…"` challenge a
//!   compliant MCP server returns on a 401 so we can start discovery from the
//!   exact metadata URL the server advertised.
//!
//! Every metadata fetch goes through the SSRF-pinned HTTP client, so a
//! malicious `resource_metadata` pointer can't be used to reach a private
//! address.

use serde::Deserialize;

use zen_security::url_safety::build_pinned_http_client;

/// The metadata needed to drive the authorization-code + PKCE flow.
#[derive(Debug, Clone)]
pub struct AuthServerMetadata {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    /// Canonical resource identifier (token audience) per RFC 8707. Defaults
    /// to the MCP server URL when the protected-resource metadata omits it.
    pub resource: String,
}

#[derive(Debug, Deserialize)]
struct ProtectedResourceMetadata {
    #[serde(default)]
    resource: Option<String>,
    #[serde(default)]
    authorization_servers: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct AuthorizationServerMetadata {
    authorization_endpoint: String,
    token_endpoint: String,
}

/// Extract the `resource_metadata` URL from a `WWW-Authenticate: Bearer …`
/// header value. Returns `None` when the parameter is absent (the caller then
/// falls back to the well-known path derived from the server URL).
pub fn parse_resource_metadata_challenge(header: &str) -> Option<String> {
    // Format: `Bearer realm="…", resource_metadata="https://…", error="…"`.
    // We only need the `resource_metadata` param; values may be quoted.
    let idx = header.find("resource_metadata")?;
    let after = &header[idx + "resource_metadata".len()..];
    let after = after.trim_start();
    let after = after.strip_prefix('=')?.trim_start();
    let value = if let Some(rest) = after.strip_prefix('"') {
        rest.split('"').next()?
    } else {
        after.split([',', ' ']).next()?
    };
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

/// Derive the default RFC 9728 protected-resource metadata URL from an MCP
/// server URL: `https://host/.well-known/oauth-protected-resource`.
fn default_protected_resource_url(server_url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(server_url)
        .map_err(|e| format!("invalid MCP server URL: {e}"))?;
    let origin = parsed.origin().ascii_serialization();
    Ok(format!("{origin}/.well-known/oauth-protected-resource"))
}

/// Fetch and validate a JSON metadata document from `url` through the
/// SSRF-pinned client. `timeout` bounds the request.
async fn fetch_metadata<T: serde::de::DeserializeOwned>(
    url: &str,
    timeout: std::time::Duration,
) -> Result<T, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid metadata URL: {e}"))?;
    let client = build_pinned_http_client(&parsed, timeout).await?;
    let resp = client
        .get(url)
        .header("Accept", "application/json")
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| format!("metadata fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("metadata fetch returned HTTP {}", resp.status()));
    }
    resp.json::<T>()
        .await
        .map_err(|e| format!("metadata parse failed: {e}"))
}

/// Run the full discovery chain for an MCP `server_url`, optionally starting
/// from the `resource_metadata` URL a 401 challenge advertised. Returns the
/// authorization-server metadata plus the canonical resource audience.
pub async fn discover(
    server_url: &str,
    challenge_metadata_url: Option<&str>,
    timeout: std::time::Duration,
) -> Result<AuthServerMetadata, String> {
    let pr_url = match challenge_metadata_url {
        Some(url) => url.to_string(),
        None => default_protected_resource_url(server_url)?,
    };
    let pr: ProtectedResourceMetadata = fetch_metadata(&pr_url, timeout).await?;
    let resource = pr.resource.unwrap_or_else(|| server_url.to_string());
    let as_url = pr
        .authorization_servers
        .into_iter()
        .next()
        .ok_or_else(|| "protected-resource metadata lists no authorization servers".to_string())?;

    // RFC 8414: the AS metadata lives at `<issuer>/.well-known/oauth-authorization-server`.
    let issuer = url::Url::parse(&as_url)
        .map_err(|e| format!("invalid authorization server URL: {e}"))?;
    let as_origin = issuer.origin().ascii_serialization();
    let path = issuer.path().trim_end_matches('/');
    let as_metadata_url = format!(
        "{as_origin}/.well-known/oauth-authorization-server{path}"
    );
    let meta: AuthorizationServerMetadata = fetch_metadata(&as_metadata_url, timeout).await?;

    Ok(AuthServerMetadata {
        authorization_endpoint: meta.authorization_endpoint,
        token_endpoint: meta.token_endpoint,
        resource,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_resource_metadata_from_challenge() {
        let h = r#"Bearer realm="mcp", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", error="invalid_token""#;
        assert_eq!(
            parse_resource_metadata_challenge(h).as_deref(),
            Some("https://api.example.com/.well-known/oauth-protected-resource")
        );
        // Unquoted form.
        let h2 = "Bearer resource_metadata=https://x.test/meta";
        assert_eq!(
            parse_resource_metadata_challenge(h2).as_deref(),
            Some("https://x.test/meta")
        );
        // Absent param.
        assert_eq!(parse_resource_metadata_challenge("Bearer realm=\"x\""), None);
    }

    #[test]
    fn derives_default_protected_resource_url() {
        assert_eq!(
            default_protected_resource_url("https://api.example.com/mcp/v1").unwrap(),
            "https://api.example.com/.well-known/oauth-protected-resource"
        );
    }

    #[test]
    fn challenge_metadata_with_path_and_port_preserved() {
        let h = r#"Bearer resource_metadata="https://auth.example.com:8443/tenant/.well-known/oauth-protected-resource""#;
        assert_eq!(
            parse_resource_metadata_challenge(h).as_deref(),
            Some("https://auth.example.com:8443/tenant/.well-known/oauth-protected-resource")
        );
    }

    #[test]
    fn rejects_malformed_server_url_for_default_metadata() {
        assert!(default_protected_resource_url("not a url").is_err());
    }
}
