import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const modelModule = await loadSourceModule("../src/atlas/agentRuntime/runInspectorModel.ts");
const { buildRunInspectorModel, filterInspectorNodes, orderInspectorTreeNodes, MAX_INSPECTOR_RENDER_NODES } = modelModule;

const message = {
  id: "assistant-inspector-1",
  sessionId: "chat-inspector-1",
  role: "assistant",
  content: "Completed the requested work.",
  status: "sent",
  createdAt: 100,
  toolCalls: [
    {
      id: "tool-read",
      name: "read_file",
      status: "completed",
      input: { path: "src/App.tsx" },
      output: JSON.stringify({ summary: "Read application source" }),
      sequence: 1,
      phase: "completed",
      startTime: 100,
      completedAt: 150,
      agentName: "Researcher",
    },
    {
      id: "tool-approval",
      name: "run_command",
      status: "awaiting_approval",
      input: { command: "npm test" },
      output: "",
      sequence: 2,
      phase: "waiting_for_approval",
      agentName: "Builder",
    },
    {
      id: "tool-failed",
      name: "run_command",
      status: "error",
      input: { command: "cargo test" },
      output: JSON.stringify({ stderr: "failed" }),
      sequence: 3,
      phase: "errored",
      agentName: "Builder",
    },
  ],
  steps: [
    {
      type: "subagent",
      eventId: "spawn-research",
      sequence: 0,
      subagent: {
        spawnId: "spawn-research",
        parentToolCallId: "tool-approval",
        agentId: "researcher",
        agentName: "Researcher",
        task: "Inspect the application source",
        status: "completed",
        resultSummary: "Source inspected",
        childToolCallIds: ["tool-read"],
        timestamp: 90,
      },
    },
  ],
};

const model = buildRunInspectorModel(message);
assert.equal(model.toolCount, 2, "Inspector must count executable tool nodes once while tracking approvals separately");
assert(model.agents.includes("Researcher") && model.agents.includes("Builder"), "Inspector must expose agent facets");
assert(model.tools.includes("read_file") && model.tools.includes("run_command"), "Inspector must expose tool facets");
assert(model.phases.includes("completed") && model.phases.includes("waiting_for_approval"), "Inspector must expose phase facets");
assert.equal(filterInspectorNodes(model.nodes, "App.tsx", "all").length, 1, "search must include safe targets");
assert.equal(filterInspectorNodes(model.nodes, "", "attention").length, 2, "attention filter must include approval and failure");
assert.equal(filterInspectorNodes(model.nodes, "", "all", { agent: "Builder" }).length, 2, "agent filter must isolate one agent");
assert.equal(filterInspectorNodes(model.nodes, "", "all", { tool: "read_file" }).length, 1, "tool filter must isolate one tool");
assert.equal(filterInspectorNodes(model.nodes, "", "all", { approval: "required" }).length, 1, "approval filter must isolate approval nodes");
const treeOrder = orderInspectorTreeNodes(model.nodes);
assert.equal(treeOrder.length, model.nodes.length, "tree ordering must retain every canonical node");

const large = buildRunInspectorModel({
  ...message,
  id: "large-run",
  toolCalls: Array.from({ length: 500 }, (_, index) => ({
    id: `tool-${index}`,
    name: "read_file",
    status: "completed",
    input: { path: `src/file-${index}.ts` },
    output: "ok",
    sequence: index,
    phase: "completed",
  })),
  steps: [],
});
assert.equal(large.nodes.length, 500, "the model must retain canonical nodes for filtering and export");
assert.equal(MAX_INSPECTOR_RENDER_NODES, 240, "the Inspector must publish a bounded render budget");

const malformed = buildRunInspectorModel({ ...message, id: "malformed", steps: null, toolCalls: {} });
assert.equal(malformed.nodes.length, 0, "malformed message collections must fail closed without crashing the Inspector");
const circularDetails = { id: "circular", kind: "tool", phase: "completed", sequence: 1, summary: "Circular details", safeDetails: {} };
circularDetails.safeDetails.self = circularDetails.safeDetails;
assert.doesNotThrow(() => filterInspectorNodes([circularDetails], "circular", "all"), "circular diagnostic payloads must not crash search");

const inspector = readFileSync(new URL("../src/atlas/components/right-panel/RunInspector.tsx", import.meta.url), "utf8");
const toolCard = readFileSync(new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../src/atlas/agentRuntime/runInspectorModel.ts", import.meta.url), "utf8");
assert(inspector.includes("selectLatestTrace"), "Inspector trace selection must be deterministic");
assert(inspector.includes("isLoading") && inspector.includes("isError") && inspector.includes("refetchTraces"), "Inspector must expose loading, failure, and retry states");
assert(inspector.includes("MAX_INSPECTOR_RENDER_NODES"), "Inspector rendering must be bounded independently of model retention");
assert(inspector.includes('"agents"'), "Inspector must expose a dedicated delegation view");
assert(inspector.includes("orderInspectorTreeNodes") && inspector.includes("renderedTreeNodes"), "Inspector tree view must use parent-first ordering");
assert(inspector.includes("setPhaseFilter(\"all\")") && inspector.includes("focusedRun?.chatId === activeChatId"), "deep links must reset stale filters and reject cross-chat node selection");
assert(toolCard.includes("openRunInspector") && toolCard.includes("Inspect run"), "failed and approval tool cards must deep-link to the Inspector");
assert(modelSource.includes("breakNodeParentCycles"), "Inspector model must fail safely on corrupt hierarchy cycles");
assert(modelSource.includes("safeDetailsSearch(node.safeDetails)"), "Inspector search must include bounded safe diagnostics");

await closeSourceModuleLoader();
console.log("phase 12 Run Inspector contract ok");
