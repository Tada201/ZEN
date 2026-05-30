import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/chat/localFirstFeedback.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "localFirstFeedback.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { createLocalFirstFeedbackStep } = await import(moduleUrl);

const plain = createLocalFirstFeedbackStep({
  provider: "kilocode",
  model: "moonshotai/kimi-k2.6:free",
  timestamp: 1234,
});
assert.equal(plain.type, "action", "local feedback should render as an action row");
assert.equal(plain.kind, "chat_status", "local feedback should use the existing status presentation path");
assert.equal(plain.status, "running", "local feedback should show active work immediately");
assert.equal(plain.eventId, "status:local:local_queued", "local feedback should have a stable status event id");
assert.equal(plain.content, "Preparing model response", "plain chat should show immediate model preparation");
assert.equal(plain.metadata.phase, "local_queued", "local feedback should be distinguishable from backend status");
assert.equal(plain.metadata.provider, "kilocode", "local feedback should preserve provider context");
assert.equal(plain.metadata.model, "moonshotai/kimi-k2.6:free", "local feedback should preserve model context");
assert.equal(plain.metadata.parallel, false, "plain chat should not claim parallel work");

const toolRun = createLocalFirstFeedbackStep({
  provider: "openrouter",
  model: "coding-model",
  tools: ["read_file", "run_command", ""],
  timestamp: 2000,
});
assert.equal(toolRun.content, "Preparing 2 tools", "tool runs should show immediate tool preparation");
assert.deepEqual(toolRun.metadata.tools, ["read_file", "run_command"], "tool list should be compact and visible");
assert.equal(toolRun.metadata.toolCount, 2, "tool count should be preserved");
assert.equal(toolRun.metadata.parallel, true, "multiple tools should hint parallel execution");

const genUi = createLocalFirstFeedbackStep({ generativeUI: true, timestamp: 3000 });
assert.equal(genUi.content, "Preparing generative UI run", "Gen UI should show a specific first status");

const research = createLocalFirstFeedbackStep({ deepResearch: true, generativeUI: true, timestamp: 4000 });
assert.equal(research.content, "Queued research run", "deep research should take precedence in the first status");

console.log("local first feedback ok");
