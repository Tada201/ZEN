import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/taskWorkflowRouting.ts", import.meta.url);
let source = readFileSync(sourcePath, "utf8");
source = source
  .replace('import type { AgentActionEventPayload, TaskEventPayload } from "@/api/events";\n', "")
  .replace(
    'import { getActiveStreamingChatId, getDirectOrActiveStreamingChatId, type ActiveStreamState } from "./activeStreamRouting";',
    `function getActiveStreamingChatId(state) {
      const streamingChats = state.streamingChats || {};
      const activeSessionId = state.activeSessionId;
      if (activeSessionId && streamingChats[activeSessionId]) return activeSessionId;
      const streamingIds = Object.entries(streamingChats).filter(([, isStreaming]) => isStreaming).map(([chatId]) => chatId);
      return streamingIds.length === 1 ? streamingIds[0] : undefined;
    }
    function getDirectOrActiveStreamingChatId(state, payload) {
      return payload.chat_id || payload.chatId || getActiveStreamingChatId(state);
    }`,
  );

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "taskWorkflowRouting.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const {
  getTaskChatId,
  getTaskId,
  getTaskPlanChatId,
  getWorkflowChatId,
  rememberTaskChat,
  rememberTaskListChats,
  rememberWorkflowChat,
} = await import(moduleUrl);

const state = { activeSessionId: "chat-active", streamingChats: { "chat-active": true } };

assert.equal(getTaskId({ task_id: "task-snake" }), "task-snake", "snake_case task id should be recognized");
assert.equal(getTaskId({ taskId: "task-camel" }), "task-camel", "camelCase task id should be recognized");
assert.equal(getTaskChatId(new Map(), state, { chat_id: "chat-direct", task_id: "task-1" }), "chat-direct", "direct task chat id should win");
assert.equal(getTaskChatId(new Map(), state, { task_id: "task-1" }), "chat-active", "sparse task event should route to active stream");

const taskCache = new Map();
rememberTaskChat(taskCache, { task_id: "task-1" }, "chat-1");
assert.equal(getTaskChatId(taskCache, { activeSessionId: null, streamingChats: {} }, { task_id: "task-1" }), "chat-1", "known task id should route without active stream");

rememberTaskListChats(taskCache, [{ task_id: "task-2" }, { id: "task-3" }], "chat-1");
assert.equal(getTaskChatId(taskCache, { activeSessionId: null, streamingChats: {} }, { task_id: "task-2" }), "chat-1", "task list should remember snake_case task ids");
assert.equal(getTaskChatId(taskCache, { activeSessionId: null, streamingChats: {} }, { id: "task-3" }), "chat-1", "task list should remember id task ids");

const workflowCache = new Map();
assert.equal(getWorkflowChatId(workflowCache, state, { workflow_id: "workflow-1" }), "chat-active", "sparse workflow event should route to active stream");
rememberWorkflowChat(workflowCache, { workflow_id: "workflow-1" }, "chat-1");
assert.equal(getWorkflowChatId(workflowCache, { activeSessionId: null, streamingChats: {} }, { workflow_id: "workflow-1" }), "chat-1", "known workflow should route without active stream");
assert.equal(getWorkflowChatId(workflowCache, state, { chatId: "chat-direct", workflow_id: "workflow-1" }), "chat-direct", "direct workflow chat id should win");

assert.equal(getTaskPlanChatId(state, {}), "chat-active", "sparse task plan event should route to active stream");
assert.equal(getTaskPlanChatId(state, { chat_id: "chat-direct" }), "chat-direct", "direct task plan chat id should win");

console.log("task workflow routing ok");
