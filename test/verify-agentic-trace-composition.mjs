import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

function loadTsModule(relativePath, replacements = []) {
  const sourcePath = new URL(relativePath, import.meta.url);
  let source = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) {
    source = source.replace(from, to);
  }
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: relativePath,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const ledgerModule = await loadTsModule("../src/atlas/hooks/stream/agentActionLedger.ts", [
  [
    'import { findWritableAssistantIndex } from "./messageTarget";',
    `function findWritableAssistantIndex(messages) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === "assistant" && message.status === "sending") return i;
      }
      return -1;
    }`,
  ],
]);
const toolReducerModule = await loadTsModule("../src/atlas/hooks/stream/toolEventReducer.ts");
const partsModule = await loadTsModule("../src/atlas/components/chat/assistantMessageParts.ts");
const inputPreviewModule = await loadTsModule("../src/atlas/components/chat/tool/toolInputPreview.ts");

const { appendActionStepToMessages } = ledgerModule;
const { makeToolCall, upsertTool } = toolReducerModule;
const { groupAssistantSteps, summarizeExecutionSteps } = partsModule;
const { buildToolChecklistPreview } = inputPreviewModule;

const fixtures = JSON.parse(readFileSync(new URL("./chat-fixtures.json", import.meta.url), "utf8"));
const fixture = fixtures.test_agentic;
const chatId = "chat-agentic-composition";
let now = 1_000;
let messages = [
  { id: "user-1", sessionId: chatId, role: "user", content: fixture.prompt, status: "sent" },
  { id: "assistant-live", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];

function eventTimestamp() {
  now += 100;
  return new Date(now).toISOString();
}

for (const step of fixture.flow) {
  if (step.type === "chat:status") {
    messages = appendActionStepToMessages(
      messages,
      chatId,
      { chat_id: chatId, timestamp: eventTimestamp(), ...step.payload },
      "chat_status",
    );
  }
  if (step.type === "agent:spawn") {
    messages = appendActionStepToMessages(
      messages,
      chatId,
      { chat_id: chatId, timestamp: eventTimestamp(), ...step.payload },
      "agent_spawn",
    );
  }
  if (step.type === "agent:complete") {
    messages = appendActionStepToMessages(
      messages,
      chatId,
      { chat_id: chatId, timestamp: eventTimestamp(), ...step.payload },
      "agent_complete",
    );
  }
  if (step.type === "tool:start" || step.type === "tool:authorization_request") {
    const status = step.type === "tool:start" ? "running" : "awaiting_approval";
    const tool = makeToolCall(
      step.tool_call_id,
      step.tool_name,
      status,
      step.arguments,
      "",
      undefined,
      now,
      {
        agentId: step.agent_id,
        agentName: step.agent_name,
        iteration: step.iteration,
        batchId: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
        approvalContext: step.context ? {
          riskLevel: step.context.risk_level || step.context.riskLevel,
          description: step.context.description,
          argumentsPreview: step.context.arguments_preview || step.context.argumentsPreview,
          suggestedPatterns: step.context.suggested_patterns || step.context.suggestedPatterns,
        } : undefined,
      },
    );
    messages = upsertTool(messages, chatId, tool, now);
  }
  if (step.type === "tool:complete") {
    const tool = makeToolCall(
      step.tool_call_id,
      step.tool_name,
      step.status === "success" ? "completed" : "error",
      {},
      step.output,
      step.duration_ms,
      now,
      {
        agentId: step.agent_id,
        agentName: step.agent_name,
        iteration: step.iteration,
        batchId: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
      },
    );
    messages = upsertTool(messages, chatId, tool, now);
  }
  if (step.type === "chunk") {
    const assistant = messages.find((message) => message.id === "assistant-live");
    assistant.content = `${assistant.content || ""}${step.delta || ""}`;
    assistant.steps = [...(assistant.steps || []), { type: "text", content: step.delta || "" }];
  }
  if (step.type === "done") {
    const assistant = messages.find((message) => message.id === "assistant-live");
    assistant.content = step.content;
    assistant.status = "sent";
  }
}

const assistant = messages.find((message) => message.id === "assistant-live");
assert(assistant, "composition should keep one live assistant message");
assert.equal(assistant.toolCalls.length, 4, "all fixture tools should attach to the assistant");

const grouped = groupAssistantSteps(assistant.steps);
const summary = summarizeExecutionSteps(grouped);
const toolGroups = grouped.filter((step) => step.type === "tool-group");
const actionSteps = grouped.filter((step) => step.type === "action");
const completedSpawn = actionSteps.find((step) => step.kind === "agent_complete" || step.kind === "agent_spawn");
const parallelGroup = toolGroups.find((step) => step.toolCalls.length >= 3);
const approvalTool = assistant.toolCalls.find((tool) => tool.id === "mock-build-approval-003");
const todoTool = assistant.toolCalls.find((tool) => tool.id === "mock-plan-todos-000");

assert(summary, "agentic composition should produce an execution summary");
assert.equal(summary.label, "Agent execution", "mixed agent/tool flow should summarize as agent execution");
assert(summary.detail.includes("tool call"), "summary should mention tool calls");
assert(completedSpawn, "spawn and completion should merge into one lifecycle action");
assert.equal(completedSpawn.status, "completed", "agent lifecycle row should finish completed");
assert.equal(completedSpawn.metadata.spawn.task, "Inspect frontend streaming and execution trace behavior.", "completion should preserve original delegated task");
assert(completedSpawn.metadata.resultSummary.includes("Execution trace"), "agent completion result summary should remain visible");
assert(parallelGroup, "parallel tool starts should group into one tool batch");
assert(parallelGroup.toolCalls.every((tool) => tool.agentName === "Researcher"), "tool batch should preserve subagent owner labels");
assert(parallelGroup.toolCalls.every((tool) => tool.batchId === "mock-batch-research-001"), "tool batch should preserve explicit batch identity");
assert(parallelGroup.toolCalls.every((tool) => tool.status === "completed"), "tool batch should finish completed");
assert(todoTool, "todo planning tool should remain present");
assert.equal(buildToolChecklistPreview(todoTool.input).length, 4, "todo planning tool should render checklist preview data");
assert(approvalTool, "approval-gated tool should remain present");
assert.equal(approvalTool.approvalContext.riskLevel, "medium", "approval risk should survive start/complete merging");
assert.equal(approvalTool.input.command, "npm run build", "approval tool should preserve original command input");
assert(approvalTool.output.includes("Production build completed"), "approval tool result preview output should survive completion");

console.log("agentic trace composition ok");
