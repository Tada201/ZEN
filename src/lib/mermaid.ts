import type { MermaidConfig } from "mermaid";

type MermaidApi = typeof import("mermaid").default;

let mermaidImportPromise: Promise<MermaidApi> | null = null;

/**
 * Canonical Mermaid initialization settings shared by every diagram surface
 * (chat timeline, artifact panel, voice board). Keep renderer-critical flags
 * here so surfaces cannot drift apart:
 * - `startOnLoad: false` — diagrams are rendered explicitly via
 *   `mermaid.render()`, never auto-scanned from the DOM.
 * - `securityLevel: "strict"` — model-supplied diagram text must not execute
 *   scripts or embed untrusted HTML.
 * - `suppressErrorRendering: true` — on failure Mermaid must throw instead of
 *   injecting its "Syntax error" SVG node into the real DOM (it falls back to
 *   document.body when no container matches the render id, which breaks the
 *   layout by rendering out of viewport). Callers render their own fallback.
 */
/**
 * Hard cap on diagram text size in characters. `renderMermaidDiagram` fails
 * fast with a `MermaidSizeError` before the parser ever sees strings above
 * this, so oversized LLM output cannot jank the renderer or blow out the
 * layout. The `maxTextSize` config below mirrors this value so the two limits
 * can never disagree.
 */
export const MAX_DIAGRAM_CHARS = 20_000;

/** Thrown by `renderMermaidDiagram` when the diagram text exceeds
 *  `MAX_DIAGRAM_CHARS`. Carries size/limit so UIs can offer a condense action. */
export class MermaidSizeError extends Error {
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(
      `Diagram is too large to render (${size.toLocaleString()} characters; limit ${limit.toLocaleString()}). Ask the model to condense it.`,
    );
    this.name = "MermaidSizeError";
    this.size = size;
    this.limit = limit;
  }
}

export const MERMAID_BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  // Backstop: anything that slips past the fail-fast guard throws Mermaid's
  // own size error instead of rendering an enormous diagram.
  maxTextSize: MAX_DIAGRAM_CHARS,
} as const satisfies Partial<MermaidConfig>;

/** Full init config for a resolved theme (`"dark"` or anything else). */
export function getMermaidInitConfig(theme: string | undefined): Partial<MermaidConfig> {
  return {
    ...MERMAID_BASE_CONFIG,
    theme: theme === "dark" ? "dark" : "default",
  };
}

/** Lazily load the mermaid module once; all surfaces share this singleton. */
export function loadMermaid(): Promise<MermaidApi> {
  mermaidImportPromise ??= import("mermaid").then((module) => module.default);
  return mermaidImportPromise;
}

/**
 * Render a Mermaid diagram with the canonical config. Returns the raw SVG
 * string; callers are responsible for sanitizing before DOM injection.
 * Throws when the diagram is invalid — the caller owns the error UX.
 */
export async function renderMermaidDiagram(
  code: string,
  theme: string | undefined,
): Promise<string> {
  if (code.length > MAX_DIAGRAM_CHARS) {
    throw new MermaidSizeError(code.length, MAX_DIAGRAM_CHARS);
  }
  const mermaid = await loadMermaid();
  mermaid.initialize(getMermaidInitConfig(theme));
  const id = `mermaid-${Math.random().toString(36).substring(7)}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}

/**
 * Mermaid parse errors echo the full offending source line plus caret markers,
 * which can be very long and overflow the chat column. Collapse to one line and
 * cap the length; the full error belongs in the console for diagnosis.
 */
export const MAX_ERROR_LENGTH = 300;

export function formatMermaidError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_ERROR_LENGTH
    ? `${collapsed.slice(0, MAX_ERROR_LENGTH).trimEnd()}…`
    : collapsed;
}
