import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const projection = readFileSync(new URL("../src/atlas/agentRuntime/messageProjection.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/atlas/components/chat/types.ts", import.meta.url), "utf8");
const queries = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const subagents = readFileSync(new URL("../src/atlas/agentRuntime/subagentRuntime.ts", import.meta.url), "utf8");

assert(types.includes("projectCanonicalMessageParts"), "reload normalization must use the shared canonical projection");
assert(projection.includes("toolInvocations") && projection.includes("steps"), "projection must cover legacy and persisted parts");
assert(queries.includes("stepsJson") && queries.includes("projectCanonicalMessageParts"), "DB hydration must retain ordered persisted execution parts through the canonical projection");
assert(projection.includes("stripToolProtocolText"), "live and reload projection must apply the same text sanitization");
assert(subagents.includes("projectScopedSubagents") && subagents.includes("serializeScopedSubagents"), "subagent summaries must have a shared live/reload projection");

console.log("live/reload canonical part parity contract verified");
