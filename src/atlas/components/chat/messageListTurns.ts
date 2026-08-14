// Pure derivation for MessageList turn folding (no React, no DOM).
//
// A "turn" is one user message plus the assistant messages that follow until
// the next user message. Completed turns older than the most recent
// TURNS_KEEP_EXPANDED turns collapse to a one-line fold marker, keeping deep
// sessions scannable while rows stay in normal document flow (no
// virtualization).

export const TURNS_KEEP_EXPANDED = 2;

export interface TurnInfo {
  /** Id of the user message that opens the turn. */
  turnId: string;
  /** 0-based global turn ordinal across the whole message list. */
  turnIndex: number;
  /** Total messages in the turn (user message + assistant replies). */
  messageCount: number;
  /** Ids of every message in the turn, in order. */
  messageIds: string[];
}

/**
 * Groups a message list into turns. Every user message opens a new turn;
 * assistant messages attach to the current turn. A list that starts without a
 * user message (edge case) still forms a turn so the map is total.
 */
export function buildTurnMap(
  messages: readonly { id: string; role?: string }[],
): Map<string, TurnInfo> {
  const map = new Map<string, TurnInfo>();
  let current: TurnInfo | null = null;
  for (const message of messages) {
    if (message.role === "user" || current === null) {
      current = {
        turnId: message.id,
        turnIndex: current === null ? 0 : current.turnIndex + 1,
        messageCount: 1,
        messageIds: [message.id],
      };
    } else {
      current.messageCount += 1;
      current.messageIds.push(message.id);
    }
    map.set(message.id, current);
  }
  return map;
}

/**
 * Picks the turns that should render as fold markers:
 * - never the opening turn (index 0) — opening context stays visible
 * - never the most recent `keepExpanded` turns
 * - never a turn the reader explicitly expanded
 * A list with fewer than `keepExpanded + 2` turns has nothing old enough.
 */
export function deriveFoldedTurnIds(
  turnByMessageId: ReadonlyMap<string, TurnInfo>,
  totalTurns: number,
  expandedTurnIds: ReadonlySet<string>,
  keepExpanded = TURNS_KEEP_EXPANDED,
): ReadonlySet<string> {
  const folded = new Set<string>();
  if (totalTurns <= keepExpanded + 1) return folded;
  const firstKeptIndex = totalTurns - keepExpanded;
  for (const turn of turnByMessageId.values()) {
    if (turn.turnIndex === 0) continue;
    if (turn.turnIndex >= firstKeptIndex) continue;
    if (expandedTurnIds.has(turn.turnId)) continue;
    folded.add(turn.turnId);
  }
  return folded;
}

/** Maximum characters of the opening user prompt shown on a fold marker. */
export const TURN_FOLD_PREVIEW_CHARS = 48;

export interface TurnFoldLabel {
  /** "Turn 3 · 4 messages", or "…" with a prompt preview when one exists. */
  text: string;
  /** The (possibly elided) opening user prompt, trimmed. */
  preview: string;
}

/**
 * Builds the one-line fold marker label for a turn: the opening user prompt
 * (elided to TURN_FOLD_PREVIEW_CHARS) plus the message count, falling back to
 * a plain "Turn N · M messages" when the turn opens without a user message.
 */
export function deriveTurnFoldLabel(
  turn: TurnInfo,
  messages: readonly { id: string; content?: string }[],
  maxPreviewChars = TURN_FOLD_PREVIEW_CHARS,
): TurnFoldLabel {
  const opening = messages.find((message) => message.id === turn.turnId);
  const raw = (opening?.content ?? "").trim();
  const preview = raw
    ? `${raw.slice(0, maxPreviewChars)}${raw.length > maxPreviewChars ? "…" : ""}`
    : "";
  const count = `${turn.messageCount} message${turn.messageCount === 1 ? "" : "s"}`;
  const text = preview ? `"${preview}" · ${count}` : `Turn ${turn.turnIndex + 1} · ${count}`;
  return { text, preview };
}
