import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const replaySource = readFileSync(
  new URL("../src/atlas/hooks/chat/chatTimelineReplay.ts", import.meta.url),
  "utf8",
);
const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/ToolDetailView.tsx", import.meta.url),
  "utf8",
);
const registrySource = readFileSync(
  new URL("../src/atlas/components/chat/tool/renderers/registry.tsx", import.meta.url),
  "utf8",
);

assert(replaySource.includes("const mergedToolIndexes"), "reload replay must merge pending and assistant tool indexes");
assert(replaySource.includes("toolCalls: mergedToolCalls"), "replay must emit one canonical tool-call collection");
assert(replaySource.includes("outputPreview: incoming.outputPreview || previous.outputPreview"), "replay must preserve canonical bounded previews");
assert(replaySource.includes("const mergedMessageSteps"), "replay must hydrate duplicate assistant steps from the merged tool record");
assert(cardSource.includes("const previewSource = output || toolCall.outputPreview || \"\""), "tool cards must use the canonical preview when full output is absent");
assert(detailSource.includes("toolCall.output || toolCall.outputPreview"), "expanded tool details must use the canonical preview fallback");
assert(detailSource.includes("getToolRenderer(toolCall.name, input)"), "specialized renderers must resolve with parsed tool arguments");
assert(registrySource.includes("canonicalToolName"), "renderer lookup must normalize tool identities");
assert(registrySource.includes("tool_exec") && registrySource.includes("tool_id"), "tool_exec envelopes must resolve their inner tool renderer");

const { coalesceTimelineMessages } = await loadSourceModule("../src/atlas/hooks/chat/chatTimelineReplay.ts");
const messages = coalesceTimelineMessages([
  {
    id: "action-call",
    sessionId: "chat-1",
    role: "tool",
    kind: "tool_call",
    content: "",
    createdAt: 1,
    metadata: {
      toolCall: {
        toolCallId: "tool-1",
        toolName: "run_command",
        args: { command: "npm test" },
        status: "running",
      },
    },
  },
  {
    id: "action-result",
    sessionId: "chat-1",
    role: "tool",
    kind: "tool_result",
    content: "",
    createdAt: 2,
    metadata: {
      toolResult: {
        toolCallId: "tool-1",
        toolName: "run_command",
        status: "ok",
        durationMs: 42,
        contentSummary: "Command passed",
        rawResult: { stdout: "all good" },
      },
    },
  },
  {
    id: "assistant-1",
    sessionId: "chat-1",
    role: "assistant",
    content: "Done.",
    status: "sent",
    createdAt: 3,
    toolCalls: [
      {
        id: "tool-1",
        name: "run_command",
        status: "running",
        input: {},
        output: "",
        outputPreview: "Command passed",
      },
    ],
    steps: [
      {
        type: "tool-call",
        toolCall: {
          id: "tool-1",
          name: "run_command",
          status: "running",
          input: {},
          output: "",
        },
      },
      { type: "text", content: "Done." },
    ],
  },
]);

assert.equal(messages.length, 1, "tool action rows should coalesce into their assistant message");
const assistant = messages[0];
assert.equal(assistant.toolCalls?.length, 1, "replay must not duplicate a tool carried by action and assistant rows");
assert.equal(assistant.toolCalls?.[0].status, "completed", "late running assistant state must not overwrite a completed action result");
assert.equal(assistant.toolCalls?.[0].outputPreview, "Command passed", "replay must retain the bounded preview");
assert.equal(assistant.steps?.filter((step) => step.type === "tool-call").length, 1, "replay must render one execution step for the canonical tool");
assert.equal(assistant.steps?.find((step) => step.type === "tool-call")?.toolCall?.status, "completed", "duplicate assistant steps must receive the merged terminal state");

await closeSourceModuleLoader();
console.log("inline ledger quality verifier passed");
