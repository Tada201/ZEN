use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
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
