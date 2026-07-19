// Contract between the Rust `src-tauri/src/agent/context_breakdown.rs`
// and the React frontend. Keep field names + camelCase in sync with
// the Rust `#[serde(rename_all = "camelCase")]` attributes.
// Additions here should match additions on the Rust side; do not
// rename without a migration.

// The six canonical context buckets. One taxonomy shared with the Rust
// `SectionCategory` enum; the badge, hover popover, and full panel all
// render this exact set.
export type SectionCategory =
  | "messages"
  | "system-tools"
  | "mcp-tools"
  | "skills"
  | "system-prompt"
  | "meta-context";

export type ContextSectionId =
  | "safety-preamble"
  | "agent-instructions"
  | "time"
  | "ui-rules"
  | "drawing-canvas"
  | "graph-session"
  | "graph-session-state"
  | "direct-board"
  | "tool-system"
  | "todo-checklist"
  | "patch-rules"
  | "agent-roles"
  | "skills-catalog"
  | "semantic-recall"
  | "previous-summary"
  | "current-summary"
  | "conversation"
  | "system-tools-catalog"
  | "mcp-tools-catalog";

export type CompactionKind = "light" | "aggressive" | "message-count-cap";

export interface ContextSection {
  id: ContextSectionId;
  label: string;
  category: SectionCategory;
  tokens: number;
  chars: number;
  isMustKeep: boolean;
  isTruncated: boolean;
  isActive: boolean;
  /** Full body text. Always present so "Technical details"
   *  disclosure has real content per the chat-timeline rules. */
  body: string;
}

export interface CompactionEvent {
  kind: CompactionKind;
  preTokens: number;
  postTokens: number;
  targetTokens: number;
}

export interface ContextBreakdown {
  chatId: string;
  /**
   * Monotonic per-Runner.run() identifier minted from
   * `AppState.next_run_id`. Used as the dedupe axis alongside
   * `chatId` + `iteration` so a later, shorter run on the same chat
   * never gets silently overwritten by a stale, longer earlier run.
   * Comparisons happen in `useContextStore.apply`.
   */
  runId: number;
  iteration: number;
  totalTokens: number;
  /** Zen's soft compaction cap. NOT the model's hardware window. */
  contextWindow: number;
  /**
   * The selected model's real context window (`max_context_length`),
   * when known. Prefer this as the gauge denominator; falls back to
   * `contextWindow` when null. See {@link effectiveWindow}.
   */
  modelContextWindow: number | null;
  systemPromptTokens: number;
  /** Catalog cost of built-in tool definitions exposed to the model. */
  systemToolsTokens: number;
  /** Catalog cost of external MCP (`ext:*`) tool definitions exposed. */
  mcpToolsTokens: number;
  skillsCatalogTokens: number | null;
  recallTokens: number | null;
  summaryTokens: number;
  conversationTokens: number;
  compactionEvent: CompactionEvent | null;
  sections: ContextSection[];
}

/** Compact snapshot for the PremiumChatInput badge. */
export interface ContextSnapshot {
  chatId: string;
  /**
   * Mirrors `ContextBreakdown.runId` so the badge hydrate path (a
   * cold-start `/get_context_snapshot` call after a page reload or
   * mid-run tab open) and the live `context:breakdown` event path
   * agree on the same identifier contract. The store uses this as
   * the third axis of its `(chatId, runId, iteration)` dedupe rule.
   */
  runId: number | null;
  totalTokens: number;
  contextWindow: number;
  /** Real model window when known; falls back to `contextWindow`. */
  modelContextWindow: number | null;
  utilization: number;
  layerTotals: {
    systemPrompt: number;
    systemTools: number;
    mcpTools: number;
    skillsCatalog: number | null;
    recall: number | null;
    summary: number;
    conversation: number;
  };
  topSections: Array<{
    id: string;
    label: string;
    category: string;
    tokens: number;
    chars: number;
    isMustKeep: boolean;
    isTruncated: boolean;
    isActive: boolean;
  }>;
}

export const SECTION_CATEGORY_COLOR: Record<SectionCategory, string> = {
  messages: "#64748b",
  "system-tools": "#f59e0b",
  "mcp-tools": "#fb923c",
  skills: "#a78bfa",
  "system-prompt": "hsl(var(--primary))",
  "meta-context": "#10b981",
};

export const SECTION_CATEGORY_LABEL: Record<SectionCategory, string> = {
  messages: "Messages",
  "system-tools": "System tools",
  "mcp-tools": "MCP tools",
  skills: "Skills",
  "system-prompt": "System prompt",
  "meta-context": "Meta context",
};

/**
 * Stable render order for the six buckets in the popover + panel:
 * conversation first (usually the largest), then the two tool catalogs,
 * skills, the system prompt, and meta context.
 */
export const SECTION_CATEGORY_ORDER: SectionCategory[] = [
  "messages",
  "system-tools",
  "mcp-tools",
  "skills",
  "system-prompt",
  "meta-context",
];

/**
 * The denominator the gauge should divide against: the real model
 * window when the backend reported one, otherwise the compaction cap.
 * Accepts either payload shape so callers don't branch on which they
 * hold.
 */
export function effectiveWindow(source: {
  modelContextWindow: number | null;
  contextWindow: number;
}): number {
  const model = source.modelContextWindow;
  if (model != null && model > 0) return model;
  return Math.max(source.contextWindow, 1);
}

/**
 * Status thresholds for the badge. Kept conservative — the visible
 * gauge shifts to amber above 60% and to rose above 85% so compaction
 * intervention feels natural rather than alarming.
 */
export function utilizationStatus(utilization: number): "calm" | "amber" | "rose" {
  if (utilization >= 0.85) return "rose";
  if (utilization >= 0.6) return "amber";
  return "calm";
}

/**
 * Compact human-readable token formatter. Mirrors the "4.2K / 200K"
 * Codex-style display. Numbers under 1K are spelled out so the watcher
 * can tell whether things are growing fast.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}
