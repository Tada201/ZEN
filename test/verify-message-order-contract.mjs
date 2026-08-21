import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const assistantParts = read("src/atlas/components/chat/assistantMessageParts.ts");
const messageTypes = read("src/atlas/components/chat/types.ts");
const runtimeTypes = read("src/atlas/agentRuntime/types.ts");
const runtimeBridge = read("src/atlas/hooks/stream/useChatChunkEvent.ts");
const assistantMessage = read("src/atlas/components/chat/AssistantMessage.tsx");
const persistProjection = read("src/atlas/hooks/stream/projectStepsForPersistence.ts");
const assistantLogic = read("src/atlas/components/chat/AssistantMessage.logic.ts");
const chunkBuffer = read("src/atlas/hooks/stream/chatChunkBuffer.ts");
const traceQueries = read("src-tauri/src/db/queries/execution_trace.rs");
const traceCrud = read("src-tauri/src/commands/chat/crud.rs");
const sendCommand = read("src-tauri/src/commands/chat/send.rs");
const reloadParity = read("test/verify-execution-trace-reload-parity.mjs");

assert(
  assistantParts.includes("if (!incomingBatchId) return undefined") &&
    assistantParts.includes("groupBatchIds.has(incomingBatchId)"),
  "frontend must group tool rows only when an explicit batch identity matches",
);
assert(
  assistantParts.includes("Tools are grouped only when the backend supplies the same explicit"),
  "frontend must document that inferred timing batches are forbidden",
);
assert(
  runtimeTypes.includes("mergeRuntimeTextPartsIntoSteps") &&
    runtimeTypes.includes("eventId: `runtime:${part.partId}`"),
  "live runtime prose must be projected into replaceable ordered timeline rows",
);
assert(
  runtimeBridge.includes("steps: mergeRuntimeTextPartsIntoSteps(record.parts, current.steps)"),
  "live runtime flushes must retain thinking/text order beside execution rows",
);

// One canonical ordering (T3): a single orderSteps() comparator is the SSOT
// shared by the runtime merge, the render path, and the persistence projection
// so the live timeline and the reloaded timeline sort identically.
assert(
  runtimeTypes.includes("export function orderSteps(steps: Step[]): Step[]"),
  "runtime must expose a single shared orderSteps() ordering projection",
);
assert(
  runtimeTypes.includes("return orderSteps([...retainedSteps, ...runtimeSteps])"),
  "runtime merge must order through the shared orderSteps() projection",
);
assert(
  assistantMessage.includes("orderSteps(message.steps)") &&
    assistantMessage.includes('from "@/atlas/agentRuntime/types"'),
  "render path must order steps through the same shared projection before grouping",
);
assert(
  persistProjection.includes("orderSteps(steps)") &&
    persistProjection.includes('from "@/atlas/agentRuntime/types"'),
  "persistence must project steps in the same canonical order the UI renders",
);

// Stable identity (T1): text/reasoning steps key by a minted id, never the
// list index, so a tool card inserted between two text runs cannot remount and
// split the prose.
assert(
  assistantLogic.includes("if (step.eventId) return `${step.type}-${step.eventId}`"),
  "text/reasoning rows must key by their stable step id, not the list index",
);
assert(
  chunkBuffer.includes("mintStepId(") &&
    chunkBuffer.includes('return `local:${prefix}:${localStepSeq}`'),
  "chunk buffer must mint a stable id for every text/reasoning step it creates",
);
assert(
  messageTypes.includes("normalizedSteps && normalizedSteps.length > 0") &&
    messageTypes.includes("canonicalParts.steps"),
  "reload must prefer persisted ordered steps and retain a legacy fallback",
);
assert(
  traceQueries.includes("monotonic_sequence") &&
    traceQueries.includes("ORDER BY sequence ASC, rowid ASC"),
  "backend trace persistence must repair duplicate sequence values and reload with a stable tie-breaker",
);
assert(
  traceCrud.includes("normalize_trace_checkpoint") &&
    traceCrud.includes("EXECUTION_TRACE_VERSION: u64 = 2"),
  "backend checkpoints must use the versioned trace envelope",
);
assert(
  reloadParity.includes("projectNormalizedTraceToMessage") &&
    reloadParity.includes("normalized node order must survive reload"),
  "frontend reload verification must exercise the normalized backend projection",
);
for (const marker of [
  "## Deterministic Message and Timeline Contract",
  "Keep the response chronological",
  "Close every fenced block",
  "chart` blocks as raw valid JSON",
  "Do not repeat the same answer",
]) {
  assert(sendCommand.includes(marker), `system prompt must include ${marker}`);
}

console.log("cross-layer message order and prompt contract passed");
