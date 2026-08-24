import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync("src-tauri/src/agent/runner/turn_loop.rs", "utf8") +
  readFileSync("src-tauri/src/agent/runner/step_exec.rs", "utf8");
const assistant = readFileSync("src/atlas/components/chat/AssistantMessage.tsx", "utf8");
const assistantLogic = readFileSync("src/atlas/components/chat/AssistantMessage.logic.ts", "utf8");
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
  assistantLogic.includes("VISIBLE_CHAT_STATUS_PHASES") &&
    assistantLogic.includes("isVisibleChatStatusStep") &&
    assistantLogic.includes('step.kind !== "chat_status"') &&
    assistantLogic.includes("selectParentWorkingStatus") &&
    assistantLogic.includes("hasActiveDelegation"),
  "assistant message status derivation should keep live phases out of raw chat_status cards while exposing one compact breathing indicator",
);
assert(
  assistant.includes('data-testid="chat-status-breathing-indicator"') &&
    assistant.includes('aria-live="polite"'),
  "assistant message rendering should expose one compact breathing indicator",
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
