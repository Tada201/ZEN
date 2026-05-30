import type { Step } from "../../components/chat/types";

export function createLocalFirstFeedbackStep({
  provider,
  model,
  tools,
  generativeUI,
  deepResearch,
  timestamp = Date.now(),
}: {
  provider?: string;
  model?: string;
  tools?: string[];
  generativeUI?: boolean;
  deepResearch?: boolean;
  timestamp?: number;
}): Step {
  const enabledTools = Array.isArray(tools) ? tools.filter(Boolean) : [];
  const mode = deepResearch ? "research" : generativeUI ? "gen-ui" : enabledTools.length > 0 ? "tools" : "chat";
  const content =
    mode === "research"
      ? "Queued research run"
      : mode === "gen-ui"
        ? "Preparing generative UI run"
        : enabledTools.length > 0
          ? `Preparing ${enabledTools.length} tool${enabledTools.length === 1 ? "" : "s"}`
          : "Preparing model response";

  return {
    type: "action",
    kind: "chat_status",
    content,
    status: "running",
    timestamp,
    eventId: "status:local:local_queued",
    metadata: {
      phase: "local_queued",
      message: content,
      provider,
      model,
      tools: enabledTools,
      toolCount: enabledTools.length,
      parallel: enabledTools.length > 1,
    },
  };
}
