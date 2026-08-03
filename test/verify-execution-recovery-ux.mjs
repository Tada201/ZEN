import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const queries = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const card = readFileSync(new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url), "utf8");
const subagent = readFileSync(new URL("../src/atlas/components/chat/SubagentExecutionCard.tsx", import.meta.url), "utf8");
const message = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");

assert.match(queries, /markRecoveredMessage/);
assert.match(queries, /recoveryState:\s*"recovered"/);
assert.match(queries, /recoveryState:\s*"stale"/);
assert.match(card, /Interrupted/);
assert.match(card, /The app was reloaded before this tool finished/);
assert.match(subagent, /Interrupted after reload/);
assert.match(message, /Recovered after reload/);

console.log("execution recovery UX verified");
