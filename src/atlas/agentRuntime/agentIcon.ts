import type { ToolCall } from "../components/chat/types";
import { humanizeToolName } from "../components/chat/ToolCallCard";
import { toToolInputRecord } from "../components/chat/tool/toToolInputRecord";

/**
 * Single source of truth for per-agent iconography. Keyed by agent id (and
 * display name, since legacy persisted traces carry only the name), values are
 * Iconify/codicon names consumed by `WorkbenchIcon`. Falls back to a generic
 * board icon for ad-hoc/unknown agents.
 */
const AGENT_ICONS: Record<string, string> = {
  generalist: "codicon:circuit-board",
  explore: "codicon:search",
  voice_display: "codicon:preview",
  Explore: "codicon:search",
};

export function agentIconName(agentId?: string, agentName?: string): string {
  return (
    (agentId && AGENT_ICONS[agentId])
    || (agentName && AGENT_ICONS[agentName])
    || "codicon:circuit-board"
  );
}

/**
 * The child's current/most-recent action as a short live-status line
 * ("Searching · today's news"), derived from its owned tool calls. A running
 * tool wins; otherwise the latest by sequence/startTime. Empty when no tools
 * have started yet so callers can fall back to a task subtitle.
 */
export function latestChildActivity(tools: ToolCall[]): string {
  if (tools.length === 0) return "";
  const ordered = [...tools].sort(
    (a, b) => (a.sequence ?? a.startTime ?? 0) - (b.sequence ?? b.startTime ?? 0),
  );
  const running = ordered.find((tool) => tool.status === "running");
  const tool = running || ordered[ordered.length - 1];
  const verb = humanizeToolName(tool.name, toToolInputRecord(tool.input));
  const target = childActionTarget(tool);
  return target ? `${verb} · ${target}` : verb;
}

function childActionTarget(tool: ToolCall): string {
  const input = toToolInputRecord(tool.input);
  const raw = input.file_path || input.path || input.query || input.url || input.command;
  if (typeof raw !== "string" || !raw.trim()) return "";
  const compact = raw.replace(/\\/g, "/").split("/").pop() || raw;
  return compact.length > 40 ? `${compact.slice(0, 40)}…` : compact;
}
