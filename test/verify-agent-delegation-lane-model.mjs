import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/agentDelegationLaneModel.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "agentDelegationLaneModel.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildAgentDelegationLaneModel } = await import(moduleUrl);

const running = buildAgentDelegationLaneModel({
  type: "action",
  kind: "agent_spawn",
  status: "running",
  content: "Inspect streaming",
  metadata: {
    iteration: 2,
    spawn: {
      parentAgent: "Coordinator",
      childAgent: "Researcher",
      task: "Inspect frontend streaming and execution trace behavior.",
      status: "spawned",
    },
  },
});

assert(running, "agent spawn should produce a delegation lane");
assert.equal(running.agentName, "Researcher", "lane should preserve child agent name");
assert.equal(running.parentName, "Coordinator", "lane should preserve parent agent name");
assert.equal(running.status, "running", "spawn lane should start running");
assert.equal(running.task, "Inspect frontend streaming and execution trace behavior.", "lane should preserve delegated task");
assert.equal(running.iteration, 2, "lane should preserve iteration");

const completed = buildAgentDelegationLaneModel({
  type: "action",
  kind: "agent_complete",
  status: "completed",
  metadata: {
    resultSummary: "Execution trace now shows parallel tool completion order.",
    spawn: {
      parentAgent: "Coordinator",
      childAgent: "Researcher",
      task: "Inspect frontend streaming and execution trace behavior.",
      status: "completed",
      durationMs: 845,
    },
  },
});

assert(completed, "agent completion should produce a delegation lane");
assert.equal(completed.status, "completed", "completed lifecycle should render completed");
assert.equal(completed.durationMs, 845, "lane should preserve subagent duration");
assert.equal(
  completed.resultSummary,
  "Execution trace now shows parallel tool completion order.",
  "lane should preserve subagent result summary",
);

const failed = buildAgentDelegationLaneModel({
  type: "action",
  kind: "agent_complete",
  status: "completed",
  metadata: {
    spawn: {
      parentAgent: "Coordinator",
      childAgent: "Builder",
      task: "Run build",
      status: "failed",
    },
  },
});
assert.equal(failed.status, "error", "failed spawn metadata should render as an error lane");

const ignored = buildAgentDelegationLaneModel({
  type: "action",
  kind: "chat_status",
  status: "running",
  metadata: { message: "Provider ready" },
});
assert.equal(ignored, undefined, "non-agent actions should not render as delegation lanes");

console.log("agent delegation lane model ok");
