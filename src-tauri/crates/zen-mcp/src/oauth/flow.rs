//! Interactive OAuth 2.1 authorization-code + PKCE flow for MCP HTTP servers.
//!
//! Runs a one-shot loopback redirect listener on `127.0.0.1:<ephemeral>`,
//! opens the system browser to the authorization endpoint, waits for the
//! redirect carrying `code`+`state`, then exchanges the code (with the PKCE
//! verifier and the `resource` audience per RFC 8707) at the token endpoint.
//!
//! The listener binds loopback only and accepts exactly one request before
//! shutting down, bounded by `AUTH_TIMEOUT`. The `state` value is verified to
//! defeat CSRF, and the authorization code is never logged.

use std::time::Duration;

use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use super::discovery::{self, AuthServerMetadata};
use super::pkce::{self, PkcePair};
use super::token::StoredToken;
use zen_security::url_safety::build_pinned_http_client;

/// Overall wall-clock budget for a user to complete the browser consent.
const AUTH_TIMEOUT: Duration = Duration::from_secs(300);
/// Per-metadata / token HTTP request timeout.
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

/// Port for opening the system browser during the OAuth loopback flow.
/// The app impl wraps `tauri_plugin_opener`; tests substitute a no-op.
pub trait OAuthBrowser: Send + Sync {
    fn open_url(&self, url: &str) -> Result<(), String>;
}

/// Perform the full interactive authorization for `server_name` at
/// `server_url`, starting discovery from an optional 401 `resource_metadata`
/// challenge URL. Returns the token to persist. Does not touch the secret
/// store itself — the caller stores the result so this function stays
/// testable.
pub async fn authorize(
    browser: &dyn OAuthBrowser,
    server_url: &str,
    challenge_metadata_url: Option<&str>,
    client_id: &str,
    scopes: Option<&str>,
) -> Result<StoredToken, String> {
    let meta = discovery::discover(server_url, challenge_metadata_url, HTTP_TIMEOUT).await?;
    let pkce = PkcePair::generate();
    let state = pkce::random_state();

    // Bind the loopback listener first so we know the redirect port before
    // building the authorization URL.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("loopback bind failed: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("loopback addr failed: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let auth_url = build_authorize_url(&meta, client_id, &redirect_uri, &state, &pkce, scopes)?;
    browser
        .open_url(&auth_url)
        .map_err(|e| format!("failed to open browser for OAuth: {e}"))?;

    let code = wait_for_code(listener, &state).await?;
    exchange_code(&meta, client_id, &redirect_uri, &code, &pkce).await
}

/// Assemble the authorization-endpoint URL with all RFC 7636 / 8707 params.
fn build_authorize_url(
    meta: &AuthServerMetadata,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    pkce: &PkcePair,
    scopes: Option<&str>,
) -> Result<String, String> {
    let mut url = url::Url::parse(&meta.authorization_endpoint)
        .map_err(|e| format!("invalid authorization endpoint: {e}"))?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("response_type", "code");
        q.append_pair("client_id", client_id);
        q.append_pair("redirect_uri", redirect_uri);
        q.append_pair("state", state);
        q.append_pair("code_challenge", &pkce.challenge);
        q.append_pair("code_challenge_method", "S256");
        q.append_pair("resource", &meta.resource);
        if let Some(scope) = scopes {
            q.append_pair("scope", scope);
        }
    }
    Ok(url.to_string())
}

/// Accept exactly one loopback request, verify `state`, and return the
/// authorization `code`. Rejects a mismatched/absent state (CSRF defence).
async fn wait_for_code(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    let accept = async {
        loop {
            let (mut stream, _) = listener
                .accept()
                .await
                .map_err(|e| format!("loopback accept failed: {e}"))?;
            let mut buf = [0u8; 4096];
            let n = stream
                .read(&mut buf)
                .await
                .map_err(|e| format!("loopback read failed: {e}"))?;
            let request = String::from_utf8_lossy(&buf[..n]);
            let Some(target) = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
            else {
                write_response(&mut stream, "Invalid request.").await;
                continue;
            };
            // Ignore favicon / unrelated probes; only the callback path counts.
            if !target.starts_with("/callback") {
                write_response(&mut stream, "Waiting for authorization…").await;
                continue;
            }
            let full = format!("http://127.0.0.1{target}");
            let parsed = url::Url::parse(&full)
                .map_err(|e| format!("callback URL parse failed: {e}"))?;
            let mut code = None;
            let mut got_state = None;
            let mut oauth_error = None;
            for (k, v) in parsed.query_pairs() {
                match k.as_ref() {
                    "code" => code = Some(v.into_owned()),
                    "state" => got_state = Some(v.into_owned()),
                    "error" => oauth_error = Some(v.into_owned()),
                    _ => {}
                }
            }
            if let Some(err) = oauth_error {
                write_response(&mut stream, "Authorization denied. You can close this tab.").await;
                return Err(format!("authorization server returned error: {err}"));
            }
            if got_state.as_deref() != Some(expected_state) {
                write_response(&mut stream, "State mismatch. You can close this tab.").await;
                return Err("OAuth state mismatch (possible CSRF); aborting".to_string());
            }
            let Some(code) = code else {
                write_response(&mut stream, "Missing authorization code.").await;
                return Err("callback missing authorization code".to_string());
            };
            write_response(&mut stream, "Authorization complete. You can close this tab.").await;
            return Ok(code);
        }
    };
    tokio::time::timeout(AUTH_TIMEOUT, accept)
        .await
        .map_err(|_| "OAuth authorization timed out".to_string())?
}

/// Best-effort minimal HTTP 200 response so the browser shows a friendly
/// message. Errors are swallowed — the flow's success is decided by the code.
async fn write_response(stream: &mut tokio::net::TcpStream, message: &str) {
    let body = format!(
        "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:2rem\">{message}</body>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}

/// Exchange the authorization `code` for tokens at the token endpoint,
/// sending the PKCE `code_verifier` and the `resource` audience.
async fn exchange_code(
    meta: &AuthServerMetadata,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    pkce: &PkcePair,
) -> Result<StoredToken, String> {
    let parsed = url::Url::parse(&meta.token_endpoint)
        .map_err(|e| format!("invalid token endpoint: {e}"))?;
    let client = build_pinned_http_client(&parsed, HTTP_TIMEOUT).await?;
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
        ("code_verifier", &pkce.verifier),
        ("resource", &meta.resource),
    ];
    let resp = client
        .post(meta.token_endpoint.as_str())
        .header("Accept", "application/json")
        .form(&form)
        .timeout(HTTP_TIMEOUT)
        .send()
        .await
        .map_err(|e| format!("token exchange failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("token exchange returned HTTP {}", resp.status()));
    }
    let token: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("token response parse failed: {e}"))?;
    let obtained_at_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(StoredToken {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type,
        obtained_at_unix,
        expires_in_secs: token.expires_in,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_carries_pkce_and_resource() {
        let meta = AuthServerMetadata {
            authorization_endpoint: "https://as.example.com/authorize".into(),
            token_endpoint: "https://as.example.com/token".into(),
            resource: "https://api.example.com/mcp".into(),
        };
        let pkce = PkcePair::generate();
        let url = build_authorize_url(
            &meta,
            "client123",
            "http://127.0.0.1:5000/callback",
            "state-abc",
            &pkce,
            Some("mcp:read"),
        )
        .unwrap();
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains(&format!("code_challenge={}", pkce.challenge)));
        assert!(url.contains("resource=https%3A%2F%2Fapi.example.com%2Fmcp"));
        assert!(url.contains("state=state-abc"));
        assert!(url.contains("scope=mcp%3Aread"));
    }

    #[test]
    fn authorize_url_omits_scope_when_none_but_keeps_resource() {
        let meta = AuthServerMetadata {
            authorization_endpoint: "https://as.example.com/authorize".into(),
            token_endpoint: "https://as.example.com/token".into(),
            resource: "https://api.example.com/mcp".into(),
        };
        let pkce = PkcePair::generate();
        let url = build_authorize_url(
            &meta,
            "client123",
            "http://127.0.0.1:5000/callback",
            "state-xyz",
            &pkce,
            None,
        )
        .unwrap();
        assert!(!url.contains("scope="));
        // RFC 8707 audience must always be present, scope or not.
        assert!(url.contains("resource=https%3A%2F%2Fapi.example.com%2Fmcp"));
        // The verifier (secret) must never leak into the authorization URL.
        assert!(!url.contains(&pkce.verifier));
    }
}
