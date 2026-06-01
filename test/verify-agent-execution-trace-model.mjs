import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/agentExecutionTraceModel.ts", import.meta.url);
let source = readFileSync(sourcePath, "utf8").replace(
  'import { buildExecutionLedger, type ExecutionLedger } from "./agentExecutionLedger";',
  `function buildExecutionLedger({ steps = [], toolCalls = [] }) {
    const agents = new Map([["main", { id: "main", name: "main", status: "running", toolIds: [], childAgentIds: [] }]]);
    const batches = new Map();
    const addLifecycle = (step) => {
      const spawn = step.metadata && step.metadata.spawn;
      if (!spawn) return;
      const id = step.metadata.agentId || spawn.childAgent;
      const agent = agents.get(id) || { id, name: spawn.childAgent || id, parentId: spawn.parentAgent || "main", status: "running", toolIds: [], childAgentIds: [] };
      agent.status = step.status === "completed" ? "completed" : step.status === "error" ? "error" : "running";
      agent.task = spawn.task || step.content;
      agent.resultSummary = step.metadata.resultSummary || agent.resultSummary;
      agents.set(id, agent);
      const parent = agents.get(agent.parentId) || { id: agent.parentId, name: agent.parentId, status: "running", toolIds: [], childAgentIds: [] };
      if (!parent.childAgentIds.includes(id)) parent.childAgentIds.push(id);
      agents.set(parent.id, parent);
    };
    const addAgent = (id, name, toolId) => {
      const agent = agents.get(id) || { id, name, status: "running", toolIds: [], childAgentIds: [] };
      agent.name = name || agent.name;
      if (toolId && !agent.toolIds.includes(toolId)) agent.toolIds.push(toolId);
      agents.set(id, agent);
    };
    steps.forEach(addLifecycle);
    toolCalls.slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0)).forEach((tool, index) => {
      const agentId = tool.agentId || tool.agentName || "main";
      addAgent(agentId, tool.agentName || tool.agentId || "main", tool.id);
      const last = Array.from(batches.values()).at(-1);
      const key = tool.batchId ? "batch:" + tool.batchId : last && tool.startTime && last.startedAt && Math.abs(tool.startTime - last.startedAt) < 750 ? last.id : "single:" + tool.id;
      const batch = batches.get(key) || { id: key, label: tool.batchId ? "Batch " + tool.batchId : key.startsWith("single:") ? "Tool " + (index + 1) : "Parallel batch " + (batches.size + 1), explicit: Boolean(tool.batchId), agentIds: [], toolIds: [], startedAt: tool.startTime };
      if (!batch.agentIds.includes(agentId)) batch.agentIds.push(agentId);
      if (!batch.toolIds.includes(tool.id)) batch.toolIds.push(tool.id);
      if (!batch.explicit && batch.toolIds.length > 1) batch.label = "Parallel batch 1";
      batches.set(key, batch);
    });
    return { agents: Array.from(agents.values()), batches: Array.from(batches.values()), tools: toolCalls, handoffs: [], rootAgentId: "main", running: 0, completed: 0, errors: 0, cancelled: 0, active: toolCalls.some((tool) => tool.status === "running" || tool.status === "awaiting_approval") };
  }`,
).replace(
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
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "agentExecutionTraceModel.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildAgentExecutionTraceModel } = await import(moduleUrl);

const parallelTrace = buildAgentExecutionTraceModel([
  {
    id: "tool-a",
    name: "read_file",
    status: "completed",
    input: { path: "src/App.tsx" },
    output: "{}",
    agentName: "Researcher",
    startTime: 1000,
    completedAt: 1300,
  },
  {
    id: "tool-b",
    name: "web_search",
    status: "running",
    input: { query: "codebuff" },
    output: "",
    agentName: "Researcher",
    startTime: 1050,
  },
  {
    id: "tool-c",
    name: "run_command",
    status: "completed",
    input: { command: "npm test" },
    output: JSON.stringify({ stdout: "passed", exitCode: 0 }),
    agentName: "Verifier",
    startTime: 1100,
    completedAt: 1200,
  },
]);

assert.equal(parallelTrace.executionLabel, "Parallel tool execution", "near-simultaneous starts should label as parallel");
assert.equal(parallelTrace.runningCount, 1, "running count should include active tools");
assert.equal(parallelTrace.approvalCount, 0, "approval count should not include running tools");
assert.equal(parallelTrace.completedCount, 2, "completed count should include finished tools");
assert.equal(parallelTrace.progressPercent, 67, "progress should reflect finished tools");
assert.equal(parallelTrace.ownerSummary, "Researcher x2, Verifier", "owner summary should show subagent lanes and counts");
assert.deepEqual(parallelTrace.runningToolNames, ["web_search"], "active tool names should be scan-friendly");
assert.deepEqual(parallelTrace.runningToolSummaries, ["web_search: codebuff"], "active tool summaries should include exact query/command/path previews");
assert.equal(parallelTrace.latestFinishedTool.name, "read_file", "latest finished tool should use completion timestamp, not array order");
assert.equal(parallelTrace.completionSummary, "run_command -> read_file", "completion summary should expose as-finished order");
assert.equal(parallelTrace.resultSummary, "passed", "batch result summary should preserve explicit command success previews");
assert.equal(parallelTrace.shouldShowBatchLanes, true, "parallel traces should render explicit batch lanes");
assert.equal(parallelTrace.batchLanes.length, 1, "timing-inferred parallel tools should share one lane");
assert.equal(parallelTrace.batchLanes[0].label, "Parallel batch 1", "timing-inferred lane should have a readable label");
assert.equal(parallelTrace.batchLanes[0].runningCount, 1, "lane should preserve running tool count");
assert.equal(parallelTrace.batchLanes[0].ownerSummary, "Researcher x2, Verifier", "lane should summarize owners");
assert.deepEqual(parallelTrace.batchLanes[0].runningToolNames, ["web_search"], "lane should expose active tool names");
assert.deepEqual(parallelTrace.batchLanes[0].runningToolSummaries, ["web_search: codebuff"], "lane should expose active tool summaries with exact input previews");
assert.equal(parallelTrace.activeLaneSummary, "Parallel batch 1: running web_search: codebuff", "trace should expose the active batch lane and exact running tool target for collapsed status");
assert.deepEqual(
  parallelTrace.completionOrder.map((tool) => tool.name),
  ["run_command", "read_file"],
  "completion order should preserve as-finished parallel result order",
);

const sequentialTrace = buildAgentExecutionTraceModel([
  { id: "tool-1", name: "tool_list", status: "completed", input: {}, output: "[]", startTime: 1000, completedAt: 1010 },
  { id: "tool-2", name: "tool_info", status: "completed", input: {}, output: "{}", startTime: 3000, completedAt: 3050 },
]);

assert.equal(sequentialTrace.executionLabel, "Tool execution", "separated starts should not claim parallel execution");
assert.equal(sequentialTrace.ownerSummary, "main x2", "main-agent batches should still summarize ownership");
assert.equal(sequentialTrace.progressPercent, 100, "completed sequential trace should show full progress");
assert.equal(sequentialTrace.completionSummary, "tool_list -> tool_info", "completed sequential traces should still expose completion order");
assert.equal(sequentialTrace.shouldShowBatchLanes, false, "sequential tools should stay as a simple list");

const explicitBatchTrace = buildAgentExecutionTraceModel([
  {
    id: "tool-batch-a",
    name: "read_file",
    status: "completed",
    input: { path: "a" },
    output: "{}",
    startTime: 1000,
    completedAt: 1100,
    batchId: "batch-source-scan",
  },
  {
    id: "tool-batch-b",
    name: "read_file",
    status: "completed",
    input: { path: "b" },
    output: "{}",
    startTime: 5000,
    completedAt: 5100,
    batchId: "batch-source-scan",
  },
]);
assert.equal(explicitBatchTrace.executionLabel, "Parallel tool execution", "same batch id should label as parallel even with distant timestamps");
assert.equal(explicitBatchTrace.startedTogether, true, "explicit batch id should override timing inference");
assert.equal(explicitBatchTrace.explicitBatch, true, "trace should expose explicit batch identity");
assert.equal(explicitBatchTrace.batchSummary, "batch-source-scan x2", "trace should summarize explicit batch id and size");
assert.equal(explicitBatchTrace.shouldShowBatchLanes, true, "explicit batches should render as batch lanes");
assert.equal(explicitBatchTrace.batchLanes[0].label, "Batch batch-source-scan", "explicit batch lane should show batch id");
assert.equal(explicitBatchTrace.batchLanes[0].toolCount, 2, "explicit batch lane should include both tools");

const approvalTrace = buildAgentExecutionTraceModel([
  {
    id: "approval-tool",
    name: "run_command",
    status: "awaiting_approval",
    input: { command: "npm run build" },
    output: "",
    startTime: 1000,
    batchId: "approval-batch",
  },
]);
assert.equal(approvalTrace.active, true, "approval-needed tools should keep the execution trace active");
assert.equal(approvalTrace.runningCount, 0, "approval-needed tools should not be counted as actively running");
assert.equal(approvalTrace.approvalCount, 1, "approval-needed tools should get their own count");
assert.equal(approvalTrace.batchLanes[0].approvalCount, 1, "batch lanes should expose approval-needed tools separately");
assert.deepEqual(approvalTrace.runningToolNames, [], "approval-needed tools should not appear as running tool names");
assert.deepEqual(approvalTrace.approvalToolNames, ["run_command"], "approval-needed tool names should be exposed separately");
assert.deepEqual(approvalTrace.approvalToolSummaries, ["run_command: npm run build"], "approval-needed summaries should include exact command previews");
assert.deepEqual(approvalTrace.batchLanes[0].approvalToolNames, ["run_command"], "batch lanes should expose approval-needed tool names separately");
assert.deepEqual(approvalTrace.batchLanes[0].approvalToolSummaries, ["run_command: npm run build"], "batch lanes should expose approval-needed exact command previews");
assert.equal(approvalTrace.activeLaneSummary, "Batch approval-batch: waiting approval run_command: npm run build", "active lane summary should label approval-needed tools clearly with exact target");

const lifecycleTrace = buildAgentExecutionTraceModel(
  [
    {
      id: "research-tool",
      name: "web_search",
      status: "completed",
      input: { query: "streaming UI" },
      output: JSON.stringify({ results: [{ title: "Streaming trace" }] }),
      agentName: "Researcher",
      startTime: 1000,
      completedAt: 1200,
    },
  ],
  [
    {
      type: "action",
      kind: "agent_spawn",
      status: "running",
      content: "Inspect streaming flow",
      metadata: {
        spawn: {
          parentAgent: "main",
          childAgent: "Researcher",
          task: "Inspect streaming flow",
          status: "spawned",
        },
      },
    },
    {
      type: "action",
      kind: "agent_complete",
      status: "completed",
      metadata: {
        resultSummary: "Streaming trace inspected.",
        spawn: {
          parentAgent: "main",
          childAgent: "Researcher",
          task: "Inspect streaming flow",
          status: "completed",
          durationMs: 900,
        },
      },
    },
  ],
);
assert(lifecycleTrace.agentSummary.includes("Researcher"), "trace should summarize real lifecycle agents when steps are provided");
assert.equal(lifecycleTrace.agentHierarchySummary, "main -> Researcher", "trace should summarize parent-to-child agent hierarchy");
assert.equal(lifecycleTrace.ledger.agents.find((agent) => agent.name === "Researcher").resultSummary, "Streaming trace inspected.", "trace ledger should retain subagent result summaries");

const resultPreviewTrace = buildAgentExecutionTraceModel([
  {
    id: "edit-1",
    name: "edit_file",
    status: "completed",
    input: {},
    output: JSON.stringify({
      files: [
        { path: "src/App.tsx", changeType: "modified" },
        { path: "src/main.tsx", changeType: "modified" },
      ],
    }),
    completedAt: 1000,
  },
  {
    id: "artifact-1",
    name: "create_artifact",
    status: "completed",
    input: {},
    output: JSON.stringify({
      artifact: { type: "html", title: "Preview", content: "<div>ok</div>" },
    }),
    completedAt: 1100,
  },
  {
    id: "search-1",
    name: "web_search",
    status: "completed",
    input: {},
    output: JSON.stringify({
      results: [
        { title: "A", summary: "one" },
        { title: "B", summary: "two" },
      ],
    }),
    completedAt: 1200,
  },
  {
    id: "test-1",
    name: "run_command",
    status: "error",
    input: {},
    output: JSON.stringify({ stderr: "failed", exitCode: 1 }),
    completedAt: 1300,
  },
]);
assert.equal(
  resultPreviewTrace.resultSummary,
  "2 files / 1 artifact / 2 results / failed",
  "batch result summary should aggregate files, artifacts, search results, and concrete command outcomes",
);

console.log("agent execution trace model ok");
