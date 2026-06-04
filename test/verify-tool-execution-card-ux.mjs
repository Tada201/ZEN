import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);

assert(cardSource.includes("function getToolActionVerb"), "tool cards should derive readable action verbs from tool type and status");
assert(cardSource.includes("Searching") && cardSource.includes("Reading") && cardSource.includes("Writing") && cardSource.includes("Running"), "tool action text should use specific verbs instead of generic status text");
assert(cardSource.includes("function getStatusLabel"), "tool cards should expose human status labels");
assert(cardSource.includes("Needs approval") && cardSource.includes("Complete") && cardSource.includes("Failed"), "status labels should be readable in collapsed and expanded states");
assert(cardSource.includes("humanizeToolName"), "completed/error fallback text should be readable when no result summary exists");
assert(cardSource.includes("min-h-9 w-full min-w-0 items-center gap-2 rounded-lg border"), "collapsed cards should render as compact execution rows");
assert(cardSource.includes("max-w-[11rem]") && cardSource.includes("truncate"), "tool names and action text should not push the row layout wider during streaming");
assert(cardSource.includes(">Tool<") && cardSource.includes(">Input<") && cardSource.includes(">Result preview<") && cardSource.includes(">Runtime<"), "expanded cards should separate tool, input, result, and runtime audit details");
assert(cardSource.includes("agent {agentLabel}") && cardSource.includes("batch {batchId}") && cardSource.includes("iter {iteration}"), "agent/batch/iteration telemetry should remain available in expanded runtime details");
assert(cardSource.includes("Raw output") && cardSource.includes("<details"), "raw output should remain available without dominating the default view");
assert(cardSource.includes("Approval context") && cardSource.includes("Deny") && cardSource.includes("Approve"), "approval flow should remain visible and actionable");

console.log("tool execution card ux ok");
