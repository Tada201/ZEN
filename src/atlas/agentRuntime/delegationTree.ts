import type { Step, ToolCall } from "../components/chat/types";
import {
  mergeScopedSubagentRecords,
  projectScopedSubagents,
  scopedSubagentToStep,
  selectOwnedChildTools,
  type ScopedSubagentRecord,
} from "./subagentRuntime";

// Delegation is root-only: the backend refuses spawn_agent calls from
// subagents, so no new trace can nest. Traces persisted while nested
// delegation existed keep their parent fields in storage, but they render
// flat here like every other delegation.
export type DelegationNode = ScopedSubagentRecord & {
  childToolCount: number;
  completedChildToolCount: number;
  runningChildToolCount: number;
  failedChildToolCount: number;
};

export type DelegationTree = {
  nodes: Map<string, DelegationNode>;
  steps: Map<string, Step>;
  roots: Step[];
};

// Shared by the no-subagent fast path below. Consumers only read from it, so
// one frozen instance serves every streaming frame without reallocation.
const EMPTY_DELEGATION_TREE: DelegationTree = {
  nodes: new Map<string, DelegationNode>(),
  steps: new Map<string, Step>(),
  roots: [],
};

function isTerminal(tool: ToolCall) {
  return tool.status === "completed" || tool.status === "error";
}

function canonicalSubagentSteps(steps: Step[] | undefined): Step[] {
  const canonical = new Map<string, { record: ScopedSubagentRecord; step: Step }>();
  for (const step of steps || []) {
    if (step.type !== "subagent" || !step.subagent?.spawnId?.trim()) continue;
    const incoming = projectScopedSubagents([step]).get(step.subagent.spawnId.trim());
    if (!incoming) continue;
    const previous = canonical.get(incoming.spawnId);
    const record = mergeScopedSubagentRecords(previous?.record, incoming);
    canonical.set(incoming.spawnId, {
      record,
      // Keep the first timeline position, but merge all later lifecycle fields
      // into that one canonical row so duplicate reload events do not render
      // duplicate cards.
      step: scopedSubagentToStep(record, previous?.step || step),
    });
  }
  return [...canonical.values()].map(({ step }) => step);
}

/**
 * Resolve only tools explicitly owned by a delegation. The trace-id and
 * parent-tool fallbacks are retained for imported history by the shared
 * selector, but never use broad agent-name matching.
 */
export function selectDelegationChildTools(node: DelegationNode, tools: ToolCall[]) {
  return selectOwnedChildTools(node, tools);
}

export function buildDelegationTree(
  steps: Step[] | undefined,
  tools: ToolCall[] | undefined,
): DelegationTree {
  // Most turns never spawn a subagent, but streaming replaces the steps array
  // reference on every reveal frame — skip the whole multi-pass build unless a
  // subagent step actually exists.
  if (!steps?.some((step) => step.type === "subagent")) return EMPTY_DELEGATION_TREE;
  const subagentSteps = canonicalSubagentSteps(steps);
  const records = projectScopedSubagents(subagentSteps);
  const stepById = new Map<string, Step>();
  for (const step of subagentSteps) {
    const spawnId = step.subagent?.spawnId;
    if (spawnId) stepById.set(spawnId, step);
  }
  const toolList = tools || [];

  const nodes = new Map<string, DelegationNode>();
  for (const record of records.values()) {
    const childTools = selectOwnedChildTools(record, toolList);
    nodes.set(record.spawnId, {
      ...record,
      childToolCount: childTools.length,
      completedChildToolCount: childTools.filter(isTerminal).length,
      runningChildToolCount: childTools.filter((tool) => tool.status === "running").length,
      failedChildToolCount: childTools.filter((tool) => tool.status === "error").length,
    });
  }

  // Root-only delegation: every canonical step is a flat sibling in the
  // parent timeline.
  return { nodes, steps: stepById, roots: subagentSteps };
}
