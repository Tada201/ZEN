import { useUIStore } from "@/lib/stores/useUIStore";

type FocusOptions = {
  force?: boolean;
};

export function focusActiveAgentsPanel({ force = false }: FocusOptions = {}) {
  const ui = useUIStore.getState();

  // If the user explicitly closed/dismissed the agents panel during the current run, respect that decision.
  if (ui.agentsPanelDismissed) {
    return;
  }

  if (!force && ui.rightPanelOpen && ui.activeRightTab !== "agents") {
    return;
  }

  ui.setActiveRightTab("agents");
  ui.setRightPanelOpen(true);
}

export function shouldFocusAgentsForTool(payload: {
  agent_id?: string;
  agent_name?: string;
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
}) {
  return Boolean(
    payload.agent_id ||
    payload.agent_name ||
    payload.batch_id ||
    payload.batchId ||
    payload.tool_batch_id ||
    payload.toolBatchId,
  );
}

const GLOBAL_FOCUS_SPAWN_IDS = new Set<string>();

/**
 * Return true only the first time we see a given `spawn_id` in this
 * session. Subsequent calls for the same id are silent so the agents
 * panel state does not thrash on every subagent chunk.
 */
export function shouldFocusAgentsForSpawn(
  spawnId: string | undefined,
  registry: Set<string> = GLOBAL_FOCUS_SPAWN_IDS,
): boolean {
  if (!spawnId) return false;
  if (registry.has(spawnId)) return false;
  registry.add(spawnId);
  return true;
}

