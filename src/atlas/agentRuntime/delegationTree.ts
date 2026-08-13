import type { Step, ToolCall } from "../components/chat/types";
import {
  mergeScopedSubagentRecords,
  projectScopedSubagents,
  scopedSubagentToStep,
  selectOwnedChildTools,
  type ScopedSubagentRecord,
} from "./subagentRuntime";

export type DelegationNode = ScopedSubagentRecord & {
  parentSpawnId?: string;
  depth: number;
  childAgentIds: string[];
  childToolCount: number;
  completedChildToolCount: number;
  runningChildToolCount: number;
  failedChildToolCount: number;
};

export type DelegationTree = {
  nodes: Map<string, DelegationNode>;
  steps: Map<string, Step>;
  childrenByParent: Map<string, Step[]>;
  roots: Step[];
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
      // duplicate nested cards.
      step: scopedSubagentToStep(record, previous?.step || step),
    });
  }
  return [...canonical.values()].map(({ step }) => step);
}

function toolOwnerMap(records: Map<string, ScopedSubagentRecord>, tools: ToolCall[]) {
  const owners = new Map<string, string>();

  // Explicit child ids are authoritative and win even if a malformed legacy
  // trace id points at another delegation.
  for (const record of records.values()) {
    for (const toolId of record.childToolCallIds) {
      if (toolId && !owners.has(toolId)) owners.set(toolId, record.spawnId);
    }
  }

  // Trace-id inference is only for records that predate explicit child ids.
  for (const record of records.values()) {
    if (record.childToolCallIds.length > 0) continue;
    for (const tool of tools) {
      if (tool.traceId === record.spawnId && !owners.has(tool.id)) {
        owners.set(tool.id, record.spawnId);
      }
    }
  }

  return owners;
}

function breakParentCycles(parentBySpawnId: Map<string, string>) {
  const spawnIds = [...parentBySpawnId.keys()].sort();
  for (const start of spawnIds) {
    const path: string[] = [];
    const indexById = new Map<string, number>();
    let current: string | undefined = start;
    while (current) {
      const priorIndex = indexById.get(current);
      if (priorIndex !== undefined) {
        const cycle = path.slice(priorIndex).sort();
        // Detach one deterministic node so every malformed tree retains a
        // visible root rather than disappearing from the parent timeline.
        if (cycle.length > 0) parentBySpawnId.delete(cycle[cycle.length - 1]);
        break;
      }
      indexById.set(current, path.length);
      path.push(current);
      current = parentBySpawnId.get(current);
    }
  }
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
  const subagentSteps = canonicalSubagentSteps(steps);
  const records = projectScopedSubagents(subagentSteps);
  const stepById = new Map<string, Step>();
  for (const step of subagentSteps) {
    const spawnId = step.subagent?.spawnId;
    if (spawnId) stepById.set(spawnId, step);
  }
  const toolList = tools || [];
  const ownerByToolId = toolOwnerMap(records, toolList);
  const parentBySpawnId = new Map<string, string>();

  for (const record of records.values()) {
    const parentToolCallId = record.parentToolCallId;
    if (!parentToolCallId) continue;
    const parentSpawnId = ownerByToolId.get(parentToolCallId)
      || [...records.values()].find((candidate) => candidate.childToolCallIds.includes(parentToolCallId))?.spawnId;
    if (parentSpawnId && parentSpawnId !== record.spawnId) {
      parentBySpawnId.set(record.spawnId, parentSpawnId);
    }
  }
  breakParentCycles(parentBySpawnId);

  const nodes = new Map<string, DelegationNode>();
  for (const record of records.values()) {
    const childTools = selectDelegationChildTools(
      { ...record, depth: 0, childAgentIds: [], childToolCount: 0, completedChildToolCount: 0, runningChildToolCount: 0, failedChildToolCount: 0 },
      toolList,
    );
    nodes.set(record.spawnId, {
      ...record,
      parentSpawnId: parentBySpawnId.get(record.spawnId),
      depth: 0,
      childAgentIds: [],
      childToolCount: childTools.length,
      completedChildToolCount: childTools.filter(isTerminal).length,
      runningChildToolCount: childTools.filter((tool) => tool.status === "running").length,
      failedChildToolCount: childTools.filter((tool) => tool.status === "error").length,
    });
  }

  // Resolve depth defensively so corrupt or cyclic persisted traces cannot
  // create an infinite render path.
  const resolveDepth = (spawnId: string, visiting = new Set<string>()): number => {
    const node = nodes.get(spawnId);
    if (!node || !node.parentSpawnId || visiting.has(spawnId)) return 0;
    const nextVisiting = new Set(visiting).add(spawnId);
    return Math.min(8, resolveDepth(node.parentSpawnId, nextVisiting) + 1);
  };

  for (const node of nodes.values()) {
    node.depth = resolveDepth(node.spawnId);
    if (node.parentSpawnId && nodes.has(node.parentSpawnId)) {
      nodes.get(node.parentSpawnId)!.childAgentIds.push(node.spawnId);
    }
  }

  // A spawn tool is represented by the nested card, not as ordinary parent
  // work. Recompute counts after parent edges are known so summaries report
  // direct child tools only and never double-count nested agents.
  for (const node of nodes.values()) {
    const nestedSpawnToolIds = new Set(
      node.childAgentIds
        .map((childId) => nodes.get(childId)?.parentToolCallId)
        .filter((id): id is string => Boolean(id)),
    );
    const directTools = selectDelegationChildTools(node, toolList)
      .filter((tool) => !nestedSpawnToolIds.has(tool.id));
    node.childToolCount = directTools.length;
    node.completedChildToolCount = directTools.filter(isTerminal).length;
    node.runningChildToolCount = directTools.filter((tool) => tool.status === "running").length;
    node.failedChildToolCount = directTools.filter((tool) => tool.status === "error").length;
  }

  const childrenByParent = new Map<string, Step[]>();
  const roots: Step[] = [];
  for (const step of subagentSteps) {
    const spawnId = step.subagent!.spawnId;
    const parentSpawnId = nodes.get(spawnId)?.parentSpawnId;
    if (parentSpawnId && nodes.has(parentSpawnId)) {
      const children = childrenByParent.get(parentSpawnId) || [];
      children.push(step);
      childrenByParent.set(parentSpawnId, children);
    } else {
      roots.push(step);
    }
  }

  return { nodes, steps: stepById, childrenByParent, roots };
}
