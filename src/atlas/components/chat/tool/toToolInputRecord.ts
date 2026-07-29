import type { ToolCall } from "../types";

/**
 * Shared tool-input parser. Normalizes a `ToolCall["input"]` value (which may
 * be a JSON string, an already-parsed object, or empty) into a plain
 * `Record<string, unknown>`.
 *
 * This is the single source of truth for tool-input parsing across the chat
 * timeline. It replaces the six duplicate `toRecord` / `asInputRecord` /
 * `toInputRecord` / `inputRecord` helpers that previously lived in:
 *  - `ToolCallCard.tsx` (`toRecord`)
 *  - `AgentExecutionTrace.tsx` (`asInputRecord`)
 *  - `ToolDetailView.tsx` (`toInputRecord`)
 *  - `TerminalContent.tsx` (`toInputRecord`)
 *  - `ImageContent.tsx` (`toInputRecord`)
 *  - `assistantMessageParts.ts` (`inputRecord`)
 *
 * Behavior is identical to the prior copies: non-object parsed results (arrays,
 * primitives) collapse to `{}` so downstream `record[key]` access is always
 * safe.
 */
export function toToolInputRecord(
  value: ToolCall["input"],
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== "string") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
