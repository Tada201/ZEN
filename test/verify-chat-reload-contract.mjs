// Reload contract tests for the chat execution timeline.
//
// Asserts the persistence + rehydration contract documented in
// docs/architecture/frontend-rules.md ("Execution Timeline Persistence" and
// "Backend Message ID Contract for Chat Events"):
//
//   1. Completed successful tool groups hide once answer text exists
//      (shouldShowToolGroupInTimeline gate + revealCompletedToolHistory override).
//   2. Error tool groups stay visible after reload.
//   3. Approval (awaiting_approval) tool groups stay visible after reload.
//   4. Legacy toolInvocations reconstruction produces tool-call steps.
//   5. No persistence write occurs without a backend message_id (source guard).
//   6. Error-state tool output is redacted in the persisted projection (not
//      the raw 1,500-char prefix).
//
// Scenarios 1–4 are exercised by executing `normalizeVercelMessage` and
// `projectStepsForPersistence` against representative payloads. Scenarios 5
// is a source-level guard (the persistence call site lives inside a React
// hook and cannot be executed in isolation here).

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

// ── Load the projection + normalization modules ──────────────────────────
const projectionModule = await loadSourceModule("../src/atlas/hooks/stream/projectStepsForPersistence.ts");
const projectStepsForPersistence = projectionModule.projectStepsForPersistence;

const typesModule = await loadSourceModule("../src/atlas/components/chat/types.ts");
const { normalizeVercelMessage } = typesModule;

// ── 1. Completed successful tool groups hide once answer text exists ──────
// After reload, a completed assistant message with answer text + a completed
// tool-call step must rehydrate so the tool group is present in `steps` (for
// audit) but `shouldShowToolGroupInTimeline` hides it. We verify the gate
// via source inspection since it is not exported; the rehydration itself is
// verified by normalizing a persisted payload and confirming the tool-call
// step survives.
const completedMessagePayload = {
  id: "backend-1",
  chatId: "chat-1",
  role: "assistant",
  content: "Here is the final answer.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  stepsJson: JSON.stringify([
    { type: "tool-call", toolCall: { id: "t1", name: "read_file", status: "completed", input: { path: "a.ts" }, output: "" } },
    { type: "text", content: "Here is the final answer." },
  ]),
};
const completedNormalized = normalizeVercelMessage(completedMessagePayload);
assert.equal(completedNormalized.steps.length, 2, "completed message should rehydrate both the tool-call and text steps from stepsJson");
assert.equal(completedNormalized.steps[0].type, "tool-call", "first rehydrated step should be the tool call");
assert.equal(completedNormalized.steps[0].toolCall.status, "completed", "rehydrated tool call should preserve completed status");
assert.equal(completedNormalized.steps[1].type, "text", "second rehydrated step should be the answer text");
assert.equal(completedNormalized.content, "Here is the final answer.", "rehydrated content should match the persisted answer");

// The gate itself: source-level assertion that completed execution history
// remains visible after the live stream and after backend hydration.
const assistantSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  assistantSource.includes("function shouldShowToolGroupInTimeline"),
  "shouldShowToolGroupInTimeline gate must exist in AssistantMessage.tsx",
);
assert.ok(
  /hasActionableTool\s*=\s*step\.toolCalls\.some/.test(assistantSource),
  "shouldShowToolGroupInTimeline must keep running/approval/error groups visible",
);
assert.ok(
  /return\s+true\s*;/.test(assistantSource),
  "shouldShowToolGroupInTimeline must keep completed tool groups visible after the answer arrives",
);
assert.ok(
  /message\.content\?\.trim\(\)\s*&&\s*!hasVisibleTextStep/.test(assistantSource),
  "assistant markdown must still render when the timeline contains only reasoning/tool steps",
);

// ── 2. Error tool groups stay visible after reload ───────────────────────
// An error-state tool call rehydrated from stepsJson must keep status "error"
// so the hide rule's `hasActionableTool` check keeps it visible.
const errorMessagePayload = {
  id: "backend-2",
  chatId: "chat-1",
  role: "assistant",
  content: "I encountered an error.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  stepsJson: JSON.stringify([
    { type: "tool-call", toolCall: { id: "t2", name: "run_command", status: "error", input: { command: "npm test" }, output: "tests failed" } },
    { type: "text", content: "I encountered an error." },
  ]),
};
const errorNormalized = normalizeVercelMessage(errorMessagePayload);
assert.equal(errorNormalized.steps.length, 2, "error message should rehydrate the tool-call and text steps");
const errorToolStep = errorNormalized.steps.find((s) => s.type === "tool-call");
assert.ok(errorToolStep, "error message should rehydrate the tool-call step");
assert.equal(errorToolStep.toolCall.status, "error", "rehydrated error tool call must preserve error status so it stays visible");

// ── 3. Approval (awaiting_approval) tool groups stay visible after reload ─
const approvalMessagePayload = {
  id: "backend-3",
  chatId: "chat-1",
  role: "assistant",
  content: "Waiting for your approval.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  stepsJson: JSON.stringify([
    { type: "tool-call", toolCall: { id: "t3", name: "run_command", status: "awaiting_approval", input: { command: "rm -rf /" }, output: "" } },
    { type: "text", content: "Waiting for your approval." },
  ]),
};
const approvalNormalized = normalizeVercelMessage(approvalMessagePayload);
const approvalToolStep = approvalNormalized.steps.find((s) => s.type === "tool-call");
assert.ok(approvalToolStep, "approval message should rehydrate the tool-call step");
assert.equal(approvalToolStep.toolCall.status, "awaiting_approval", "rehydrated approval tool call must preserve awaiting_approval status so it stays visible");

// ── 4. Legacy toolInvocations reconstruction produces tool-call steps ────
// A message with toolInvocations but NO stepsJson falls back to the legacy
// reconstruction path, which emits individual tool-call steps. This keeps
// historical messages renderable after the steps_json migration.
const legacyPayload = {
  id: "backend-4",
  chatId: "chat-1",
  role: "assistant",
  content: "Legacy answer.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  toolInvocations: [
    { state: "result", toolCallId: "legacy-t1", toolName: "read_file", args: { path: "old.ts" }, result: "file contents" },
  ],
};
const legacyNormalized = normalizeVercelMessage(legacyPayload);
assert.ok(
  Array.isArray(legacyNormalized.steps) && legacyNormalized.steps.some((s) => s.type === "tool-call"),
  "legacy toolInvocations must reconstruct tool-call steps when stepsJson is absent",
);
const legacyToolStep = legacyNormalized.steps.find((s) => s.type === "tool-call");
assert.equal(legacyToolStep.toolCall.id, "legacy-t1", "legacy reconstructed tool call should preserve the toolCallId");
assert.equal(legacyToolStep.toolCall.status, "completed", "legacy reconstructed tool call with state=result should be completed");
assert.equal(legacyToolStep.toolCall.output, "file contents", "legacy reconstructed tool call should preserve the string result");

// ── 5. No persistence write without a backend message_id (source guard) ──
// The chat:done handler must guard the persistence call on a truthy
// backendAssistantId. Persisting with an optimistic/fake ID would attach
// steps to the wrong DB row. Verified via source inspection because the
// call site lives inside a React hook.
const useChatChunkSource = readFileSync(
  new URL("../src/atlas/hooks/stream/useChatChunkEvent.ts", import.meta.url),
  "utf8",
);
assert.ok(
  /const\s+backendAssistantId\s*=\s*event\.payload\.message_id/.test(useChatChunkSource),
  "chat:done handler must read message_id from the payload into backendAssistantId",
);
assert.ok(
  /if\s*\(\s*backendAssistantId\s*\)\s*\{/.test(useChatChunkSource) || /if\s*\(\s*backendAssistantId\s*\)\s*\n/.test(useChatChunkSource),
  "chat:done handler must guard the persistence write on a truthy backendAssistantId (no optimistic-ID fallback)",
);
assert.ok(
  !/updateMessageSteps\([^,]+,\s*assistantIdBeforeFinalize/.test(useChatChunkSource),
  "chat:done handler must NOT call updateMessageSteps with the optimistic assistantIdBeforeFinalize",
);
assert.ok(
  useChatChunkSource.includes("messageId: event.payload.message_id || undefined") &&
    useChatChunkSource.includes("findWritableAssistantIndex(prev, chatId, buf.messageId)"),
  "stream chunks must retain backend message_id while flushing so late reasoning stays on the owning assistant",
);
assert.ok(
  /flushAllChunkBuffers\(\);\s*clearChunkTrackingForChat\(chatId/.test(useChatChunkSource) &&
    !/flushAllChunkBuffers\(\);[\s\S]{0,160}const buf = chunkBuffersRef\.current\[chatId\]/.test(useChatChunkSource),
  "chat:done must not read a chunk buffer after the flush has consumed it",
);

// ── 6. Error-state tool output is redacted in the persisted projection ───
// The projection must NOT persist the raw 1,500-char error-output prefix.
// It must produce a small, redacted summary so secrets and technical
// payloads don't land in steps_json.
const longErrorOutput = `Error: command failed
  at Object.<anonymous> (/some/path/to/file.ts:42:17)
  api_key=sk-live-1234567890abcdef
  authorization=Bearer abc123
  ${"x".repeat(2000)}`;
const projectedSteps = projectStepsForPersistence([
  {
    type: "tool-call",
    toolCall: {
      id: "t-err",
      name: "run_command",
      status: "error",
      input: { command: "npm test" },
      output: longErrorOutput,
      durationMs: 500,
    },
  },
  { type: "text", content: "Final answer" },
]);
const projectedToolStep = projectedSteps.find((s) => s.type === "tool-call");
assert.ok(projectedToolStep, "projection must keep the tool-call step");
assert.ok(
  projectedToolStep.toolCall.output.length <= 280,
  `error output projection must be capped to ~280 chars, got ${projectedToolStep.toolCall.output.length}`,
);
assert.ok(
  !projectedToolStep.toolCall.output.includes("sk-live-1234567890abcdef"),
  "error output projection must redact api_key secrets",
);
assert.ok(
  !projectedToolStep.toolCall.output.includes("Bearer abc123"),
  "error output projection must redact authorization/bearer secrets",
);
assert.ok(
  projectedToolStep.toolCall.output.includes("[redacted]"),
  "error output projection should contain a [redacted] marker for scrubbed secrets",
);
// Completed shell output must survive the persistence projection so an
// expanded terminal card is identical before and after reload.
const completedProjected = projectStepsForPersistence([
  {
    type: "tool-call",
    toolCall: {
      id: "t-ok",
      name: "run_command",
      status: "completed",
      input: { command: "Get-ChildItem" },
      output: JSON.stringify({
        stdout: "first.txt\nsecond.txt\n",
        stderr: "",
        exit_code: 0,
      }),
    },
  },
]);
const completedToolStep = completedProjected.find((s) => s.type === "tool-call");
assert.ok(completedToolStep.toolCall.output.includes("first.txt"), "completed shell stdout must survive projection");
assert.ok(completedToolStep.toolCall.output.includes("second.txt"), "completed shell output must preserve line content");

const secretProjected = projectStepsForPersistence([
  {
    type: "tool-call",
    toolCall: {
      id: "t-secret",
      name: "run_command",
      status: "completed",
      input: { command: "echo $env:API_KEY" },
      output: JSON.stringify({ stdout: "api_key=sk-live-should-not-persist" }),
    },
  },
]);
const secretToolStep = secretProjected.find((s) => s.type === "tool-call");
assert.ok(!secretToolStep.toolCall.output.includes("sk-live-should-not-persist"), "completed shell output must redact secrets");

// ── 7. Action metadata.error is redacted in the persisted projection ───────
// Action steps (e.g. a failed agent action) carry metadata.error. Persisting
// it verbatim risks leaking secrets and oversized payloads. The projection
// must apply the same redactErrorSummary pass used for tool-call output.
const actionErrorSteps = projectStepsForPersistence([
  {
    type: "action",
    kind: "agent_complete",
    status: "error",
    content: "",
    metadata: {
      agentName: "reviewer",
      error: `Action failed: api_key=sk-action-secret-xyz123 authorization=Bearer tok-abc ${"y".repeat(2000)}`,
      resultSummary: "boom",
    },
  },
]);
const projectedAction = actionErrorSteps.find((s) => s.type === "action");
assert.ok(projectedAction, "projection must keep the action step");
const actionError = projectedAction.metadata?.error;
assert.ok(typeof actionError === "string", "action step must keep a string error after projection");
assert.ok(
  actionError.length <= 280,
  `action error projection must be capped to ~280 chars, got ${actionError.length}`,
);
assert.ok(
  !actionError.includes("sk-action-secret-xyz123"),
  "action error projection must redact api_key secrets",
);
assert.ok(
  !actionError.includes("Bearer tok-abc"),
  "action error projection must redact authorization/bearer secrets",
);
assert.ok(
  actionError.includes("[redacted]"),
  "action error projection should contain a [redacted] marker for scrubbed secrets",
);

// ── 8. Subagent error is redacted in the persisted projection ──────────────
// Subagent steps carry subagent.error. A failing child agent can echo stack
// traces, env vars, or credentials. The projection must redact those too.
const subagentErrorSteps = projectStepsForPersistence([
  {
    type: "subagent",
    subagent: {
      spawnId: "spawn-1",
      agentId: "agent-1",
      agentName: "researcher",
      task: "search the web",
      status: "failed",
      error: `Child agent crashed: token=sk-sub-secret-999 ${"z".repeat(2000)}`,
      durationMs: 1200,
    },
  },
]);
const projectedSubagent = subagentErrorSteps.find((s) => s.type === "subagent");
assert.ok(projectedSubagent, "projection must keep the subagent step");
const subError = projectedSubagent.subagent?.error;
assert.ok(typeof subError === "string", "subagent step must keep a string error after projection");
assert.ok(
  subError.length <= 280,
  `subagent error projection must be capped to ~280 chars, got ${subError.length}`,
);
assert.ok(
  !subError.includes("sk-sub-secret-999"),
  "subagent error projection must redact token secrets",
);
assert.ok(
  subError.includes("[redacted]"),
  "subagent error projection should contain a [redacted] marker for scrubbed secrets",
);

// ── 9. toolResult.contentSummary is redacted for error/timeout status ─────
// compactMetadata keeps the toolResult summary so a completed action's outcome
// line ("Edited 3 files (+12 −4)") survives reload. But for error/timeout
// results the summary can echo stack traces, env vars, or credentials from a
// failing tool — the same risk as tool-call output and metadata.error. The
// projection must run those summaries through redactErrorSummary too. A
// successful ('ok') summary must stay verbatim so the scannable card line
// is not mangled.
const okContentSummarySteps = projectStepsForPersistence([
  {
    type: "action",
    kind: "tool_result",
    status: "completed",
    content: "",
    metadata: {
      toolResult: {
        toolName: "edit_file",
        status: "ok",
        durationMs: 300,
        contentSummary: "Edited 3 files (+12 −4)",
      },
    },
  },
]);
const okAction = okContentSummarySteps.find((s) => s.type === "action");
assert.ok(okAction, "projection must keep the action step for an ok tool result");
assert.ok(
  okAction.metadata?.toolResult?.contentSummary === "Edited 3 files (+12 −4)",
  "a successful (ok) toolResult.contentSummary must be persisted verbatim, not redacted or capped",
);

const errorContentSummarySteps = projectStepsForPersistence([
  {
    type: "action",
    kind: "tool_result",
    status: "error",
    content: "",
    metadata: {
      toolResult: {
        toolName: "run_command",
        status: "error",
        durationMs: 500,
        contentSummary: `command failed: api_key=sk-summary-secret-777 token=bearer-leak-xyz ${"w".repeat(2000)}`,
      },
    },
  },
]);
const errorAction = errorContentSummarySteps.find((s) => s.type === "action");
assert.ok(errorAction, "projection must keep the action step for an error tool result");
const errorSummary = errorAction.metadata?.toolResult?.contentSummary;
assert.ok(typeof errorSummary === "string", "error toolResult.contentSummary must remain a string after projection");
assert.ok(
  errorSummary.length <= 280,
  `error toolResult.contentSummary projection must be capped to ~280 chars, got ${errorSummary.length}`,
);
assert.ok(
  !errorSummary.includes("sk-summary-secret-777"),
  "error toolResult.contentSummary projection must redact api_key secrets",
);
assert.ok(
  !errorSummary.includes("bearer-leak-xyz"),
  "error toolResult.contentSummary projection must redact token secrets",
);
assert.ok(
  errorSummary.includes("[redacted]"),
  "error toolResult.contentSummary projection should contain a [redacted] marker for scrubbed secrets",
);

// ── 9b. 'timeout' toolResult.contentSummary is redacted too ───────────────
// A 'timeout' status result is treated the same as 'error' — its summary can
// echo a partial output with secrets, so it must also be redacted/capped.
const timeoutContentSummarySteps = projectStepsForPersistence([
  {
    type: "action",
    kind: "tool_result",
    status: "error",
    content: "",
    metadata: {
      toolResult: {
        toolName: "run_command",
        status: "timeout",
        durationMs: 30000,
        contentSummary: `timed out: token=sk-timeout-leak-abc ${"q".repeat(2000)}`,
      },
    },
  },
]);
const timeoutAction = timeoutContentSummarySteps.find((s) => s.type === "action");
assert.ok(timeoutAction, "projection must keep the action step for a timeout tool result");
const timeoutSummary = timeoutAction.metadata?.toolResult?.contentSummary;
assert.ok(typeof timeoutSummary === "string", "timeout toolResult.contentSummary must remain a string after projection");
assert.ok(
  timeoutSummary.length <= 280,
  `timeout toolResult.contentSummary projection must be capped to ~280 chars, got ${timeoutSummary.length}`,
);
assert.ok(
  !timeoutSummary.includes("sk-timeout-leak-abc"),
  "timeout toolResult.contentSummary projection must redact token secrets",
);
assert.ok(
  timeoutSummary.includes("[redacted]"),
  "timeout toolResult.contentSummary projection should contain a [redacted] marker",
);

// ── 10. Legacy toolInvocations dedup against steps-restored toolCalls ───────
// A message can carry BOTH a persisted stepsJson timeline (with tool-call
// steps) AND legacy toolInvocations pointing at the same toolCallId. Path A
// (steps → toolCalls restore) runs first and adds the step-derived tool.
// Path B (legacy toolInvocations) must NOT blindly concatenate — it must
// dedup by id so the same tool does not appear twice on message.toolCalls.
// A duplicate would render two tool cards and break SubagentExecutionCard's
// child-tool re-attachment (which keys on id). Legacy tools WITHOUT an id
// are always kept (Path A cannot restore id-less tools, so they are unique
// to the legacy path).
const overlapPayload = {
  id: "backend-6",
  chatId: "chat-1",
  role: "assistant",
  content: "Overlapping legacy answer.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  // stepsJson carries a tool-call step with id "overlap-t1".
  stepsJson: JSON.stringify([
    { type: "tool-call", toolCall: { id: "overlap-t1", name: "read_file", status: "completed", input: { path: "a.ts" }, output: "" } },
    { type: "text", content: "Overlapping legacy answer." },
  ]),
  // toolInvocations points at the SAME toolCallId "overlap-t1" (steps overlap),
  // an id-less extra (toolCallId is empty — simulating a malformed legacy row),
  // and an intra-batch duplicate: two entries share toolCallId "intra-t1" to
  // verify the merge dedups within the legacy batch too (not just against the
  // steps-restored set). The `legacyExistingIds.add(tc.id)` line is what makes
  // the second "intra-t1" get skipped — without it, both would be kept.
  toolInvocations: [
    { state: "result", toolCallId: "overlap-t1", toolName: "read_file", args: { path: "a.ts" }, result: "file contents" },
    { state: "result", toolCallId: "", toolName: "run_command", args: { command: "echo hi" }, result: "hi\n" },
    { state: "result", toolCallId: "intra-t1", toolName: "grep", args: { pattern: "foo" }, result: "match" },
    { state: "result", toolCallId: "intra-t1", toolName: "grep", args: { pattern: "foo" }, result: "match" },
  ],
};
const overlapNormalized = normalizeVercelMessage(overlapPayload);
const overlapIds = (overlapNormalized.toolCalls || []).map((tc) => tc.id).filter((id) => id);
const overlapIdCounts = new Map();
for (const id of overlapIds) overlapIdCounts.set(id, (overlapIdCounts.get(id) || 0) + 1);
const dupes = [...overlapIdCounts.entries()].filter(([, count]) => count > 1);
assert.equal(
  dupes.length,
  0,
  `toolCalls must not contain duplicate ids when stepsJson and toolInvocations overlap (including intra-batch legacy duplicates), duplicates: ${JSON.stringify(dupes)}`,
);
// Intra-batch legacy dedup: two toolInvocations share toolCallId "intra-t1",
// which is NOT in the steps-restored set, so the only thing that can drop the
// second one is the `legacyExistingIds.add(tc.id)` line inside the merge loop.
const intraCount = (overlapNormalized.toolCalls || []).filter((tc) => tc.id === "intra-t1").length;
assert.equal(
  intraCount,
  1,
  `the intra-batch legacy duplicate (toolCallId "intra-t1") must appear exactly once on toolCalls, got ${intraCount}`,
);
// The steps-derived entry (Path A) must win; the legacy duplicate is skipped.
// Pin the winner via `output`: the stepsJson payload hardcodes output "" for
// the completed tool, while the legacy-reconstructed tool derives output
// "file contents" from ti.result. Both share name "read_file", so asserting
// on name would NOT catch a regression that flips the winner.
const overlapTool = (overlapNormalized.toolCalls || []).find((tc) => tc.id === "overlap-t1");
assert.ok(overlapTool, "the overlapping tool must be present on toolCalls (from Path A steps restore)");
assert.equal(overlapTool.name, "read_file", "the steps-derived tool entry should be preserved");
assert.equal(
  overlapTool.output,
  "",
  "the steps-derived entry must win (output dropped for completed tools), not the legacy entry (output = ti.result = \"file contents\")",
);
// The id-less legacy tool is kept (Path A cannot restore id-less tools).
const idLessLegacy = (overlapNormalized.toolCalls || []).find((tc) => !tc.id && tc.name === "run_command");
assert.ok(idLessLegacy, "an id-less legacy toolInvocation must still be kept on toolCalls (Path A cannot restore id-less tools)");

// ── 11. Subagent child tools survive reload (steps → toolCalls restore) ──────
// After reload, child tools live only inside steps_json (the backend does not
// persist them as top-level message.toolCalls). SubagentExecutionCard finds
// its children by filtering message.toolCalls against the subagent's spawnId
// via traceId. normalizeVercelMessage must restore toolCalls from steps so
// the child trace stays reachable.
const subagentWithChildTools = {
  id: "backend-5",
  chatId: "chat-1",
  role: "assistant",
  content: "Delegated then answered.",
  model: "test",
  createdAt: Date.now(),
  isComplete: 1,
  kind: "chat",
  stepsJson: JSON.stringify([
    {
      type: "subagent",
      subagent: {
        spawnId: "spawn-2",
        agentId: "agent-2",
        agentName: "coder",
        task: "edit the file",
        status: "completed",
        resultSummary: "done",
        durationMs: 800,
      },
    },
    {
      type: "tool-call",
      toolCall: {
        id: "child-t1",
        name: "edit_file",
        status: "completed",
        input: { path: "foo.ts" },
        output: "",
        traceId: "spawn-2",
      },
    },
    { type: "text", content: "Delegated then answered." },
  ]),
};
const subagentNormalized = normalizeVercelMessage(subagentWithChildTools);
assert.ok(
  Array.isArray(subagentNormalized.toolCalls) && subagentNormalized.toolCalls.length > 0,
  "normalizeVercelMessage must restore toolCalls from persisted steps so subagent child tools survive reload",
);
const childTool = subagentNormalized.toolCalls.find((tc) => tc.id === "child-t1");
assert.ok(childTool, "the subagent child tool must be present on message.toolCalls after rehydration");
assert.equal(childTool.traceId, "spawn-2", "the restored child tool must preserve its traceId so SubagentExecutionCard can re-attach it");

await closeSourceModuleLoader();
console.log("chat reload contract ok");
