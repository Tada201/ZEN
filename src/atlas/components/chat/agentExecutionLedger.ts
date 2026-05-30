import type { Step, ToolCall } from "./types";

export type ExecutionStatus = "running" | "completed" | "error" | "cancelled";

export type ExecutionLedgerAgent = {
  id: string;
  name: string;
  parentId?: string;
  task?: string;
  resultSummary?: string;
  status: ExecutionStatus;
  durationMs?: number;
  toolIds: string[];
  childAgentIds: string[];
};

export type ExecutionLedgerBatch = {
  id: string;
  label: string;
  explicit: boolean;
  agentIds: string[];
  toolIds: string[];
  startedAt?: number;
  completedAt?: number;
};

export type ExecutionLedger = {
  agents: ExecutionLedgerAgent[];
  batches: ExecutionLedgerBatch[];
  tools: ToolCall[];
  handoffs: Array<{ fromAgent: string; toAgent: string; reason?: string; timestamp?: number }>;
  rootAgentId: string;
  running: number;
  completed: number;
  errors: number;
  cancelled: number;
  active: boolean;
};

function normalizeAgentId(value: string | undefined) {
  return (value || "main").trim() || "main";
}

function getToolAgentId(toolCall: ToolCall) {
  return normalizeAgentId(toolCall.agentId || toolCall.agentName);
}

function getToolAgentName(toolCall: ToolCall) {
  return toolCall.agentName || toolCall.agentId || "main";
}

function getToolBatchKey(toolCall: ToolCall, currentBatch?: ExecutionLedgerBatch) {
  const explicitBatchId = toolCall.toolBatchId || toolCall.batchId;
  if (explicitBatchId) return `batch:${explicitBatchId}`;
  if (!currentBatch || typeof toolCall.startTime !== "number" || typeof currentBatch.startedAt !== "number") {
    return `single:${toolCall.id}`;
  }
  return Math.abs(toolCall.startTime - currentBatch.startedAt) < 750 ? currentBatch.id : `single:${toolCall.id}`;
}

function statusFromStep(step: Step): ExecutionStatus {
  if (step.status === "completed" || step.status === "error" || step.status === "cancelled") return step.status;
  return "running";
}

function statusFromTool(tool: ToolCall): ExecutionStatus {
  if (tool.status === "completed" || tool.status === "error") return tool.status;
  return "running";
}

function upsertAgent(map: Map<string, ExecutionLedgerAgent>, agent: Partial<ExecutionLedgerAgent> & { id: string; name?: string }) {
  const existing = map.get(agent.id);
  const next: ExecutionLedgerAgent = {
    id: agent.id,
    name: agent.name || existing?.name || agent.id,
    parentId: agent.parentId ?? existing?.parentId,
    task: agent.task || existing?.task,
    resultSummary: agent.resultSummary || existing?.resultSummary,
    status: agent.status || existing?.status || "running",
    durationMs: agent.durationMs ?? existing?.durationMs,
    toolIds: existing?.toolIds || [],
    childAgentIds: existing?.childAgentIds || [],
  };

  if (existing?.status === "completed" || existing?.status === "error" || existing?.status === "cancelled") {
    if (agent.status === "running" || agent.status === undefined) next.status = existing.status;
  }

  map.set(agent.id, next);
  if (next.parentId) {
    const parent = map.get(next.parentId) || {
      id: next.parentId,
      name: next.parentId,
      status: "running" as ExecutionStatus,
      toolIds: [],
      childAgentIds: [],
    };
    if (!parent.childAgentIds.includes(next.id)) parent.childAgentIds.push(next.id);
    map.set(parent.id, parent);
  }
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

export function buildExecutionLedger({
  steps = [],
  toolCalls = [],
}: {
  steps?: Step[];
  toolCalls?: ToolCall[];
}): ExecutionLedger {
  const agents = new Map<string, ExecutionLedgerAgent>();
  const batches = new Map<string, ExecutionLedgerBatch>();
  const handoffs: ExecutionLedger["handoffs"] = [];
  const lifecycleAgentIds = new Set<string>();

  upsertAgent(agents, { id: "main", name: "main", status: "running" });

  steps.forEach((step) => {
    if (step.type !== "action") return;
    const spawn = step.metadata?.spawn;
    if ((step.kind === "agent_spawn" || step.kind === "agent_complete") && spawn) {
      const childId = normalizeAgentId(step.metadata?.agentId || spawn.childAgent);
      const parentId = normalizeAgentId(spawn.parentAgent);
      lifecycleAgentIds.add(childId);
      upsertAgent(agents, {
        id: childId,
        name: spawn.childAgent || childId,
        parentId,
        task: spawn.task || step.content,
        resultSummary: step.metadata?.resultSummary,
        status: statusFromStep(step),
        durationMs: spawn.durationMs,
      });
    }

    const handoff = step.metadata?.handoff;
    if (step.kind === "agent_handoff" && handoff) {
      const fromAgent = handoff.fromAgent || "agent";
      const toAgent = handoff.toAgent || "agent";
      handoffs.push({ fromAgent, toAgent, reason: handoff.reason, timestamp: step.timestamp });
      upsertAgent(agents, { id: normalizeAgentId(fromAgent), name: fromAgent, status: statusFromStep(step) });
      upsertAgent(agents, { id: normalizeAgentId(toAgent), name: toAgent, status: "running" });
    }
  });

  const sortedTools = [...toolCalls].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  sortedTools.forEach((tool, index) => {
    const agentId = getToolAgentId(tool);
    const parentId = tool.parentAgentId && normalizeAgentId(tool.parentAgentId) !== agentId
      ? normalizeAgentId(tool.parentAgentId)
      : undefined;
    upsertAgent(agents, { id: agentId, name: getToolAgentName(tool), parentId, status: statusFromTool(tool) });
    addUnique(agents.get(agentId)!.toolIds, tool.id);

    const existingBatches = Array.from(batches.values());
    const lastBatch = existingBatches[existingBatches.length - 1];
    const batchKey = getToolBatchKey(tool, lastBatch);
    const explicitBatchId = tool.toolBatchId || tool.batchId;
    const explicit = Boolean(explicitBatchId);
    const batch = batches.get(batchKey) || {
      id: batchKey,
      label: explicit ? `Batch ${explicitBatchId}` : batchKey.startsWith("single:") ? `Tool ${index + 1}` : `Parallel batch ${batches.size + 1}`,
      explicit,
      agentIds: [],
      toolIds: [],
      startedAt: tool.startTime,
      completedAt: tool.completedAt,
    };
    batch.explicit = batch.explicit || explicit;
    batch.startedAt = Math.min(batch.startedAt ?? tool.startTime ?? 0, tool.startTime ?? batch.startedAt ?? 0);
    batch.completedAt = Math.max(batch.completedAt ?? tool.completedAt ?? 0, tool.completedAt ?? batch.completedAt ?? 0) || undefined;
    addUnique(batch.agentIds, agentId);
    addUnique(batch.toolIds, tool.id);
    if (!batch.explicit && batch.toolIds.length > 1) {
      batch.label = `Parallel batch ${Array.from(batches.values()).filter((item) => !item.explicit && item.toolIds.length > 1).length + 1}`;
    }
    batches.set(batchKey, batch);
  });

  const ledgerAgents = Array.from(agents.values());
  const terminalAgents = ledgerAgents.filter((agent) => agent.id !== "main");
  const lifecycleAgents = terminalAgents.filter((agent) => lifecycleAgentIds.has(agent.id));
  const runningTools = toolCalls.filter((tool) => tool.status === "running" || tool.status === "awaiting_approval").length;
  const errorTools = toolCalls.filter((tool) => tool.status === "error").length;
  const completedTools = toolCalls.filter((tool) => tool.status === "completed").length;

  return {
    agents: ledgerAgents,
    batches: Array.from(batches.values()),
    tools: toolCalls,
    handoffs,
    rootAgentId: "main",
    running: runningTools + lifecycleAgents.filter((agent) => agent.status === "running").length,
    completed: completedTools + lifecycleAgents.filter((agent) => agent.status === "completed").length,
    errors: errorTools + lifecycleAgents.filter((agent) => agent.status === "error").length,
    cancelled: lifecycleAgents.filter((agent) => agent.status === "cancelled").length,
    active: runningTools > 0 || lifecycleAgents.some((agent) => agent.status === "running"),
  };
}
