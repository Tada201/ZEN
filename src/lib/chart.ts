/**
 * Canonical chart configuration shared by every rich-content surface that
 * renders ` ```chart ` blocks. Mirrors `src/lib/mermaid.ts`: one owner for the
 * schema, default palette, parse path, and size guard so chart renderers
 * cannot drift apart. The LLM contract for this schema lives in
 * `src-tauri/src/commands/chat/send.rs` (type / title / xAxis / keys / data).
 */

export const CHART_TYPES = ["bar", "line", "area", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartSpec {
  type: string;
  data: unknown[];
  keys: string[];
  xAxis?: string;
  colors?: string[];
  title?: string;
}

/** Canonical chart palette (bar/line/area series + pie slices). */
export const DEFAULT_CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

/**
 * Hard cap on chart JSON text size in characters. Parsing fails fast with
 * `tooLarge: true` before JSON.parse or the renderer ever touches a huge
 * payload, so oversized LLM output cannot jank the layout.
 */
export const MAX_CHART_CHARS = 50_000;

export interface ChartParseResult {
  spec: ChartSpec | null;
  /** True when the payload exceeded `MAX_CHART_CHARS` — a distinct failure. */
  tooLarge: boolean;
}

/**
 * Parse and validate a ` ```chart ` block payload. Strips redundant fences and
 * markdown JSON artifacts, then validates the canonical shape
 * (`{ type, data, keys, xAxis?, colors?, title? }`). Returns `spec: null`
 * for invalid input and `tooLarge: true` for oversized input so callers can
 * render a specific "too large" state instead of a generic fallback.
 */
export function parseChartContent(content: string): ChartParseResult {
  if (content.length > MAX_CHART_CHARS) {
    return { spec: null, tooLarge: true };
  }

  let cleaned = content.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { spec: null, tooLarge: false };
  }

  if (!parsed || typeof parsed !== "object") {
    return { spec: null, tooLarge: false };
  }

  const record = parsed as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : null;
  const keys = Array.isArray(record.keys)
    ? record.keys.filter((key): key is string => typeof key === "string")
    : [];
  if (!data || keys.length === 0) {
    return { spec: null, tooLarge: false };
  }

  return {
    spec: {
      type: typeof record.type === "string" ? record.type : "bar",
      data,
      keys,
      xAxis: typeof record.xAxis === "string" ? record.xAxis : undefined,
      colors: Array.isArray(record.colors) ? record.colors.map(String) : undefined,
      title: typeof record.title === "string" ? record.title : undefined,
    },
    tooLarge: false,
  };
}
