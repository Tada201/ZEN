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
  assistant.includes("CHAT_STATUS_PHASES.AgentStreaming") && assistant.includes("VISIBLE_CHAT_STATUS_PHASES"),
  "assistant message rendering should allow the live agent phase through the chat_status filter",
);
assert(
  trace.includes("phase === CHAT_STATUS_PHASES.AgentStreaming") && trace.includes("is working"),
  "trace row should present live agent work as a human-readable status",
);
assert(
  ledger.includes("agent-stream:") && ledger.includes("agentName"),
  "agent streaming rows should have stable ids so repeated events update instead of duplicating",
);

console.log("agent live status UX verified");
