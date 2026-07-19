import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

/**
 * Loose sanity check for "looks like a real local path or URL". Filters out stale
 * garbage in the settings store (e.g. legacy values like `"//"`) that would otherwise
 * be fed to `convertFileSrc` and produce a 403 from the asset protocol on every boot.
 */
function looksLikeAssetablePath(rawUrl: string): boolean {
  const v = rawUrl.trim();
  if (!v) return false;
  if (v === "/" || v === "\\" || v === "//" || v === "\\\\") return false;
  // Must contain at least one path-like character.
  if (!/[A-Za-z0-9_\-./\\:?]/.test(v)) return false;
  return true;
}

/**
 * Detects whether a URL string is a local filesystem path and converts it
 * to a Tauri asset-protocol URL that the webview is allowed to load.
 *
 * Remote URLs (http/https/data/blob/asset) are returned unchanged.
 * In non-Tauri environments, local paths are returned as-is (they won't work,
 * but at least we won't throw).
 */
export function toAssetUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  if (!looksLikeAssetablePath(rawUrl)) return "";

  let localPath = rawUrl;
  
  // If it's already an asset://localhost/ URI, unpack the absolute path out of it
  if (localPath.startsWith("asset://localhost/")) {
    localPath = localPath.replace(/^asset:\/\/localhost\/\/\/\?\//, "");
    localPath = localPath.replace(/^asset:\/\/localhost\//, "");
  } else if (/^(https?|data|blob):/.test(rawUrl)) {
    // Other web-safe URLs pass through
    return rawUrl;
  }

  // Strip accidental file:// prefix the user may have pasted
  if (localPath.startsWith("file:///")) {
    localPath = localPath.slice(8); // file:///C:/... → C:/...
  } else if (localPath.startsWith("file://")) {
    localPath = localPath.slice(7);
  }

  // Normalise forward-slashes for Windows (CSS url() sometimes eats backslashes)
  localPath = localPath.replace(/\\/g, "/");

  // Strip trailing hash/query fragments from local paths (e.g. #⚡️ Cyberpunk Night City)
  // which prevent filesystem resolution.
  const hashIdx = localPath.indexOf('#');
  if (hashIdx !== -1) {
    localPath = localPath.slice(0, hashIdx);
  }
  const queryIdx = localPath.indexOf('?');
  if (queryIdx !== -1) {
    localPath = localPath.slice(0, queryIdx);
  }

  // Guard: only convert when running inside Tauri
  if (!isTauri()) return rawUrl;

  return convertFileSrc(localPath);
}
