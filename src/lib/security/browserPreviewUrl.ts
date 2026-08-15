const IPV4_PATTERN = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(IPV4_PATTERN);
  if (!match) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

// Loopback is the dev-server case (`npm run dev` on 127.0.0.1/::1/localhost).
// It's a strict subset of the private range: LAN IPs (192.168/10/172.16) and
// link-local stay blocked even when loopback is opted in.
function isLoopbackHostname(normalized: string): boolean {
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "ip6-localhost" ||
    normalized === "ip6-loopback" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function isPrivateHostname(hostname: string, allowLoopback: boolean): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (allowLoopback && isLoopbackHostname(normalized)) return false;
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "local" ||
    normalized.endsWith(".local") ||
    normalized === "broadcasthost" ||
    normalized === "ip6-localhost" ||
    normalized === "ip6-loopback" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.includes(":") ||
    isPrivateIpv4(normalized)
  );
}

interface BrowserPreviewUrlOptions {
  /**
   * Permit loopback dev-server hosts (localhost/127.0.0.1/::1). Only pass true
   * for URLs the user typed into the address bar — never for agent-supplied or
   * chat-link URLs, which stay SSRF-guarded against loopback.
   */
  allowLoopback?: boolean;
}

/** Validate a URL before it is loaded in the interactive preview iframe. */
export function isSafeBrowserPreviewUrl(value: string, options: BrowserPreviewUrlOptions = {}): boolean {
  const input = value.trim();
  if (input === "about:blank") return true;
  if (!input) return false;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password || !parsed.hostname) return false;
  return !isPrivateHostname(parsed.hostname, options.allowLoopback === true);
}

export function normalizeBrowserPreviewUrl(value: string, options: BrowserPreviewUrlOptions = {}): string | null {
  const input = value.trim();
  if (input === "about:blank") return input;
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return isSafeBrowserPreviewUrl(candidate, options) ? candidate : null;
}
