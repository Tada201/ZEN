import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const agentEventsSource = readFileSync(new URL("../src/atlas/hooks/stream/useAgentEvents.ts", import.meta.url), "utf8");
const chatCommandSource = readFileSync(new URL("../src-tauri/src/commands/chat.rs", import.meta.url), "utf8");

assert(
  agentEventsSource.includes('import { ttftMark, type TtftMarker } from "@/lib/ttft";'),
  "agent event listener should be able to mark TTFT milestones",
);
assert(
  agentEventsSource.includes('persisted: "dbInsert"') &&
    agentEventsSource.includes('provider_ready: "providerReady"') &&
    agentEventsSource.includes('llm_invoked: "llmInvoked"'),
  "chat status phases should map to TTFT markers",
);
assert(
  agentEventsSource.includes('orchestrator_invoked: "llmInvoked"') &&
    agentEventsSource.includes('agent_invoked: "llmInvoked"'),
  "agentic branches should still mark the model invocation phase",
);
assert(
  agentEventsSource.includes("markTtftStatusPhase(chatId, payload.phase);"),
  "chat:status handler should mark TTFT before rendering the status step",
);
assert(
  chatCommandSource.includes('"phase": "persisted"') &&
    chatCommandSource.includes('"phase": "provider_ready"') &&
    chatCommandSource.includes('"phase": "llm_invoked"'),
  "backend send_message should emit the phases consumed by TTFT instrumentation",
);

console.log("ttft status markers verifier passed");
