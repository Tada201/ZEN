import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const agentEventsSource = readFileSync(new URL("../src/atlas/hooks/stream/useAgentEvents.ts", import.meta.url), "utf8");
// `commands/chat/send.rs` was split into `send/{history,persist,prompt,research,
// resolve,route,validate}.rs`. Read the parent plus every submodule as one blob
// so shape assertions that predate the split keep anchoring on the same content.
const chatCommandSource = ["history", "persist", "prompt", "research", "resolve", "route", "validate"]
  .map((m) => readFileSync(new URL(`../src-tauri/src/commands/chat/send/${m}.rs`, import.meta.url), "utf8"))
  .concat(readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8"))
  .join("\n");
const ttftSource = readFileSync(new URL("../src/lib/ttft.ts", import.meta.url), "utf8");

assert(
  agentEventsSource.includes('import { ttftMark, type TtftMarker } from "@/lib/ttft";'),
  "agent event listener should be able to mark TTFT milestones",
);
assert(
  agentEventsSource.includes('persisted: "dbInsert"') &&
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
    chatCommandSource.includes('"phase": "llm_invoked"') &&
    !chatCommandSource.includes('"phase": "provider_ready"') &&
    !agentEventsSource.includes('provider_ready') &&
    !ttftSource.includes("providerReady"),
  "backend and frontend TTFT instrumentation should omit the removed provider-ready phase",
);

console.log("ttft status markers verifier passed");
