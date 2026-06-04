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
