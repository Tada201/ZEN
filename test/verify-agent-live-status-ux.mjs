import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync("src-tauri/src/agent/runner/loop.rs", "utf8");
const assistant = readFileSync("src/atlas/components/chat/AssistantMessage.tsx", "utf8");
const trace = readFileSync("src/atlas/components/chat/AssistantMessageTrace.tsx", "utf8");
const ledger = readFileSync("src/atlas/hooks/stream/agentActionLedger.ts", "utf8");

assert(
  runner.includes("ChatStatusPhase::AGENT_STREAMING.to_string()"),
  "non-generalist agent runs should emit a visible live streaming phase",
);
assert(
  runner.includes('current_agent.id == "generalist"'),
  "simple generalist turns should keep the quiet agent_step phase instead of showing noisy execution rows",
);
assert(
  assistant.includes("VISIBLE_CHAT_STATUS_PHASES") &&
    assistant.includes("CHAT_STATUS_PHASES.ToolCallStreaming") &&
    assistant.includes("CHAT_STATUS_PHASES.ToolCallReady") &&
    !assistant.includes("CHAT_STATUS_PHASES.AgentStreaming"),
  "assistant message rendering should keep the live agent phase out of chat_status cards",
);
assert(
  ledger.includes("shouldSkipChatActionStep") &&
    ledger.includes("phase === CHAT_STATUS_PHASES.AgentStreaming") &&
    ledger.includes("return prev;"),
  "agent streaming should stay out of chat cards while tool status cards remain visible",
);
assert(
  ledger.includes("agent-stream:") && ledger.includes("agentName"),
  "agent streaming rows should have stable ids so repeated events update instead of duplicating",
);

console.log("agent live status UX verified");
