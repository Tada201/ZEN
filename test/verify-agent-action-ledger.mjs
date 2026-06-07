import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url);
const chatStatusSource = readFileSync(new URL("../src/api/chatStatus.ts", import.meta.url), "utf8");
const chatStatusMatch = chatStatusSource.match(/export const CHAT_STATUS_PHASES = (\{[\s\S]*?\}) as const;/);
assert(chatStatusMatch, "CHAT_STATUS_PHASES export should be readable by the verifier");

const source = readFileSync(sourcePath, "utf8")
  .replace(
    /import \{ CHAT_STATUS_PHASES \} from ["'][^"']+chatStatus["'];/,
    `const CHAT_STATUS_PHASES = ${chatStatusMatch[1]};`,
  )
  .replace(
    'import { findWritableAssistantIndex } from "./messageTarget";',
    `function findWritableAssistantIndex(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === "assistant" && message.status === "sending") return i;
    }
    return -1;
  }`,
  );

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "agentActionLedger.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { appendActionStepToMessages, createActionStep, getActionEventId, normalizeMetadata } = await import(moduleUrl);

const started = appendActionStepToMessages(
  [
    { id: "user-1", sessionId: "chat-1", role: "user", content: "Build it", status: "sent" },
    { id: "assistant-live", sessionId: "chat-1", role: "assistant", content: "", status: "sending", steps: [] },
  ],
  "chat-1",
  {
    chat_id: "chat-1",
    spawn_id: "worker-1",
    child_agent_name: "Frontend worker",
    parent_agent: "orchestrator",
    task: "Inspect UI streaming",
    timestamp: "2026-05-29T00:00:00.000Z",
  },
  "agent_spawn",
);

assert.equal(started.length, 2, "spawn should attach to the live assistant, not create a system row");
assert.equal(started[1].steps.length, 1, "assistant should receive the spawn action");
assert.equal(started[1].steps[0].eventId, "agent:worker-1", "spawn should use a stable lifecycle event id");
assert.equal(started[1].steps[0].metadata.spawn.childAgent, "Frontend worker", "child agent name should be normalized");

const completed = appendActionStepToMessages(
  started,
  "chat-1",
  {
    chat_id: "chat-1",
    spawn_id: "worker-1",
    child_agent_name: "Frontend worker",
    parent_agent: "orchestrator",
    result: { summary: "Found slow input render path" },
    duration_ms: 245,
    timestamp: "2026-05-29T00:00:01.000Z",
  },
  "agent_complete",
);

assert.equal(completed[1].steps.length, 1, "complete should merge into the spawn row");
assert.equal(completed[1].steps[0].status, "completed", "merged lifecycle row should end completed");
assert.equal(completed[1].steps[0].metadata.spawn.status, "completed", "spawn metadata should reflect completion");
assert.equal(completed[1].steps[0].metadata.spawn.task, "Inspect UI streaming", "completion must not erase the original task");
assert.equal(completed[1].steps[0].metadata.resultSummary, "Found slow input render path", "completion result should be visible");

const fallback = appendActionStepToMessages([], "chat-1", { chat_id: "chat-1", message: "Provider ready" }, "chat_status");
assert.equal(fallback.length, 1, "orphan status should create a fallback ledger row");
assert.equal(fallback[0].role, "system", "fallback ledger row should be system-scoped");
assert.equal(fallback[0].steps[0].content, "Provider ready", "fallback row should preserve user-visible status text");

assert.equal(
  getActionEventId({ chat_id: "chat-1", phase: "provider_ready", message: "Provider ready" }, "chat_status"),
  "status:chat-1:provider_ready",
  "chat status events with phases should update one stable status row",
);

assert.equal(
  getActionEventId(
    {
      metadata: {
        tool_result: { tool_name: "read_file", tool_call_id: "tool-1", status: "ok", contentSummary: "done", durationMs: 4 },
      },
    },
    "tool_result",
  ),
  "tool:tool-1",
  "tool result ids should merge with the matching tool call row",
);

const approvalMeta = normalizeMetadata("approval_request", {
  metadata: {
    approval_request: {
      tool_call_id: "danger-1",
      tool_name: "run_shell",
      arguments: { command: "npm test" },
    },
  },
});
assert.equal(approvalMeta.approvalRequest.tool_call_id, "danger-1", "snake_case approval metadata should normalize");

const agentOwnedMeta = normalizeMetadata("tool_result", {
  agent_id: "worker-1",
  agent_name: "Frontend worker",
  parent_agent_id: "orchestrator",
  iteration: 2,
  run_id: "run-tool-owned",
  message_id: "assistant-owned",
  execution_id: "exec-tool-owned",
  batch_id: "batch-owned",
  tool_batch_id: "tool-batch-owned",
  metadata: {
    tool_result: {
      tool_name: "read_file",
      tool_call_id: "tool-owned-1",
      status: "ok",
      duration_ms: 12,
      content_summary: "Read trace renderer",
    },
  },
});
assert.equal(agentOwnedMeta.agentId, "worker-1", "top-level agent_id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.agentName, "Frontend worker", "top-level agent_name should normalize for persisted action rows");
assert.equal(agentOwnedMeta.parentAgentId, "orchestrator", "top-level parent agent id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.runId, "run-tool-owned", "top-level run id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.messageId, "assistant-owned", "top-level message id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.executionId, "exec-tool-owned", "top-level execution id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.batchId, "batch-owned", "top-level batch id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.toolBatchId, "tool-batch-owned", "top-level tool batch id should normalize for persisted action rows");
assert.equal(agentOwnedMeta.toolResult.tool_name, "read_file", "snake_case tool result metadata should remain available");

const failedTask = createActionStep({ error: "Compilation failed" }, "task_failed");
assert.equal(failedTask.status, "error", "failed task events should render as errors");
assert.equal(
  getActionEventId({ taskId: "task-42", description: "Patch trace UI" }, "task_updated"),
  "task:task-42",
  "task updates should merge into one lifecycle row",
);
const taskList = createActionStep(
  {
    chat_id: "chat-1",
    tasks: [
      { task_id: "t1", description: "Inspect execution trace", status: "completed" },
      { task_id: "t2", description: "Patch missing task events", status: "running" },
    ],
  },
  "task_list_updated",
);
assert.equal(taskList.content, "2 tasks planned", "task list events should become a user-visible plan summary");
assert.equal(taskList.eventId, "task-list:chat-1", "task list events should update one chat-scoped row");
assert.equal(taskList.metadata.tasks.length, 2, "task list metadata should be preserved for details");
const complexity = createActionStep(
  {
    chat_id: "chat-1",
    tier: "complex",
    battle_plan: { steps: ["Map events", "Render trace"], agents_needed: ["frontend"] },
  },
  "task_complexity_analyzed",
);
assert(complexity.content.includes("Map events"), "complexity event should surface the battle plan");
assert.equal(complexity.metadata.battlePlan.agents_needed[0], "frontend", "battle plan metadata should be preserved");
const completedTask = createActionStep(
  {
    task_id: "task-result-1",
    description: "Patch execution preview",
    duration_ms: 128,
    result: { success: true, output: "Updated the trace renderer" },
  },
  "task_completed",
);
assert.equal(completedTask.status, "completed", "task completion should render completed");
assert.equal(completedTask.content, "Updated the trace renderer", "task result output should become the visible summary");
assert.equal(completedTask.metadata.taskResult.output, "Updated the trace renderer", "task result output should be preserved for inline preview");
assert.equal(completedTask.metadata.taskResult.durationMs, 128, "task result duration should be preserved");

const workflowStarted = appendActionStepToMessages(
  [
    { id: "user-2", sessionId: "chat-1", role: "user", content: "Run workflow", status: "sent" },
    { id: "assistant-workflow", sessionId: "chat-1", role: "assistant", content: "", status: "sending", steps: [] },
  ],
  "chat-1",
  { chat_id: "chat-1", workflow_id: "workflow-1", total_tasks: 3 },
  "workflow_started",
);
const workflowCompleted = appendActionStepToMessages(
  workflowStarted,
  "chat-1",
  { chat_id: "chat-1", workflow_id: "workflow-1", tasks_completed: 3, duration_ms: 842 },
  "workflow_completed",
);
assert.equal(workflowCompleted[1].steps.length, 1, "workflow completion should merge into the started row");
assert.equal(workflowCompleted[1].steps[0].eventId, "workflow:workflow-1", "workflow lifecycle should use one stable event id");
assert.equal(workflowCompleted[1].steps[0].status, "completed", "merged workflow row should finish completed");
assert.equal(workflowCompleted[1].steps[0].metadata.totalTasks, 3, "workflow start task count should survive completion");
assert.equal(workflowCompleted[1].steps[0].metadata.tasksCompleted, 3, "workflow completion count should be visible");
assert.equal(workflowCompleted[1].steps[0].metadata.durationMs, 842, "workflow duration should be preserved");

const workflowLateStart = appendActionStepToMessages(
  workflowCompleted,
  "chat-1",
  { chat_id: "chat-1", workflow_id: "workflow-1", total_tasks: 3 },
  "workflow_started",
);
assert.equal(workflowLateStart[1].steps.length, 1, "late workflow start should still merge into one row");
assert.equal(workflowLateStart[1].steps[0].status, "completed", "late workflow start must not regress completed workflow");
assert.equal(workflowLateStart[1].steps[0].metadata.status, "completed", "late workflow start must not regress workflow metadata status");
assert.equal(workflowLateStart[1].steps[0].metadata.tasksCompleted, 3, "late workflow start should preserve completion count");

const taskCompletedMessages = appendActionStepToMessages(
  [
    { id: "user-3", sessionId: "chat-1", role: "user", content: "Run task", status: "sent" },
    { id: "assistant-task", sessionId: "chat-1", role: "assistant", content: "", status: "sending", steps: [] },
  ],
  "chat-1",
  { chat_id: "chat-1", task_id: "task-late", result: { output: "Task is done" }, duration_ms: 44 },
  "task_completed",
);
const taskLateStart = appendActionStepToMessages(
  taskCompletedMessages,
  "chat-1",
  { chat_id: "chat-1", task_id: "task-late", description: "Task started after completion" },
  "task_started",
);
assert.equal(taskLateStart[1].steps.length, 1, "late task start should still merge into one row");
assert.equal(taskLateStart[1].steps[0].status, "completed", "late task start must not regress completed task");
assert.equal(taskLateStart[1].steps[0].content, "Task is done", "late task start must not hide completed task result");
assert.equal(taskLateStart[1].steps[0].metadata.taskResult.output, "Task is done", "late task start should preserve task result preview");

const lateToolStatus = appendActionStepToMessages(
  [
    { id: "user-4", sessionId: "chat-1", role: "user", content: "Search news", status: "sent" },
    {
      id: "assistant-final",
      sessionId: "chat-1",
      role: "assistant",
      content: "Here is the final answer.",
      status: "sent",
      steps: [{ type: "text", content: "Here is the final answer." }],
    },
  ],
  "chat-1",
  {
    chat_id: "chat-1",
    messageId: "assistant-final",
    phase: "tool_call_ready",
    metadata: {
      phase: "tool_call_ready",
      toolCallPreview: { toolCallId: "call-search", toolName: "tool_exec", argumentsPreview: "{\"query\":\"news\"}" },
    },
  },
  "chat_status",
);
assert.equal(lateToolStatus.length, 2, "late tool status should not create a bottom system row");
assert.equal(lateToolStatus[1].steps[0].type, "action", "late tool status should render before final text");
assert.equal(lateToolStatus[1].steps[1].type, "text", "final assistant text should remain after late tool status");

console.log("agent action ledger ok");
