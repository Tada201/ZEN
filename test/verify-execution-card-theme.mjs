import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles/index.css");
const row = read("src/atlas/components/chat/tool/ExecutionRow.tsx");
const card = read("src/atlas/components/chat/ToolCallCard.tsx");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");

for (const token of [
  "--execution-surface",
  "--execution-surface-muted",
  "--execution-border",
  "--execution-ui-font",
  "--execution-code-font",
]) {
  assert(css.includes(token), `execution theme must define ${token}`);
}

for (const selector of [
  ".execution-card",
  ".execution-group",
  ".execution-subagent",
  ".execution-reasoning-card",
  ".execution-row",
  ".execution-row-title",
  ".execution-row-subtitle",
  ".execution-row-meta",
  "prefers-reduced-motion",
]) {
  assert(css.includes(selector), `execution theme must style ${selector}`);
}

assert(css.includes("font-family: var(--execution-ui-font)"), "execution labels must use the shared UI font token");
assert(css.includes("font-family: var(--execution-code-font)"), "execution metadata must use the shared code font token");
assert(css.includes(".execution-foldout-trigger > span"), "foldout execution headers must use the shared UI font token");
assert(row.includes('className="execution-row'), "ExecutionRow must expose the shared execution-row hook");
assert(card.includes("execution-card"), "ToolCallCard must expose the shared execution-card hook");
assert(trace.includes("execution-group"), "AgentExecutionTrace must expose the shared execution-group hook");
assert(reasoning.includes("execution-reasoning-card"), "ReasoningBlock must expose the shared execution-reasoning-card hook");
assert(subagent.includes("execution-subagent"), "SubagentExecutionCard must expose the shared execution-subagent hook");

console.log("execution card theme contract passed");
