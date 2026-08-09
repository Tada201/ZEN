import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");
const card = read("src/atlas/components/chat/ToolCallCard.tsx");
const generic = read("src/atlas/components/chat/tool/content/GenericContent.tsx");
const row = read("src/atlas/components/chat/tool/ExecutionRow.tsx");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const group = read("src/atlas/components/chat/ExecutionGroup.tsx");
const disclosure = read("src/atlas/components/chat/executionDisclosure.ts");

assert(trace.includes('className="execution-trace min-w-0"'), "trace should expose a stable accessibility boundary");
assert(trace.includes("aria-label={traceAriaLabel}"), "trace should announce a concise user-facing summary");
assert(trace.includes('aria-busy={groupStatus === "running"}'), "trace should expose running state to assistive technology");
assert(trace.includes('role="status"'), "trace should provide a polite lifecycle status region");
assert(trace.includes('aria-live="polite"'), "trace lifecycle changes should be announced politely");
assert(trace.includes("getExecutionStatusLabel"), "trace status wording should use the shared execution-row label owner");
assert(trace.includes("groupStatus === \"awaiting_approval\""), "approval must remain a first-class grouped state");
assert(trace.includes("groupStatus === \"error\""), "failure must remain a first-class grouped state");
assert(trace.includes("groupStatus === \"completed\""), "completion must remain a first-class grouped state");
assert(trace.includes("transitionDisclosure") && trace.includes("toggleDisclosure"), "trace must track lifecycle transitions without adding store state");
assert(disclosure.includes("live result cannot disappear"), "live-open traces must preserve content on completion");
assert(disclosure.includes("userToggled"), "manual disclosure changes must override automatic lifecycle collapse");
assert(trace.includes("wall time"), "parallel duration must be described as wall-clock time");

assert(trace.includes('defaultExpanded={'), "individual tool rows must explicitly control disclosure defaults");
assert(trace.includes('toolCall.status === "running"'), "running tool rows must be expanded by default");
assert(trace.includes('toolCall.status === "awaiting_approval"'), "approval tool rows must be expanded by default");
assert(trace.includes('toolCall.status === "error"'), "failed tool rows must be expanded by default");
assert(generic.includes("Raw result") && generic.includes("Input parameters"), "raw tool payloads and inputs must remain behind explicit disclosures");
assert(card.includes("Deny") && card.includes("Approve"), "approval rows must retain actionable decisions");
assert(row.includes("aria-expanded") && row.includes("aria-busy"), "execution rows must expose expansion and running semantics");

assert(reasoning.includes("Collapse reasoning details") && reasoning.includes("Expand reasoning details"), "reasoning must be keyboard-labeled for disclosure");
assert(reasoning.includes("Preparing the answer") && reasoning.includes("Thought for"), "reasoning must transition from live work to a concise completion summary");
assert(reasoning.includes("motion-safe:animate-pulse"), "reasoning activity motion must be opt-in for motion-capable users");
assert(reasoning.includes("motion-reduce:transition-none"), "reasoning disclosure transitions must honor reduced motion");
assert(assistant.includes("<ReasoningBlock") && assistant.includes("<ExecutionGroup"), "assistant composition must preserve reasoning then grouped execution projections");
assert(group.includes("preferCompact"), "grouped execution must use compact summary-first presentation");

console.log("execution trace accessibility contract passed");
