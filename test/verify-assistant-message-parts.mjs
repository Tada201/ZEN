import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "assistantMessageParts.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { groupAssistantSteps, groupToolCalls, legacyMessageToActionStep, parseCardTags, toolResultMetaToOutput } = await import(moduleUrl);

const parsed = parseCardTags('Before <card>{"type":"metric","data":{"value":42}}</card> After');
assert.equal(parsed.cards.length, 1, "card tags should be extracted");
assert.equal(parsed.cards[0].type, "metric", "card type should be preserved");
assert.equal(parsed.cleanText, "Before  After", "card markup should be removed from text");

const partial = parseCardTags('Start <card>{"type":"metric"');
assert(partial.cleanText.includes("Generating card"), "partial card JSON should show a generation placeholder");

const steps = groupAssistantSteps([
  { type: "action", kind: "chat_status", content: "Planning tools", status: "running" },
  { type: "action", kind: "tool_call", content: "hidden duplicate", status: "running" },
  { type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "running", input: { path: "a" }, output: "" } },
  { type: "tool-call", toolCall: { id: "tool-2", name: "web_search", status: "running", input: { query: "b" }, output: "" } },
  { type: "text", content: "Answer " },
  { type: "text", content: "stream" },
]);

assert.equal(steps.length, 3, "hidden tool action rows should be removed and adjacent tools/text grouped");
assert.equal(steps[0].type, "action", "status action should remain first");
assert.equal(steps[1].type, "tool-group", "parallel tool calls should become one tool group");
assert.equal(steps[1].toolCalls.length, 2, "tool group should contain both parallel tools");
assert.equal(steps[2].cleanText, "Answer stream", "adjacent text chunks should merge");

const mergedAgentLifecycleSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "agent_spawn",
    status: "running",
    content: "Inspect streaming",
    eventId: "agent:spawn:researcher",
    timestamp: 1000,
    metadata: {
      iteration: 1,
      spawn: {
        parentAgent: "Coordinator",
        childAgent: "Researcher",
        task: "Inspect streaming",
        status: "spawned",
      },
    },
  },
  {
    type: "action",
    kind: "agent_complete",
    status: "completed",
    eventId: "agent:complete:researcher",
    timestamp: 1600,
    metadata: {
      iteration: 1,
      resultSummary: "Streaming path verified.",
      spawn: {
        parentAgent: "Coordinator",
        childAgent: "Researcher",
        task: "Inspect streaming",
        status: "completed",
        durationMs: 600,
      },
    },
  },
]);
assert.equal(mergedAgentLifecycleSteps.length, 1, "matching agent spawn and completion should render as one evolving delegation row");
assert.equal(mergedAgentLifecycleSteps[0].kind, "agent_complete", "merged delegation row should use the latest lifecycle kind");
assert.equal(mergedAgentLifecycleSteps[0].status, "completed", "merged delegation row should use the latest status");
assert.equal(mergedAgentLifecycleSteps[0].metadata.resultSummary, "Streaming path verified.", "merged delegation row should preserve the final result summary");
assert.equal(mergedAgentLifecycleSteps[0].metadata.spawn.durationMs, 600, "merged delegation row should preserve completion duration");

const interleavedToolSteps = groupAssistantSteps([
  { type: "action", kind: "chat_status", content: "Parallel batch planned", status: "running", metadata: { phase: "tool_batch_planned", parallel: true } },
  { type: "tool-call", toolCall: { id: "tool-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000 } },
  { type: "action", kind: "chat_status", content: "Waiting for tools", status: "running", metadata: { phase: "tool_batch_running" } },
  { type: "tool-call", toolCall: { id: "tool-b", name: "web_search", status: "running", input: { query: "b" }, output: "", startTime: 1200 } },
]);
assert.equal(interleavedToolSteps.length, 3, "status rows should not split one parallel tool batch");
assert.equal(interleavedToolSteps[1].type, "tool-group", "first tool should create a visible batch");
assert.equal(interleavedToolSteps[1].toolCalls.length, 2, "interleaved parallel tools should stay in one group");

const separatedToolSteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "tool-c", name: "read_file", status: "completed", input: {}, output: "ok", startTime: 1000 } },
  { type: "text", content: "Then " },
  { type: "tool-call", toolCall: { id: "tool-d", name: "run_command", status: "running", input: {}, output: "", startTime: 1100 } },
]);
assert.equal(separatedToolSteps.length, 3, "answer text should split separate tool phases");
assert.equal(separatedToolSteps[0].type, "tool-group", "first tool phase should remain visible");
assert.equal(separatedToolSteps[2].type, "tool-group", "second tool phase should remain visible");

const explicitBatchToolSteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "batch-tool-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000, batchId: "batch-1" } },
  { type: "tool-call", toolCall: { id: "batch-tool-b", name: "read_file", status: "running", input: { path: "b" }, output: "", startTime: 5000, batchId: "batch-1" } },
]);
assert.equal(explicitBatchToolSteps.length, 1, "same explicit batch id should group even when timestamps are far apart");
assert.equal(explicitBatchToolSteps[0].type, "tool-group", "explicit batch should render as one tool group");
assert.equal(explicitBatchToolSteps[0].toolCalls.length, 2, "explicit batch group should contain both tools");
assert(explicitBatchToolSteps[0].toolCalls.every((tool) => tool.batchId === "batch-1"), "explicit batch id should survive grouping");

const explicitToolBatchOnlySteps = groupAssistantSteps([
  { type: "tool-call", toolCall: { id: "tool-batch-only-a", name: "read_file", status: "running", input: { path: "a" }, output: "", startTime: 1000, toolBatchId: "tool-batch-only" } },
  { type: "tool-call", toolCall: { id: "tool-batch-only-b", name: "read_file", status: "running", input: { path: "b" }, output: "", startTime: 5000, toolBatchId: "tool-batch-only" } },
]);
assert.equal(explicitToolBatchOnlySteps.length, 1, "same explicit toolBatchId should group even when batchId is absent");
assert.equal(explicitToolBatchOnlySteps[0].type, "tool-group", "toolBatchId-only tools should render as one group");
assert.equal(explicitToolBatchOnlySteps[0].toolCalls.length, 2, "toolBatchId-only group should contain both tools");

const fallbackToolSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_result",
    content: "fallback preview",
    status: "completed",
    eventId: "tool:legacy-1",
    timestamp: 900,
    metadata: {
      agentId: "agent-research-1",
      agentName: "Researcher",
      iteration: 3,
      toolResult: {
        toolName: "read_file",
        status: "ok",
        durationMs: 8,
        contentSummary: "Read 12 lines from src/App.tsx",
        rawResult: { files: [{ path: "src/App.tsx", lines: 12 }] },
        args: { path: "src/App.tsx" },
      },
    },
  },
]);
assert.equal(fallbackToolSteps.length, 1, "orphan tool result action should become a visible tool group");
assert.equal(fallbackToolSteps[0].type, "tool-group", "orphan tool result should render through ToolCallCard");
assert.equal(fallbackToolSteps[0].toolCalls[0].id, "legacy-1", "synthetic tool card should preserve the tool id");
assert.equal(fallbackToolSteps[0].toolCalls[0].status, "completed", "synthetic tool card should preserve completion status");
assert.equal(fallbackToolSteps[0].toolCalls[0].agentName, "Researcher", "synthetic tool card should preserve agent ownership");
assert.equal(fallbackToolSteps[0].toolCalls[0].iteration, 3, "synthetic tool card should preserve agent iteration");
assert(fallbackToolSteps[0].toolCalls[0].output.includes("src/App.tsx"), "synthetic tool card should preserve result output");

const persistedToolLifecycleSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_call",
    content: "run command",
    status: "running",
    eventId: "tool:build-1",
    timestamp: 1000,
    metadata: {
      agentName: "Builder",
      iteration: 2,
      toolCall: {
        toolName: "run_command",
        status: "running",
        toolCallId: "build-1",
        args: { command: "npm run build" },
      },
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "build passed",
    status: "completed",
    eventId: "tool:build-1",
    timestamp: 1400,
    metadata: {
      agentName: "Builder",
      iteration: 2,
      toolResult: {
        toolName: "run_command",
        status: "ok",
        durationMs: 400,
        contentSummary: "Production build completed",
        args: {},
      },
    },
  },
]);
assert.equal(persistedToolLifecycleSteps.length, 1, "persisted tool call/result pair should render as one batch");
assert.equal(persistedToolLifecycleSteps[0].type, "tool-group", "persisted tool lifecycle should render through tool cards");
assert.equal(persistedToolLifecycleSteps[0].toolCalls.length, 1, "same-id tool call/result actions should merge into one card");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].status, "completed", "merged persisted tool should use terminal status");
assert.deepEqual(persistedToolLifecycleSteps[0].toolCalls[0].input, { command: "npm run build" }, "merged persisted tool should preserve original input");
assert(persistedToolLifecycleSteps[0].toolCalls[0].output.includes("Production build completed"), "merged persisted tool should preserve result preview");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].agentName, "Builder", "merged persisted tool should preserve owner");
assert.equal(persistedToolLifecycleSteps[0].toolCalls[0].completedAt, 1400, "merged persisted tool should preserve completion timestamp");

const mixedLivePersistedToolSteps = groupAssistantSteps([
  {
    type: "tool-call",
    toolCall: {
      id: "mixed-1",
      name: "run_command",
      status: "running",
      input: { command: "npm run build" },
      output: "",
      startTime: 3000,
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "Build passed",
    status: "completed",
    eventId: "tool:mixed-1",
    timestamp: 3500,
    metadata: {
      agentName: "Builder",
      toolResult: {
        toolName: "run_command",
        status: "ok",
        durationMs: 500,
        contentSummary: "Build passed",
        rawResult: { stdout: "npm run build completed", exitCode: 0 },
        args: {},
      },
    },
  },
]);
assert.equal(mixedLivePersistedToolSteps.length, 1, "live tool card and persisted result should render as one batch");
assert.equal(mixedLivePersistedToolSteps[0].type, "tool-group", "mixed live/persisted lifecycle should render through tool cards");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls.length, 1, "same-id live tool and persisted result should merge");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].status, "completed", "persisted result should complete the live tool card");
assert.deepEqual(mixedLivePersistedToolSteps[0].toolCalls[0].input, { command: "npm run build" }, "persisted result should not erase live input");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].durationMs, 500, "persisted result should add duration");
assert.equal(mixedLivePersistedToolSteps[0].toolCalls[0].completedAt, 3500, "persisted result should add completion timestamp");
assert(mixedLivePersistedToolSteps[0].toolCalls[0].output.includes("npm run build completed"), "persisted result should add stdout preview");

const snakeCasePersistedToolSteps = groupAssistantSteps([
  {
    type: "action",
    kind: "tool_call",
    content: "read file",
    status: "running",
    eventId: "tool:snake-1",
    timestamp: 2000,
    metadata: {
      agentId: "worker-1",
      agentName: "Frontend worker",
      iteration: 5,
      toolCall: {
        tool_name: "read_file",
        tool_call_id: "snake-1",
        status: "running",
        arguments: { path: "src/atlas/components/chat/AssistantMessage.tsx" },
      },
    },
  },
  {
    type: "action",
    kind: "tool_result",
    content: "read ok",
    status: "completed",
    eventId: "tool:snake-1",
    timestamp: 2200,
    metadata: {
      agentId: "worker-1",
      agentName: "Frontend worker",
      iteration: 5,
      toolResult: {
        tool_name: "read_file",
        tool_call_id: "snake-1",
        status: "ok",
        duration_ms: 200,
        content_summary: "Read AssistantMessage renderer",
        raw_result: {
          files: [{ path: "src/atlas/components/chat/AssistantMessage.tsx", changeType: "modified" }],
        },
        batch_id: "batch-snake",
      },
    },
  },
]);
assert.equal(snakeCasePersistedToolSteps.length, 1, "snake_case persisted tool lifecycle should render as one batch");
assert.equal(snakeCasePersistedToolSteps[0].type, "tool-group", "snake_case persisted tool lifecycle should render through tool cards");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].name, "read_file", "snake_case tool_name should become tool card name");
assert.deepEqual(
  snakeCasePersistedToolSteps[0].toolCalls[0].input,
  { path: "src/atlas/components/chat/AssistantMessage.tsx" },
  "snake_case persisted tool should preserve original arguments",
);
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].durationMs, 200, "snake_case duration_ms should normalize");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].agentName, "Frontend worker", "snake_case persisted tool should preserve owner");
assert.equal(snakeCasePersistedToolSteps[0].toolCalls[0].batchId, "batch-snake", "snake_case batch_id should normalize");
assert(snakeCasePersistedToolSteps[0].toolCalls[0].output.includes("AssistantMessage.tsx"), "snake_case raw_result should preserve result preview");

const persistedOutput = toolResultMetaToOutput({
  toolName: "edit_file",
  status: "ok",
  durationMs: 12,
  contentSummary: "Updated execution trace UI",
  files: [{ path: "src/atlas/components/chat/AgentExecutionTrace.tsx", changeType: "modified", linesAdded: 8 }],
  args: { path: "src/atlas/components/chat/AgentExecutionTrace.tsx" },
});
assert(persistedOutput.includes("Updated execution trace UI"), "persisted tool output should retain summary when rawResult is missing");
assert(persistedOutput.includes("AgentExecutionTrace.tsx"), "persisted tool output should retain file preview data when rawResult is missing");

const mergedRawOutput = toolResultMetaToOutput({
  toolName: "run_command",
  status: "ok",
  durationMs: 40,
  contentSummary: "Build passed",
  rawResult: { stdout: "npm run build completed", exitCode: 0 },
  files: [{ path: "package.json", changeType: "modified" }],
});
assert(mergedRawOutput.includes("npm run build completed"), "rawResult stdout should remain visible");
assert(mergedRawOutput.includes("Build passed"), "rawResult output should include summary fallback");
assert(mergedRawOutput.includes("package.json"), "rawResult output should merge file metadata");

const legacyApproval = legacyMessageToActionStep({
  id: "approval-1",
  role: "assistant",
  content: "Need permission",
  kind: "approval_request",
  createdAt: 123,
  metadata: {
    approvalRequest: {
      tool_call_id: "tool-approval-1",
      tool_name: "run_command",
      arguments: { command: "npm test" },
    },
  },
});
assert.equal(legacyApproval.type, "action", "legacy approval messages should render through AgentActionStep");
assert.equal(legacyApproval.kind, "approval_request", "legacy action should keep the message kind");
assert.equal(legacyApproval.eventId, "legacy:approval-1", "legacy action should have a stable event id");
assert.equal(legacyApproval.metadata.approvalRequest.tool_name, "run_command", "legacy action should preserve approval metadata");

const retried = groupToolCalls([
  { id: "tool-a1", name: "run_command", status: "error", input: { command: "npm test" }, output: "failed" },
  { id: "tool-a2", name: "run_command", status: "completed", input: { command: "npm test" }, output: "passed" },
]);
assert.equal(retried.length, 1, "same-name retry should collapse into one tool row");
assert.equal(retried[0].status, "completed", "collapsed retry should use latest status");
assert.equal(retried[0].retries, 1, "retry count should be retained");

const retriedWithOwner = groupToolCalls([
  { id: "tool-b1", name: "run_command", status: "error", input: { command: "npm test" }, output: "failed", agentName: "Runner" },
  { id: "tool-b2", name: "run_command", status: "completed", input: { command: "npm test" }, output: "passed", agentName: "Verifier", iteration: 4 },
]);
assert.equal(retriedWithOwner[0].agentName, "Verifier", "collapsed retry should use latest tool owner");
assert.equal(retriedWithOwner[0].iteration, 4, "collapsed retry should use latest iteration");

console.log("assistant message parts ok");
