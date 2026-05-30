import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/agentExecutionLedger.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "agentExecutionLedger.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildExecutionLedger } = await import(moduleUrl);

const ledger = buildExecutionLedger({
  steps: [
    {
      type: "action",
      kind: "agent_spawn",
      status: "running",
      content: "Inspect source",
      timestamp: 1000,
      metadata: {
        spawn: {
          parentAgent: "main",
          childAgent: "Researcher",
          task: "Inspect source and summarize tool plan.",
          status: "spawned",
        },
      },
    },
    {
      type: "action",
      kind: "agent_handoff",
      status: "running",
      timestamp: 1100,
      metadata: {
        handoff: {
          fromAgent: "Researcher",
          toAgent: "Verifier",
          reason: "Validate build and UI pipeline.",
        },
      },
    },
    {
      type: "action",
      kind: "agent_complete",
      status: "completed",
      timestamp: 2000,
      metadata: {
        resultSummary: "Source inspection found the hot path.",
        spawn: {
          parentAgent: "main",
          childAgent: "Researcher",
          task: "Inspect source and summarize tool plan.",
          status: "completed",
          durationMs: 1000,
        },
      },
    },
  ],
  toolCalls: [
    {
      id: "tool-search",
      name: "web_search",
      status: "completed",
      input: { query: "agentic UI" },
      output: '{"results":[{"title":"Trace UX"}]}',
      agentName: "Researcher",
      parentAgentId: "main",
      toolBatchId: "batch-research",
      startTime: 1200,
      completedAt: 1300,
    },
    {
      id: "tool-read",
      name: "read_file",
      status: "running",
      input: { path: "src/App.tsx" },
      output: "",
      agentName: "Researcher",
      parentAgentId: "main",
      toolBatchId: "batch-research",
      startTime: 6200,
    },
    {
      id: "tool-build",
      name: "run_command",
      status: "error",
      input: { command: "npm run build" },
      output: '{"stderr":"failed","exitCode":1}',
      agentName: "Verifier",
      startTime: 2400,
      completedAt: 2600,
    },
  ],
});

const researcher = ledger.agents.find((agent) => agent.name === "Researcher");
const verifier = ledger.agents.find((agent) => agent.name === "Verifier");
const explicitBatch = ledger.batches.find((batch) => batch.id === "batch:batch-research");

assert(researcher, "ledger should include spawned subagent");
assert.equal(researcher.parentId, "main", "subagent should retain parent");
assert.equal(researcher.status, "completed", "completion event should update subagent status");
assert.equal(researcher.resultSummary, "Source inspection found the hot path.", "subagent result should be preserved");
assert.deepEqual(researcher.toolIds, ["tool-search", "tool-read"], "subagent tools should be grouped under the agent");
assert(verifier, "ledger should create agents from tool ownership and handoff targets");
assert.deepEqual(ledger.handoffs.map((handoff) => `${handoff.fromAgent}->${handoff.toAgent}`), ["Researcher->Verifier"], "handoffs should be explicit ledger edges");
assert(explicitBatch, "ledger should preserve explicit batch id");
assert.equal(explicitBatch.explicit, true, "explicit batch should be marked");
assert.deepEqual(explicitBatch.toolIds, ["tool-search", "tool-read"], "explicit tool batch id should group tools without relying on timestamps");
assert.deepEqual(explicitBatch.agentIds, ["Researcher"], "batch should track owning agents");
assert.equal(ledger.running, 1, "running count should include active tools");
assert.equal(ledger.completed, 2, "completed count should include finished tools and completed subagents");
assert.equal(ledger.errors, 1, "error count should include failed tools");
assert.equal(ledger.active, true, "ledger should remain active while a tool is running");

console.log("agent execution ledger ok");
