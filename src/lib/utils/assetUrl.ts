import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

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

  // Already a web-safe URL — pass through
  if (/^(https?|data|blob|asset):/.test(rawUrl)) return rawUrl;

  // Strip accidental file:// prefix the user may have pasted
  let localPath = rawUrl;
  if (localPath.startsWith("file:///")) {
    localPath = localPath.slice(8); // file:///C:/... → C:/...
  } else if (localPath.startsWith("file://")) {
    localPath = localPath.slice(7);
  }

  // Normalise forward-slashes for Windows (CSS url() sometimes eats backslashes)
  localPath = localPath.replace(/\//g, "\\");

  // Guard: only convert when running inside Tauri
  if (!isTauri()) return rawUrl;

  return convertFileSrc(localPath);
}
