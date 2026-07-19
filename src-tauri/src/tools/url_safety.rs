use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use url::Url;

pub const MAX_DIRECT_RESPONSE_BYTES: usize = 1024 * 1024;
pub const MAX_OUTPUT_CHARS: usize = 16 * 1024;
pub const MAX_REDIRECTS: usize = 5;
pub const REQUEST_TIMEOUT_SECS: u64 = 10;

/// Normalize an `IpAddr` against the rules this module enforces on every
/// URL path. Both the literal-IP branch (`validate_public_http_url`)
/// and the DNS-pinned branch (`validate_url_dns_safety`,
/// `build_pinned_get_request`) MUST funnel through this helper so a
/// round-trip bypass cannot occur.
///
/// Specifically: any IPv6 address that is an IPv4-mapped IPv6 literal
/// (`::ffff:a.b.c.d`) is unwrapped to its inner IPv4 before the block
/// rules run. Without this, `http://[::ffff:127.0.0.1]/` would pass
/// the IPv6 check (the underlying IPv6 has no loopback / private flag)
/// while still resolving to the IPv4 loopback — defeating the
/// public-IP guarantee.
fn normalize_ip_for_check(ip: IpAddr) -> IpAddr {
    if let IpAddr::V6(v6) = ip {
        if let Some(v4) = v6.to_ipv4_mapped() {
            return IpAddr::V4(v4);
        }
    }
    ip
}
pub fn validate_public_http_url(raw_url: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("URL scheme must be http or https".to_string()),
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must include a host".to_string())?;

    if host.eq_ignore_ascii_case("localhost") {
        return Err("localhost URLs are not allowed".to_string());
    }

    let ip_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = ip_host.parse::<IpAddr>() {
        validate_public_ip(ip)?;
    }

    Ok(parsed)
}

pub fn validate_public_ip(ip: IpAddr) -> Result<(), String> {
    // Normalize IPv4-mapped IPv6 literals so the same set of block rules
    // applies regardless of whether the attacker wrote the dotted-quad
    // directly or wrapped it in the IPv6 mapping prefix. Without this,
    // the literal-IP path could pass `is_blocked_ipv6` while the resolved
    // connection lands on a private/loopback IPv4 host.
    let ip = normalize_ip_for_check(ip);
    let blocked = match ip {
        IpAddr::V4(ip) => is_blocked_ipv4(ip),
        IpAddr::V6(ip) => is_blocked_ipv6(ip),
    };

    if blocked {
        Err(format!(
            "Private, local, or reserved IP is not allowed: {}",
            ip
        ))
    } else {
        Ok(())
    }
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.octets()[0] == 0
        || ip.octets()[0] >= 224
        || ip.octets() == [169, 254, 169, 254]
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || ((ip.segments()[0] == 0x2001) && (ip.segments()[1] == 0x0db8))
        || ip.is_multicast()
}

pub fn resolve_redirect_url(current: &Url, location: &str) -> Result<Url, String> {
    current
        .join(location)
        .map_err(|e| format!("Invalid redirect URL: {}", e))
        .and_then(|url| validate_public_http_url(url.as_str()))
}

pub async fn validate_url_dns_safety(parsed_url: &Url) -> Result<(), String> {
    let host = parsed_url.host_str().ok_or_else(|| "URL must include a host".to_string())?;

    if host.eq_ignore_ascii_case("localhost") {
        return Err("localhost URLs are not allowed".to_string());
    }

    let ip_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = ip_host.parse::<std::net::IpAddr>() {
        validate_public_ip(ip)?;
    } else {
        let lookup_target = format!("{}:80", host);
        let addrs = tokio::net::lookup_host(lookup_target).await
            .map_err(|e| format!("DNS resolution failed for {}: {}", host, e))?;

        for addr in addrs {
            validate_public_ip(addr.ip())?;
        }
    }

    Ok(())
}

/// Build a `reqwest::RequestBuilder` for `url` that is DNS-pinned to a single
/// validated `SocketAddr`.
///
/// This resolves the hostname exactly once, validates every returned IP
/// against the public-IP rules, then returns a request whose underlying
/// client has been overridden with `.resolve(host, addr)` so the connection
/// cannot silently re-resolve the hostname to a different (potentially
/// private) IP. The original hostname is preserved on the URL so TLS SNI
/// and the HTTP `Host` header remain correct.
///
/// Prefer this helper over `validate_url_dns_safety` + `client.get(url)`:
/// the latter validates one resolution and then issues a hostname-based
/// request that re-resolves under the hood, defeating the safety check.
///
/// Note: in reqwest 0.12 `resolve` is only available on `ClientBuilder`,
/// not on `Client`, so we build a fresh pinned client internally. The
/// `client` parameter is accepted so call sites that already hold a
/// `Client` keep a uniform call shape. The fresh client mirrors the
/// `public_no_redirect_http_client` defaults (10s timeout, no auto-redirect)
/// so the existing manual redirect-handling logic in `web_fetch.rs` keeps
/// working. If the caller's original client has different settings, the
/// caller must apply them to the returned `RequestBuilder` before sending.
pub async fn build_pinned_get_request(
    _client: &reqwest::Client,
    url: &reqwest::Url,
) -> Result<reqwest::RequestBuilder, String> {
    use std::time::Duration;

    let host = url
        .host_str()
        .ok_or_else(|| "URL must include a host".to_string())?;

    if host.eq_ignore_ascii_case("localhost") {
        return Err("localhost URLs are not allowed".to_string());
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| "URL must include a valid port".to_string())?;

    // If the URL already uses a literal IP, validate it directly and pin
    // to that same IP. `.resolve` is then a no-op for the host mapping
    // but the explicit pin keeps the request consistent with the
    // hostname-based path.
    let ip_host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = ip_host.parse::<std::net::IpAddr>() {
        validate_public_ip(ip)?;
        let addr = SocketAddr::new(ip, port);
        let pinned = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .redirect(reqwest::redirect::Policy::none())
            .resolve(host, addr)
            .build()
            .map_err(|e| format!("Failed to build pinned HTTP client: {}", e))?;
        return Ok(pinned.get(url.clone()));
    }

    let lookup_target = format!("{}:{}", host, port);
    let addrs = tokio::net::lookup_host(&lookup_target)
        .await
        .map_err(|e| format!("DNS resolution failed for {}: {}", host, e))?;

    let pinned_addr = addrs
        .map(|addr| {
            validate_public_ip(addr.ip())?;
            Ok::<_, String>(addr)
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .next()
        .ok_or_else(|| "DNS resolution returned no public addresses".to_string())?;

    let pinned = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .resolve(host, pinned_addr)
        .build()
        .map_err(|e| format!("Failed to build pinned HTTP client: {}", e))?;
    Ok(pinned.get(url.clone()))
}

#[cfg(test)]
mod ipv6_mapped_ipv4_tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    #[test]
    fn rejects_ipv6_mapped_loopback_literal() {
        // `::ffff:127.0.0.1` looks like a benign IPv6 but resolves to
        // the IPv4 loopback. The literal-IP path through
        // `validate_public_http_url` must reject it the same way it
        // rejects `http://127.0.0.1/`.
        assert!(validate_public_http_url("http://[::ffff:127.0.0.1]/").is_err());
        assert!(validate_public_http_url("https://[::ffff:127.0.0.1]/").is_err());
    }

    #[test]
    fn rejects_ipv6_mapped_rfc1918_literal() {
        for raw in [
            "http://[::ffff:10.0.0.1]/",
            "http://[::ffff:192.168.1.10]/",
            "http://[::ffff:172.16.0.1]/",
        ] {
            assert!(
                validate_public_http_url(raw).is_err(),
                "expected rejection of {}",
                raw
            );
        }
    }

    #[test]
    fn rejects_ipv6_mapped_link_local_metadata_literal() {
        // The cloud-metadata endpoint trick wrapped in IPv6 mapping:
        // `::ffff:169.254.169.254`. Without normalization this passes
        // the IPv6 block rules (which only check the first 32 / 16 bits).
        assert!(validate_public_http_url("http://[::ffff:169.254.169.254]/").is_err());
    }

    #[test]
    fn accepts_ipv6_mapped_public_literal() {
        // The normalization should ONLY down-rank mapped addresses that
        // are themselves blocked; public IPv4-mapped IPv6 literals
        // must continue to pass. The chosen public IP (8.8.8.8) is
        // owned by Google and is universally routable on test networks.
        assert!(validate_public_http_url("https://[::ffff:8.8.8.8]/path").is_ok());
    }

    #[test]
    fn validate_public_ip_direct_ipv6_mapped_loopback() {
        // Bypass `validate_public_http_url`'s URL parser and run
        // through `validate_public_ip` directly to assert the
        // normalization applies at the lowest layer — any caller that
        // bypasses the URL parser still gets the same answer.
        let mapped: Ipv6Addr = "::ffff:127.0.0.1".parse().unwrap();
        let addr = IpAddr::V6(mapped);
        assert!(validate_public_ip(addr).is_err());
    }

    #[test]
    fn validate_public_ip_direct_ipv6_mapped_rfc1918() {
        for raw in ["::ffff:10.0.0.1", "::ffff:10.255.255.255", "::ffff:192.168.0.1", "::ffff:172.31.255.255"] {
            let mapped: Ipv6Addr = raw.parse().unwrap();
            assert!(
                validate_public_ip(IpAddr::V6(mapped)).is_err(),
                "expected rejection of mapped {}",
                raw
            );
        }
    }

    #[test]
    fn validate_public_ip_direct_ipv6_mapped_metadata() {
        let mapped: Ipv6Addr = "::ffff:169.254.169.254".parse().unwrap();
        assert!(validate_public_ip(IpAddr::V6(mapped)).is_err());
    }

    #[test]
    fn validates_native_loopback_ipv4_unchanged() {
        // Sanity: the normalization must not break the existing IPv4
        // loopback rejection — both the URL and direct validation
        // paths must still deny plain `127.0.0.1`.
        assert!(validate_public_http_url("http://127.0.0.1/").is_err());
        assert!(validate_public_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))).is_err());
    }

    #[test]
    fn rejects_ipv4_in_ipv6_with_mapped_oversized_v4() {
        // Casting smoke test on the unwrap path — the IPv4 inside the
        // mapping must be the literal dotted-quad from the prefix, not
        // a different address.
        let mapped: Ipv6Addr = "::ffff:127.0.0.99".parse().unwrap();
        let unwrapped = mapped.to_ipv4_mapped().expect("should unwrap to v4");
        assert_eq!(unwrapped, Ipv4Addr::new(127, 0, 0, 99));
        assert!(validate_public_ip(IpAddr::V6(mapped)).is_err());
    }
}
