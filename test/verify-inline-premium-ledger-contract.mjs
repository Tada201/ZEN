import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const toolCard = read("src/atlas/components/chat/ToolCallCard.tsx");
const executionRow = read("src/atlas/components/chat/tool/ExecutionRow.tsx");
const model = read("src/atlas/components/chat/agentExecutionTraceModel.ts");
const ledger = read("src/atlas/components/chat/agentExecutionLedger.ts");
const css = read("src/styles/index.css");

assert(trace.includes('tool.recoveryState === "stale"'), "recovered tools must not be presented as running");
assert(trace.includes('return "interrupted"'), "the group header must expose interrupted lifecycle state");
assert(trace.includes("${trace.completedCount}/${normalizedToolCalls.length} complete"), "group summaries must expose deterministic progress");
assert(trace.includes("Interrupted after reload"), "recovered execution needs a user-facing explanation");
assert(trace.includes('aria-live="polite"'), "meaningful ledger status changes must be announced politely");

assert(toolCard.includes('isStale ? "interrupted"'), "stale tool cards must use the interrupted status contract");
assert(toolCard.includes('if (status === "awaiting_approval") return "Needs approval"'), "approval state must win over tool-family verbs");
assert(toolCard.includes('if (status === "error") return "Failed"'), "failure state must win over tool-family verbs");
assert(toolCard.includes("const hasAction = isStale ||"), "interrupted tools must remain expanded for recovery context");

assert(executionRow.includes('"interrupted"'), "execution rows must support interrupted status");
assert(executionRow.includes("execution-row-status"), "ledger rows must show status text in addition to color");
assert(executionRow.includes("execution-row-copy min-w-0 flex-1 items-baseline gap-2"), "wide tool rows should place the outcome beside the action instead of stacking it below");
assert(css.includes(".execution-row-copy") && css.includes("@container (max-width: 21rem)"), "tool rows should use wide inline density and stack only in narrow containers");
assert(model.includes('toolCall.recoveryState !== "stale"'), "trace activity must exclude stale recovered tools");
assert(ledger.includes('tool.recoveryState === "stale"'), "ledger agent state must not count stale tools as active");
assert(css.includes('execution-row-status-dot--interrupted'), "interrupted status needs a semantic visual token");
assert(css.includes('html[data-motion="off"] .execution-row-status-dot--running'), "ledger activity motion must honor the shared motion switch");

console.log("inline premium ledger contract ok");
