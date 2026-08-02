import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const harness = read("src/atlas/components/chat/ExecutionDisclosureHarness.tsx");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const delegation = read("src/atlas/components/chat/AgentDelegationLane.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const roadmap = read("docs/product-polish-roadmap.md");

assert(harness.includes("export function ExecutionDisclosureHarness"), "mounted harness must export its root component");
assert(harness.includes("EXECUTION_DISCLOSURE_HARNESS_QUERY"), "harness must have a stable Tauri dev query contract");
assert(app.includes("import.meta.env.DEV"), "harness route must be development-only");
assert(app.includes("window.location.search.includes(EXECUTION_DISCLOSURE_HARNESS_QUERY)"), "App must gate the harness by the stable query contract");
assert(app.includes("<ExecutionDisclosureHarness />"), "App must mount the harness when requested");
assert(!harness.includes("invoke("), "harness must not call backend commands");
assert(!harness.includes("listen("), "harness must not subscribe to backend events");
assert(!harness.includes("harness-session"), "harness fixtures must not provide a chat id that enables checkpoint IPC");
assert(!harness.includes("playwright") && !harness.includes("puppeteer"), "harness must not become browser automation");

for (const [name, source] of [
  ["reasoning", reasoning],
  ["tool group", trace],
  ["delegation", delegation],
  ["subagent", subagent],
]) {
  assert(source.includes("transitionDisclosure"), `${name} owner must retain lifecycle transition policy`);
  assert(source.includes("toggleDisclosure"), `${name} owner must retain user disclosure ownership`);
}

for (const caseId of ["reasoning", "tool-group", "delegation", "subagent"]) {
  assert(harness.includes(`caseId=\"${caseId}\"`), `harness must mount the ${caseId} lifecycle case`);
}

assert(harness.includes("phaseLabel"), "harness must expose the current lifecycle phase");
assert(harness.includes("setTimeout"), "harness must schedule mounted lifecycle transitions");
assert(harness.includes("clearTimeout"), "harness must clean up scheduled lifecycle transitions");
assert(harness.includes("onUnmount"), "harness must observe mounted-case teardown");
assert(harness.includes("setMountedCases(false)"), "harness must unmount the production disclosure cases");
assert(harness.includes("unmountedCases.size === CASE_IDS.length"), "harness must require every disclosure case to tear down");
assert(harness.includes("rootsGone"), "harness must verify disclosure roots are removed from the DOM");
assert(harness.includes("aria-expanded"), "harness must inspect disclosure semantics");
assert(harness.includes("Run again"), "harness must support repeatable validation");
assert(harness.includes("disclosure recovery and mounted subtree teardown verified"), "harness must report the lifecycle and teardown acceptance result");
assert(roadmap.includes("verify-execution-disclosure-mounted-harness.mjs"), "roadmap must link the mounted harness verifier");
assert(roadmap.includes("ExecutionDisclosureHarness"), "roadmap must record the mounted harness delivery");

console.log("mounted execution disclosure harness contract passed");
