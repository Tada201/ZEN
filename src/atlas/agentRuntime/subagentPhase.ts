import type { ToolCall } from "../components/chat/types";
import { latestChildActivity } from "./agentIcon";

export type SubagentPhaseStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete"
  | "uncertain"
  | "queued"
  | "stale"
  | string
  | undefined;

/**
 * Single source of truth for the user-facing subagent state word. Keeps the
 * inline marker, the Agents-panel rows, and the detail header consistent
 * instead of each inventing "Complete" vs "Completed" vs "Done".
 *
 * An unrecognized status must never read as "Done" — that would report an
 * unknown lifecycle state as a success. It maps to "Needs review", matching how
 * `normalizeScopedSubagentStatus` treats unknown values as `uncertain`.
 */
export function subagentPhaseLabel(status: SubagentPhaseStatus, stale = false): string {
  if (stale || status === "stale") return "Interrupted";
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Working";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Stopped";
    case "incomplete":
    case "uncertain":
    default:
      return "Needs review";
  }
}

/** True while the child still owns work — queued counts as active, not ended. */
export function isActiveSubagentStatus(status: SubagentPhaseStatus): boolean {
  return status === "running" || status === "queued";
}

/**
 * The live line for a running row. Prefers the child's current tool action
 * ("Searching · news"); otherwise returns a stable "Preparing…" so the row
 * always reserves one activity line and never jumps between heights while the
 * first tool spins up.
 */
export function runningActivityLine(tools: ToolCall[]): string {
  return latestChildActivity(tools) || "Preparing…";
}