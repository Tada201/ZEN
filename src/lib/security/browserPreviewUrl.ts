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

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
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

/** Validate a URL before it is loaded in the interactive preview iframe. */
export function isSafeBrowserPreviewUrl(value: string): boolean {
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
  return !isPrivateHostname(parsed.hostname);
}

export function normalizeBrowserPreviewUrl(value: string): string | null {
  const input = value.trim();
  if (input === "about:blank") return input;
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return isSafeBrowserPreviewUrl(candidate) ? candidate : null;
}
