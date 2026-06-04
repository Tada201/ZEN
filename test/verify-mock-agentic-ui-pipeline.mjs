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
  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
}

async function loadMockClient() {
  const fixtures = JSON.parse(readFileSync(new URL("./chat-fixtures.json", import.meta.url), "utf8"));
  const mockStreamingSource = readFileSync(new URL("../src/api/mockStreaming.ts", import.meta.url), "utf8")
    .replace(
      'import { createActionStep } from "@/atlas/hooks/stream/agentActionLedger";',
      `function createActionStep(payload, kind) {
        return {
          type: "action",
          kind,
          content: payload.message || payload.task || payload.content || "",
          status: payload.status === "failed" || payload.error ? "error" : kind === "agent_complete" ? "completed" : "running",
          metadata: {
            phase: payload.phase,
            parallel: payload.parallel,
            tools: payload.tools,
            spawn: {
              parentAgent: payload.parent_agent || "main",
              childAgent: payload.child_agent_name || payload.child_agent_id || payload.agent_id || "agent",
              task: payload.task || "",
              status: payload.status || (kind === "agent_complete" ? "completed" : "running"),
              durationMs: payload.duration_ms,
            },
            resultSummary: payload.result && typeof payload.result === "object" ? payload.result.summary : payload.result,
            iteration: payload.iteration,
          },
          timestamp: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
          eventId: payload.spawn_id ? "agent:" + payload.spawn_id : kind + ":" + (payload.phase || payload.timestamp || ""),
        };
      }`,
    )
    .replace('import chatFixtures from "../../test/chat-fixtures.json";', `const chatFixtures = ${JSON.stringify(fixtures)};`)
    .replace('export function triggerMockStream', 'function triggerMockStream');
  let source = readFileSync(new URL("../src/api/mockClient.ts", import.meta.url), "utf8")
    .replace('import { SECRET_PRESENT_VALUE } from "./settingsApi";', 'const SECRET_PRESENT_VALUE = "__secret_present__";')
    .replace('import { triggerMockStream } from "./mockStreaming";', mockStreamingSource);

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: "mockClient.ts",
  });

  return import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
}

globalThis.window = {};
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const ledgerModule = await loadTsModule("../src/atlas/hooks/stream/agentActionLedger.ts", [
  [
    'import { CHAT_STATUS_PHASES } from "../../../api/chatStatus";',
    `const CHAT_STATUS_PHASES = {
      AgentStreaming: "agent_streaming",
      ToolCallStreaming: "tool_call_streaming",
      ToolCallReady: "tool_call_ready",
    };`,
  ],
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
const partsModule = await loadTsModule("../src/atlas/components/chat/assistantMessageParts.ts", [
  [
    'import { CHAT_STATUS_PHASES } from "@/api/chatStatus";',
    `const CHAT_STATUS_PHASES = {
      AgentStreaming: "agent_streaming",
      ToolCallStreaming: "tool_call_streaming",
      ToolCallReady: "tool_call_ready",
    };`,
  ],
  [
    'import { parseCardTags, type ParsedCard } from "./assistantCardParser";',
    `function parseCardTags(text) {
      return { cards: [], cleanText: text || "" };
    }`,
  ],
  ['export { parseCardTags, type ParsedCard } from "./assistantCardParser";', 'export { parseCardTags };'],
]);
const delegationModule = await loadTsModule("../src/atlas/components/chat/agentDelegationLaneModel.ts");
const traceModelModule = await loadTsModule("../src/atlas/components/chat/agentExecutionTraceModel.ts", [
  [
    'import { buildExecutionLedger, type ExecutionLedger } from "./agentExecutionLedger";',
    `function buildExecutionLedger({ toolCalls = [] }) {
      const agents = new Map([["main", { id: "main", name: "main", status: "running", toolIds: [], childAgentIds: [] }]]);
      const batches = new Map();
      const addAgent = (id, name, toolId) => {
        const agent = agents.get(id) || { id, name, status: "running", toolIds: [], childAgentIds: [] };
        agent.name = name || agent.name;
        if (toolId && !agent.toolIds.includes(toolId)) agent.toolIds.push(toolId);
        agents.set(id, agent);
      };
      toolCalls.slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0)).forEach((tool, index) => {
        const agentId = tool.agentId || tool.agentName || "main";
        addAgent(agentId, tool.agentName || tool.agentId || "main", tool.id);
        const values = Array.from(batches.values());
        const last = values[values.length - 1];
        const key = tool.batchId ? "batch:" + tool.batchId : last && tool.startTime && last.startedAt && Math.abs(tool.startTime - last.startedAt) < 750 ? last.id : "single:" + tool.id;
        const batch = batches.get(key) || { id: key, label: tool.batchId ? "Batch " + tool.batchId : key.startsWith("single:") ? "Tool " + (index + 1) : "Parallel batch " + (batches.size + 1), explicit: Boolean(tool.batchId), agentIds: [], toolIds: [], startedAt: tool.startTime };
        if (!batch.agentIds.includes(agentId)) batch.agentIds.push(agentId);
        if (!batch.toolIds.includes(tool.id)) batch.toolIds.push(tool.id);
        if (!batch.explicit && batch.toolIds.length > 1) batch.label = "Parallel batch 1";
        batches.set(key, batch);
      });
      return { agents: Array.from(agents.values()), batches: Array.from(batches.values()), tools: toolCalls, handoffs: [], rootAgentId: "main", running: 0, completed: 0, errors: 0, cancelled: 0, active: toolCalls.some((tool) => tool.status === "running" || tool.status === "awaiting_approval") };
    }`,
  ],
  [
    'import { buildToolOutputPreview } from "./tool/toolOutputPreview";',
    `function buildToolOutputPreview(output) {
      let parsed = output;
      try { parsed = JSON.parse(output || ""); } catch {}
      const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      const artifact = record.artifact && record.artifact.type && record.artifact.content ? record.artifact : undefined;
      const files = Array.isArray(record.files) ? record.files : Array.isArray(record.changedFiles) ? record.changedFiles : [];
      const results = Array.isArray(record.results) ? record.results : [];
      const exitCode = record.exitCode ?? record.exit_code;
      const summary = record.summary || record.stderr || record.stdout || (typeof parsed === "string" ? parsed : "");
      return { files, artifact, results, exitCode: exitCode === undefined ? undefined : String(exitCode), summary };
    }`,
  ],
]);
const outputPreviewModule = await loadTsModule("../src/atlas/components/chat/tool/toolOutputPreview.ts");
const inputPreviewModule = await loadTsModule("../src/atlas/components/chat/tool/toolInputPreview.ts");
const compactPreviewModule = await loadTsModule("../src/atlas/components/chat/tool/toolCompactPreview.ts", [
  ['import type { ToolCall } from "../types";\n', ""],
  ['import type { ToolChecklistItem } from "./toolInputPreview";\n', ""],
]);
const { executeMockCommand, mockListen } = await loadMockClient();

const { appendActionStepToMessages } = ledgerModule;
const { makeToolCall, upsertTool } = toolReducerModule;
const { groupAssistantSteps } = partsModule;
const { buildAgentDelegationLaneModel } = delegationModule;
const { buildAgentExecutionTraceModel } = traceModelModule;
const { buildToolOutputPreview } = outputPreviewModule;
const { buildToolChecklistPreview } = inputPreviewModule;
const { buildToolCompactPreview } = compactPreviewModule;

const chatId = "mock-ui-pipeline-agentic";
let messages = [
  { id: "user-live", sessionId: chatId, role: "user", content: "test codebuff agentic delegation", status: "sent" },
  { id: "assistant-live", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];

function setMessages(updater) {
  messages = typeof updater === "function" ? updater(messages) : updater;
}

function appendAction(payload, kind) {
  setMessages((prev) => appendActionStepToMessages(prev, chatId, { ...payload, chat_id: chatId, timestamp: new Date().toISOString() }, kind));
}

const unlisteners = [
  mockListen("chat:status", (event) => appendAction(event.payload, "chat_status")),
  mockListen("agent:spawn", (event) => appendAction(event.payload, "agent_spawn")),
  mockListen("agent:complete", (event) => appendAction(event.payload, "agent_complete")),
  mockListen("tool:start", (event) => {
    const payload = event.payload;
    const tool = makeToolCall(payload.tool_call_id, payload.tool_name, "running", payload.arguments, "", undefined, Date.now(), {
      agentId: payload.agent_id,
      agentName: payload.agent_name,
      iteration: payload.iteration,
      batchId: payload.batch_id,
    });
    setMessages((prev) => upsertTool(prev, chatId, tool, Date.now()));
  }),
  mockListen("tool:authorization_request", (event) => {
    const payload = event.payload;
    const tool = makeToolCall(payload.tool_call_id, payload.tool_name, "awaiting_approval", payload.arguments, "", undefined, Date.now(), {
      agentId: payload.agent_id,
      agentName: payload.agent_name,
      iteration: payload.iteration,
      batchId: payload.batch_id,
      approvalContext: {
        riskLevel: payload.context?.risk_level,
        description: payload.context?.description,
        argumentsPreview: payload.context?.arguments_preview,
        suggestedPatterns: payload.context?.suggested_patterns,
      },
    });
    setMessages((prev) => upsertTool(prev, chatId, tool, Date.now()));
  }),
  mockListen("tool:complete", (event) => {
    const payload = event.payload;
    const tool = makeToolCall(
      payload.tool_call_id,
      payload.tool_name,
      payload.status === "success" ? "completed" : "error",
      {},
      payload.output,
      payload.duration_ms,
      Date.now(),
      {
        agentId: payload.agent_id,
        agentName: payload.agent_name,
        iteration: payload.iteration,
        batchId: payload.batch_id,
      },
    );
    setMessages((prev) => upsertTool(prev, chatId, tool, Date.now()));
  }),
  mockListen("chat:chunk", (event) => {
    setMessages((prev) => prev.map((message) =>
      message.id === "assistant-live"
        ? { ...message, content: `${message.content || ""}${event.payload.delta || ""}`, steps: [...(message.steps || []), { type: "text", content: event.payload.delta || "" }] }
        : message,
    ));
  }),
  mockListen("chat:done", (event) => {
    setMessages((prev) => prev.map((message) =>
      message.id === "assistant-live"
        ? { ...message, status: "sent", content: event.payload.content || message.content }
        : message,
    ));
  }),
];

const donePromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("mock UI pipeline did not complete")), 10_000);
  mockListen("chat:done", () => {
    clearTimeout(timeout);
    resolve();
  });
});

await executeMockCommand("send_message", { chatId, content: "test codebuff agentic delegation", model: "mock-model", provider: "mock" });
await donePromise;
unlisteners.forEach((unlisten) => unlisten());

const assistant = messages.find((message) => message.id === "assistant-live");
assert(assistant, "live assistant should remain the UI target");
assert.equal(assistant.status, "sent", "assistant should complete after done");
assert.equal(assistant.toolCalls.length, 4, "UI pipeline should attach all tools to the live assistant");
assert(assistant.toolCalls.every((tool) => tool.batchId === "mock-batch-research-001"), "UI pipeline should preserve explicit batch ids");
assert(assistant.toolCalls.every((tool) => tool.agentName === "Researcher"), "UI pipeline should preserve subagent owner labels");

const grouped = groupAssistantSteps(assistant.steps);
const delegationStep = grouped.find((step) => step.type === "action" && step.kind === "agent_complete");
const delegationLane = buildAgentDelegationLaneModel(delegationStep);
const toolGroup = grouped.find((step) => step.type === "tool-group");
const trace = buildAgentExecutionTraceModel(toolGroup.toolCalls);
const approvalTool = toolGroup.toolCalls.find((tool) => tool.status === "completed" && tool.name === "run_command");
const todoTool = toolGroup.toolCalls.find((tool) => tool.name === "write_todos");
const searchTool = toolGroup.toolCalls.find((tool) => tool.name === "web_search");

assert(delegationLane, "agent lifecycle should render as a delegation lane");
assert.equal(delegationLane.agentName, "Researcher", "delegation lane should show child agent");
assert(delegationLane.resultSummary.includes("Execution trace"), "delegation lane should preserve result summary");
assert(toolGroup, "grouped steps should include a tool group");
assert.equal(trace.executionLabel, "Parallel tool execution", "trace should render as parallel execution");
assert.equal(trace.shouldShowBatchLanes, true, "trace should render grouped batch lanes");
assert.equal(trace.batchLanes[0].label, "Batch mock-batch-research-001", "trace should show explicit batch id");
assert(trace.resultSummary.includes("1 result"), "trace should summarize search result previews");
assert.equal(buildToolChecklistPreview(todoTool.input).length, 4, "todo tool should produce checklist preview");
assert.equal(buildToolCompactPreview({ name: approvalTool.name, input: approvalTool.input, outputSummary: buildToolOutputPreview(approvalTool.output).summary, status: approvalTool.status })?.primary, "Build passed", "completed command should produce compact build result preview");
assert.equal(buildToolOutputPreview(searchTool.output).results.length, 1, "search tool should produce structured result preview");

console.log("mock agentic UI pipeline verifier passed");
