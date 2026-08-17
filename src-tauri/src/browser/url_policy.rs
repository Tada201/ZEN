//! Rust-side port of the frontend loopback-gated allowlist
//! (`src/lib/security/browserPreviewUrl.ts`). The renderer must never hand a
//! raw model/agent URL to the privileged embedded webview; every navigate goes
//! through here first (Security.md network rule).
//!
//! `allow_loopback` mirrors the address-bar case: localhost/127.x/::1 dev
//! servers are permitted only when explicitly opted in. LAN, link-local and
//! `.local` stay blocked regardless.

use std::net::{Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

/// Numeric IP hosts are classified by the parsed `Host` (below), so hostnames
/// like `127` that WHATWG normalizes to an IPv4 literal can never slip through
/// as an unmatched domain string. This handles only textual names.
fn is_private_domain(hostname: &str) -> bool {
    let normalized = hostname.trim_end_matches('.').to_ascii_lowercase();
    normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized == "local"
        || normalized.ends_with(".local")
        || normalized == "broadcasthost"
        || normalized == "ip6-localhost"
        || normalized == "ip6-loopback"
}

/// Loopback names are the only textual hosts opt-in loopback may permit.
fn is_loopback_domain(hostname: &str) -> bool {
    let normalized = hostname.trim_end_matches('.').to_ascii_lowercase();
    normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized == "ip6-localhost"
        || normalized == "ip6-loopback"
}

fn ipv4_blocked(ip: &Ipv4Addr, allow_loopback: bool) -> bool {
    if ip.is_loopback() {
        return !allow_loopback;
    }
    let o = ip.octets();
    ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.is_documentation()
        || o[0] == 0
        || (o[0] == 100 && (64..=127).contains(&o[1])) // shared address space 100.64/10
        || (o[0] == 192 && o[1] == 0 && o[2] == 0) // IETF protocol 192.0.0/24
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19)) // benchmarking 198.18/15
}

fn ipv6_blocked(ip: &Ipv6Addr, allow_loopback: bool) -> bool {
    if ip.is_loopback() {
        return !allow_loopback;
    }
    if let Some(v4) = ip.to_ipv4_mapped() {
        return ipv4_blocked(&v4, allow_loopback);
    }
    let head = ip.segments()[0];
    ip.is_unspecified()
        || ip.is_multicast()
        || (head & 0xfe00) == 0xfc00 // unique local fc00::/7
        || (head & 0xffc0) == 0xfe80 // link-local fe80::/10
}

/// Validate and canonicalize a URL for the embedded preview webview.
/// Returns the parsed `Url` on success, or an error message on rejection.
pub fn sanitize_preview_url(value: &str, allow_loopback: bool) -> Result<Url, String> {
    let input = value.trim();
    if input.is_empty() {
        return Err("Empty preview URL".to_string());
    }
    let candidate = if input.starts_with("http://") || input.starts_with("https://") {
        input.to_string()
    } else {
        format!("https://{input}")
    };

    let parsed = Url::parse(&candidate).map_err(|_| "Invalid preview URL".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Preview only allows http(s) URLs".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Preview URL must not contain credentials".to_string());
    }
    let host = parsed
        .host()
        .ok_or_else(|| "Preview URL is missing a host".to_string())?;
    let blocked = match &host {
        Host::Ipv4(ip) => ipv4_blocked(ip, allow_loopback),
        Host::Ipv6(ip) => ipv6_blocked(ip, allow_loopback),
        Host::Domain(name) => {
            let allowed_loopback = allow_loopback && is_loopback_domain(name);
            !allowed_loopback && is_private_domain(name)
        }
    };
    if blocked {
        return Err("Preview blocks private/LAN addresses".to_string());
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_https_allowed() {
        assert!(sanitize_preview_url("https://example.com", false).is_ok());
        assert!(sanitize_preview_url("example.com", false).is_ok());
    }

    #[test]
    fn loopback_gated() {
        assert!(sanitize_preview_url("http://localhost:5173", false).is_err());
        assert!(sanitize_preview_url("http://localhost:5173", true).is_ok());
        assert!(sanitize_preview_url("http://127.0.0.1:3000", true).is_ok());
        assert!(sanitize_preview_url("http://[::1]:3000", true).is_ok()); // ipv6 loopback honored under opt-in
        assert!(sanitize_preview_url("http://[::1]:3000", false).is_err());
    }

    #[test]
    fn numeric_short_form_loopback_not_bypassed() {
        // `127` normalizes to 127.0.0.1 via WHATWG host parsing; must not slip
        // through as an unmatched domain string.
        assert!(sanitize_preview_url("http://127", false).is_err());
        assert!(sanitize_preview_url("http://127", true).is_ok());
        assert!(sanitize_preview_url("http://0x7f.1", false).is_err());
        assert!(sanitize_preview_url("http://2130706433", false).is_err()); // 127.0.0.1 as u32
    }

    #[test]
    fn lan_and_local_blocked_even_with_loopback() {
        assert!(sanitize_preview_url("http://192.168.1.10", true).is_err());
        assert!(sanitize_preview_url("http://10.0.0.5", true).is_err());
        assert!(sanitize_preview_url("http://myapp.local", true).is_err());
        assert!(sanitize_preview_url("http://169.254.1.1", true).is_err());
    }

    #[test]
    fn credentials_rejected() {
        assert!(sanitize_preview_url("https://user:pass@example.com", false).is_err());
    }
}
