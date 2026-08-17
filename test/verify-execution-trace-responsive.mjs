import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const row = read("src/atlas/components/chat/tool/ExecutionRow.tsx");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const styles = read("src/styles/index.css");
const rules = read("docs/architecture/frontend-rules.md");

assert(row.includes('type="button"'), "execution disclosure must use a native keyboard button");
assert(row.includes("aria-expanded={expanded}"), "execution disclosure must expose expanded state");
assert(row.includes("aria-busy={resolvedStatus === \"running\"}"), "execution rows must expose running state");
assert(row.includes("resolvedAriaLabel"), "execution rows must provide a concise accessible label");
assert(row.includes("Duration ${duration}"), "duration must remain available to assistive technology");
assert(trace.includes("execution-trace min-w-0"), "trace boundary must allow flex shrink in narrow surfaces");
assert(trace.includes("bare"), "nested subagent traces must retain the parent-owned disclosure boundary");
assert(subagent.includes("aria-label={`${resolvedSubagent.agentName}, ${statusLabel}"), "subagent disclosure must announce identity and lifecycle");
assert(subagent.includes("motion-reduce:transition-none"), "subagent disclosure transitions must honor reduced motion");
assert(styles.includes("container-type: inline-size"), "execution rows must size responsive behavior from their containing surface");
assert(styles.includes("@container (max-width: 28rem)"), "trace rows must adapt in narrow workbench and transcript surfaces");
assert(styles.includes("@container (max-width: 21rem)"), "very narrow rows must protect title and action affordance space");
assert(!styles.includes('@container (max-width: 28rem) {\n  .execution-row {'), "container queries must target row descendants, not the container itself");
assert(styles.includes(".execution-row-meta") && styles.includes("text-overflow: ellipsis"), "metadata must truncate instead of forcing horizontal overflow");
assert(styles.includes(".execution-subagent-duration"), "subagent duration must have a bounded narrow-layout treatment");
assert(rules.includes("Responsive layout is required"), "responsive behavior remains governed by the frontend contract");
const packageJson = read("package.json");
assert(packageJson.includes('"test:execution-trace-responsive": "node test/verify-execution-trace-responsive.mjs"'), "responsive verifier must be an npm script");
assert(packageJson.includes("npm run test:execution-trace-accessibility && npm run test:execution-trace-responsive"), "responsive verifier must run in the agentic UI aggregate");
assert(!trace.includes("animationDelay"), "streaming tool rows must not use index-based entrance delays");
assert(!trace.includes("slide-in-from-top-2"), "streaming tool rows must not use directional waterfall entrances");

console.log("execution trace responsive and keyboard contract passed");
