const SAFE_GENERATED_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "asset:", "tauri:", "file:"]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0" || host === "asset.localhost") {
    return true;
  }

  // ── IPv4 private / link-local ranges ──
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("172.")) {
    const parts = host.split(".");
    if (parts.length >= 2) {
      const second = parseInt(parts[1], 10);
      if (!isNaN(second) && second >= 16 && second <= 31) {
        return true;
      }
    }
  }
  if (host.startsWith("169.254.")) return true;

  // ── IPv6 private ranges ──
  // ULA: fc00::/7 (fc00:: – fdff::)
  if (host.startsWith("fc") || host.startsWith("fd")) {
    const v6 = host.replace(/^\[|\]$/g, "");
    if (/^[0-9a-f]{2}/.test(v6) && v6.length >= 2) {
      const first = parseInt(v6.substring(0, 2), 16);
      if (first >= 0xfc && first <= 0xfd) return true;
    }
  }
  // Link-local: fe80::/10
  if (host.startsWith("fe")) {
    const v6 = host.replace(/^\[|\]$/g, "");
    if (/^fe[0-9a-f]/.test(v6) && v6.length >= 3) {
      const first = parseInt(v6.substring(0, 2), 16);
      if (first === 0xfe) {
        const second = parseInt(v6[2], 16);
        if (second >= 0x8 && second <= 0xb) return true;
      }
    }
  }

  return false;
}

/**
 * Shared check: does the URL path target the trusted `generated_images` directory?
 * Uses segment-level matching to prevent bypass via substring tricks.
 */
function isInsideGeneratedImagesDir(url: URL): boolean {
  const segments = url.pathname.split(/[/\\]/).filter(Boolean);
  return segments.includes("generated_images");
}

export function isSafeGeneratedHref(href?: string | null): href is string {
  if (!href) return false;

  try {
    const url = new URL(href, "https://zen.local");

    // ── Local asset server (http://asset.localhost/...) ──
    // Must target the trusted generated_images directory — no blanket allow.
    if (url.protocol === "http:" && url.host === "asset.localhost") {
      return isInsideGeneratedImagesDir(url);
    }

    // ── Local file protocols (file:, tauri:, asset:) ──
    if (url.protocol === "file:" || url.protocol === "tauri:" || url.protocol === "asset:") {
      // asset:// must point specifically to localhost host
      if (url.protocol === "asset:") {
        const host = url.hostname || "";
        const startsWithLocalhost = href.startsWith("asset://localhost/") || href.startsWith("asset://localhost:");
        if (host !== "localhost" && !startsWithLocalhost) {
          return false;
        }
      }
      // Must target the trusted generated_images directory to prevent directory traversal
      return isInsideGeneratedImagesDir(url);
    }

    // Prevent HTTP/HTTPS loading of private/loopback resources
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (isPrivateOrLoopbackHost(url.hostname)) {
        // asset.localhost on http is handled above; all other loopback hosts are blocked
        return false;
      }
    }

    return SAFE_GENERATED_HREF_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}
