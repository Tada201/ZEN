import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const tool = readFileSync(new URL("../src/atlas/hooks/stream/useToolEvents.ts", import.meta.url), "utf8");
const artifact = readFileSync(new URL("../src/atlas/hooks/stream/useArtifactEvents.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/atlas/agentRuntime/types.ts", import.meta.url), "utf8");

assert(tool.includes("queueMessageUpdate") && tool.includes("requestAnimationFrame"), "tool lifecycle updates must be frame-batched");
assert(!tool.includes("setSessionMessages(chatId, (prev) => upsertTool"), "tool events must not write every lifecycle event immediately");
assert(artifact.includes("artifactKey") && artifact.includes("requestAnimationFrame"), "artifact deltas must be keyed and frame-batched");
assert(runtime.includes("runId") && runtime.includes("messageId") && runtime.includes("sequence"), "canonical runtime records must retain run identity and ordering");

console.log("agentic batching contract verified");
