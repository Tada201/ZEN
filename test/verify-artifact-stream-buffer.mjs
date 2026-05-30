import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/artifactStreamBuffer.ts", import.meta.url);
let source = readFileSync(sourcePath, "utf8").replace(
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
  fileName: "artifactStreamBuffer.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { applyArtifactDeltaToMessages, applyArtifactStartToMessages } = await import(moduleUrl);

const chatId = "chat-artifact";
const initial = [
  { id: "user-1", sessionId: chatId, role: "user", content: "build ui", status: "sent" },
  { id: "assistant-1", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [] },
];

const started = applyArtifactStartToMessages(initial, {
  type: "openui",
  title: "Telemetry panel",
  language: "tsx",
  content: "",
});
assert.equal(started[1].artifact.title, "Telemetry panel", "artifact start should attach to the live assistant");
assert.equal(started[1].artifact.content, "", "artifact start should initialize empty content");

const afterFirst = applyArtifactDeltaToMessages(started, "root = Card(");
const afterSecond = applyArtifactDeltaToMessages(afterFirst, "children=[])");
assert.equal(afterSecond[1].artifact.content, "root = Card(children=[])", "artifact deltas should append in order");
assert.equal(started[1].artifact.content, "", "artifact delta helper should not mutate previous message objects");

const noArtifact = applyArtifactDeltaToMessages(initial, "ignored");
assert.equal(noArtifact, initial, "artifact deltas without an artifact should no-op");

console.log("artifact stream buffer ok");
