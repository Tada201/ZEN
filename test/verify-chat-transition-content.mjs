import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chunkSource = read("src/atlas/hooks/stream/chatChunkBuffer.ts");
const transitionSource = read("src/atlas/components/chat/WorkspaceViewTransition.tsx");
const messageListSource = read("src/atlas/components/chat/MessageList.tsx");
const workspaceSource = read("src/atlas/sections/WorkspaceSection.tsx");
const streamSource = read("src/atlas/hooks/stream/useChatChunkEvent.ts");

assert(chunkSource.includes("reconcileFinalTextSteps"), "final stream content must reconcile into the execution timeline");
assert(chunkSource.includes("canonical chat:done content"), "the final response must be treated as the canonical content boundary");
// The scene is keyed on `sceneKey` (derived from view state) rather than the
// literal `view` prop name; both still cause AnimatePresence to crossfade.
assert(transitionSource.includes("key={sceneKey}") && transitionSource.includes('mode="sync"'), "welcome and chat scenes must remain keyed and crossfade together");
assert(messageListSource.includes("key={message.id}"), "message rows must keep stable backend/optimistic IDs across the transition");
assert(workspaceSource.includes("targetSessionId"), "the welcome submit must route its optimistic messages to the newly created session");
assert(!workspaceSource.includes('layoutId="workspace-composer-shell"'), "welcome-to-chat composer must not use cross-scene shared layout projection");
assert(streamSource.includes("message_id") && streamSource.includes("messageId"), "stream chunks must retain the backend assistant identity");

// Load the pure reconciliation helper without initializing the store/event imports.
const stripped = chunkSource
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^import type .*;\r?\n/gm, "");
const transpiled = ts.transpileModule(
  `const stripToolProtocolText = (value) => value;\n${stripped}`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: "chatChunkBuffer.ts",
  },
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { replaceTextStepsWithContent } = await import(moduleUrl);

const reconciled = replaceTextStepsWithContent(
  {
    id: "temp-assistant-1",
    role: "assistant",
    content: "partial answer",
    status: "sending",
    steps: [
      { type: "action", kind: "chat_status", content: "Preparing model response" },
      { type: "text", content: "partial answer" },
      { type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "completed", input: {}, output: "" } },
    ],
  },
  "partial answer with the canonical final tail",
);

const textSteps = reconciled.steps.filter((step) => step.type === "text");
assert.equal(
  textSteps.map((step) => step.content).join(""),
  "partial answer with the canonical final tail",
  "the complete chat:done response must remain renderable after a transition",
);
assert.deepEqual(
  reconciled.steps.map((step) => step.type),
  ["action", "text", "tool-call", "text"],
  "a missing final tail must be appended after the existing execution timeline",
);

console.log("chat transition content verified");
