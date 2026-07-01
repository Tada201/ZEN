use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use url::Url;

pub const MAX_DIRECT_RESPONSE_BYTES: usize = 1024 * 1024;
pub const MAX_OUTPUT_CHARS: usize = 16 * 1024;
pub const MAX_REDIRECTS: usize = 5;
pub const REQUEST_TIMEOUT_SECS: u64 = 10;

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
