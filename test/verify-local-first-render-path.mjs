import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

function loadTsModule(relativePath, replacements = []) {
  let source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
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

const helperModule = await loadTsModule("../src/atlas/hooks/chat/optimisticChatMessages.ts", [
  [
    'import { createLocalFirstFeedbackStep } from "./localFirstFeedback";',
    `function createLocalFirstFeedbackStep({ provider, model, tools, generativeUI, deepResearch, timestamp = Date.now() }) {
      const enabledTools = Array.isArray(tools) ? tools.filter(Boolean) : [];
      const mode = deepResearch ? "research" : generativeUI ? "gen-ui" : enabledTools.length > 0 ? "tools" : "chat";
      const content = mode === "research"
        ? "Queued research run"
        : mode === "gen-ui"
          ? "Preparing generative UI run"
          : enabledTools.length > 0
            ? \`Preparing \${enabledTools.length} tool\${enabledTools.length === 1 ? "" : "s"}\`
            : "Preparing model response";
      return {
        type: "action",
        kind: "chat_status",
        content,
        status: "running",
        timestamp,
        eventId: "status:local:local_queued",
        metadata: { phase: "local_queued", message: content, provider, model, tools: enabledTools, toolCount: enabledTools.length, parallel: enabledTools.length > 1 },
      };
    }`,
  ],
]);
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

const { createOptimisticChatMessages } = helperModule;
const { appendActionStepToMessages } = ledgerModule;

const chatId = "local-first-agentic-ui";
const now = 1_000;
const { userMessage, assistantMessage } = createOptimisticChatMessages({
  sessionId: chatId,
  content: "implement the feature",
  model: "fast-model",
  provider: "kilocode",
  tools: ["web_search", "read_file"],
  now,
});

assert.equal(userMessage.role, "user", "optimistic path should append the user message immediately");
assert.equal(assistantMessage.role, "assistant", "optimistic path should append an assistant message immediately");
assert.equal(assistantMessage.status, "sending", "assistant should be visible while backend IPC is still pending");
assert.equal(assistantMessage.steps.length, 1, "assistant should start with exactly one visible local status step");
assert.equal(assistantMessage.steps[0].content, "Preparing 2 tools", "visible local status should describe planned tool work");
assert.equal(assistantMessage.steps[0].metadata.parallel, true, "local status should expose parallel tool intent");

let messages = [userMessage, assistantMessage];
messages = appendActionStepToMessages(
  messages,
  chatId,
  {
    chat_id: chatId,
    phase: "provider_ready",
    provider: "kilocode",
    model: "fast-model",
    message: "Provider ready",
    timestamp: new Date(now + 10).toISOString(),
  },
  "chat_status",
);

const updatedAssistant = messages.find((message) => message.role === "assistant");
assert(updatedAssistant, "backend status should keep updating the visible assistant row");
assert.equal(updatedAssistant.steps.filter((step) => step.kind === "chat_status" && step.metadata?.phase === "local_queued").length, 1, "local feedback should not duplicate");
assert(updatedAssistant.steps.some((step) => step.kind === "chat_status" && step.metadata?.phase === "provider_ready"), "backend status should be visible after local feedback");

console.log("local first render path ok");
