/**
 * Format a duration in milliseconds to a compact human-readable string.
 * - < 1000 ms: "123ms"
 * - < 10000 ms: "1.2s"
 * - >= 10000 ms: "12s"
 */
export function formatDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}
