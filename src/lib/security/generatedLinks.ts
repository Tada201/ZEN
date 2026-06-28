const SAFE_GENERATED_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "asset:", "tauri:", "file:"]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0" || host === "asset.localhost") {
    return true;
  }
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
  return false;
}

/**
 * Shared check: does the URL path target the trusted `generated_images` directory?
 * Used for every local-file-like protocol to prevent directory traversal.
 */
function isInsideGeneratedImagesDir(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return path.includes("generated_images/") || path.includes("generated_images\\");
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
