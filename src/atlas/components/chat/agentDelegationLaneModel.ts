import type { Step } from "./types";

export type AgentDelegationLaneModel = {
  agentName: string;
  parentName: string;
  status: "running" | "completed" | "error" | "cancelled";
  task: string;
  resultSummary: string;
  durationMs?: number;
  iteration?: number;
};

export function buildAgentDelegationLaneModel(step: Step): AgentDelegationLaneModel | undefined {
  if (step.type !== "action" || (step.kind !== "agent_spawn" && step.kind !== "agent_complete")) return undefined;
  const spawn = step.metadata?.spawn;
  if (!spawn) return undefined;

  const status =
    step.status === "error" || spawn.status === "failed"
      ? "error"
      : step.status === "completed" || spawn.status === "completed"
        ? "completed"
        : step.status === "cancelled"
          ? "cancelled"
          : "running";

  return {
    agentName: spawn.childAgent || step.metadata?.agentName || step.metadata?.agentId || "agent",
    parentName: spawn.parentAgent || "main",
    status,
    task: spawn.task || step.content || "",
    resultSummary: step.metadata?.resultSummary || "",
    durationMs: spawn.durationMs,
    iteration: step.metadata?.iteration,
  };
}
