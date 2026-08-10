import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

function loadTsModule(relativePath, replacements = []) {
  const sourcePath = new URL(relativePath, import.meta.url);
  // The CI runner is Windows and may check out CRLF files. Normalize before
  // exact import replacement so data: URL modules never retain relative imports.
  let source = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n");
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

const activeRoutingModule = await loadTsModule("../src/atlas/hooks/stream/activeStreamRouting.ts");
const agentRoutingModule = await loadTsModule("../src/atlas/hooks/stream/agentLifecycleRouting.ts", [
  [
    'import { getActiveStreamingChatId, type ActiveStreamState } from "./activeStreamRouting";',
    `function getActiveStreamingChatId(state) {
      const streamingChats = state.streamingChats || {};
      const activeSessionId = state.activeSessionId;
      if (activeSessionId && streamingChats[activeSessionId]) return activeSessionId;
      const streamingIds = Object.entries(streamingChats).filter(([, isStreaming]) => isStreaming).map(([chatId]) => chatId);
      return streamingIds.length === 1 ? streamingIds[0] : undefined;
    }`,
  ],
]);
const toolRoutingModule = await loadTsModule("../src/atlas/hooks/stream/toolLifecycleRouting.ts");
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
const toolReducerModule = await loadTsModule("../src/atlas/hooks/stream/toolEventReducer.ts", [
  [
    'import { useChatStore } from "@/lib/stores/useChatStore";',
    `const useChatStore = {
      getState() {
        return { getActiveAssistantForChat() { return undefined; } };
      },
    };`,
  ],
]);
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
    'import {\n  parseCardTags,\n  type OrderedCard,\n  type ParsedCard,\n} from "./assistantCardParser";',
    `function parseCardTags(text) {
      return { cards: [], cleanText: text || "" };
    }`,
  ],
  [
    'export {\n  parseCardTags,\n  CARD_TOKEN_PREFIX,\n  CARD_TOKEN_REGEX,\n  CARD_TOKEN_SUFFIX,\n  splitOnCardTokens,\n  type OrderedCard,\n  type ParsedCard,\n} from "./assistantCardParser";',
    'export { parseCardTags };',
  ],
]);
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

const { getDirectOrActiveStreamingChatId } = activeRoutingModule;
const { getAgentChatId, rememberAgentChat } = agentRoutingModule;
const { getToolChatId, rememberToolChat } = toolRoutingModule;
const { appendActionStepToMessages } = ledgerModule;
const { makeToolCall, upsertTool } = toolReducerModule;
const { groupAssistantSteps } = partsModule;
const { buildAgentExecutionTraceModel } = traceModelModule;

const chatId = "chat-live-sparse";
const activeState = { activeSessionId: chatId, streamingChats: { [chatId]: true } };
const agentCache = new Map();
const toolCache = new Map();
let now = 10_000;
let messages = [
  { id: "user-live", sessionId: chatId, role: "user", content: "Fix the streaming trace", status: "sent" },
  { id: "assistant-live", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];

function timestamp() {
  now += 100;
  return new Date(now).toISOString();
}

function appendAction(payload, kind) {
  messages = appendActionStepToMessages(messages, chatId, { ...payload, timestamp: timestamp(), chat_id: chatId }, kind);
}

const statusChatId = getDirectOrActiveStreamingChatId(activeState, {});
assert.equal(statusChatId, chatId, "sparse status should resolve to the active stream");
appendAction({ phase: "agent_step", message: "Coordinator planning execution", iteration: 1 }, "chat_status");

const sparseSpawn = {
  spawn_id: "spawn-research-1",
  parent_agent: "Coordinator",
  child_agent_id: "researcher-1",
  child_agent_name: "Researcher",
  task: "Inspect event routing and preview fidelity",
};
const spawnChatId = getAgentChatId(agentCache, sparseSpawn, activeState);
assert.equal(spawnChatId, chatId, "sparse spawn should route to active stream");
rememberAgentChat(agentCache, sparseSpawn, spawnChatId);
appendAction(sparseSpawn, "agent_spawn");

for (const toolStart of [
  {
    tool_call_id: "tool-read-routing",
    tool_name: "read_file",
    arguments: { path: "src/atlas/hooks/stream/useAgentEvents.ts" },
    agent_id: "researcher-1",
    agent_name: "Researcher",
    iteration: 1,
    startedAt: 20_000,
  },
  {
    tool_call_id: "tool-search-ux",
    tool_name: "web_search",
    arguments: { query: "agentic coding CLI live trace UX" },
    agent_id: "researcher-1",
    agent_name: "Researcher",
    iteration: 1,
    startedAt: 20_050,
  },
]) {
  const routedChatId = getToolChatId(toolCache, toolStart, activeState);
  assert.equal(routedChatId, chatId, "sparse tool start should route to active stream");
  rememberToolChat(toolCache, toolStart, routedChatId);
  messages = upsertTool(
    messages,
    routedChatId,
    makeToolCall(
      toolStart.tool_call_id,
      toolStart.tool_name,
      "running",
      toolStart.arguments,
      "",
      undefined,
      toolStart.startedAt,
      {
        agentId: toolStart.agent_id,
        agentName: toolStart.agent_name,
        iteration: toolStart.iteration,
      },
    ),
    toolStart.startedAt,
  );
}

for (const toolComplete of [
  {
    tool_call_id: "tool-search-ux",
    tool_name: "web_search",
    status: "success",
    output: JSON.stringify({
      results: [{ title: "Fast agent traces", summary: "Show delegated and parallel work as it happens." }],
    }),
    duration_ms: 140,
    completedAt: 20_250,
  },
  {
    tool_call_id: "tool-read-routing",
    tool_name: "read_file",
    status: "success",
    output: JSON.stringify({ content: "useAgentEvents routes status, agent, task, workflow, and tool lifecycle events." }),
    duration_ms: 420,
    completedAt: 20_500,
  },
]) {
  const routedChatId = getToolChatId(toolCache, toolComplete, activeState);
  assert.equal(routedChatId, chatId, "sparse tool completion should route by cache or active stream");
  messages = upsertTool(
    messages,
    routedChatId,
    makeToolCall(
      toolComplete.tool_call_id,
      toolComplete.tool_name,
      "completed",
      {},
      toolComplete.output,
      toolComplete.duration_ms,
      toolComplete.completedAt,
      {
        agentId: "researcher-1",
        agentName: "Researcher",
        iteration: 1,
      },
    ),
    toolComplete.completedAt,
  );
}

const sparseComplete = {
  spawn_id: "spawn-research-1",
  agent_id: "researcher-1",
  child_agent_name: "Researcher",
  parent_agent: "Coordinator",
  task: "Inspect event routing and preview fidelity",
  status: "completed",
  result: { summary: "Sparse event stream remained attached to the assistant ledger." },
  duration_ms: 900,
};
const completeChatId = getAgentChatId(agentCache, sparseComplete, activeState);
assert.equal(completeChatId, chatId, "sparse agent completion should route by lifecycle cache");
rememberAgentChat(agentCache, sparseComplete, completeChatId);
appendAction(sparseComplete, "agent_complete");

messages = messages.map((message) =>
  message.id === "assistant-live"
    ? {
        ...message,
        content: "Sparse agentic stream completed with visible delegation and parallel tool results.",
        status: "sent",
        steps: [
          ...(message.steps || []),
          { type: "text", content: "Sparse agentic stream completed with visible delegation and parallel tool results." },
        ],
      }
    : message,
);

assert.equal(messages.length, 2, "sparse stream should not create fallback system rows when an assistant is active");
const assistant = messages.find((message) => message.id === "assistant-live");
assert(assistant, "assistant message should remain present");
assert.equal(assistant.toolCalls.length, 2, "parallel sparse tools should attach to the assistant");

const grouped = groupAssistantSteps(assistant.steps);
const toolGroup = grouped.find((step) => step.type === "tool-group");
const lifecycle = grouped.find((step) => step.type === "action" && step.kind === "agent_complete");
const trace = buildAgentExecutionTraceModel(toolGroup.toolCalls);

assert(toolGroup, "sparse parallel tools should render as a tool group");
assert.equal(toolGroup.toolCalls.length, 2, "tool group should contain both sparse parallel tools");
assert(toolGroup.toolCalls.every((tool) => tool.status === "completed"), "sparse tools should finish completed");
assert(toolGroup.toolCalls.every((tool) => tool.agentName === "Researcher"), "tool cards should retain subagent ownership");
assert.equal(trace.executionLabel, "Parallel tool execution", "near-simultaneous sparse starts should render as parallel");
assert.equal(trace.completionSummary, "web_search -> read_file", "completion order should reflect as-finished sparse results");
assert(lifecycle, "agent lifecycle row should survive sparse spawn/complete events");
assert.equal(lifecycle.status, "completed", "agent lifecycle row should finish completed");
assert(lifecycle.metadata.resultSummary.includes("Sparse event stream"), "agent result summary should remain visible");

console.log("sparse agentic stream composition ok");
