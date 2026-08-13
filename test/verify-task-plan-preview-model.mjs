import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/taskPlanPreviewModel.ts", import.meta.url);
let source = readFileSync(sourcePath, "utf8");
// The lightweight data-URL loader intentionally has no Vite alias resolver;
// provide the already-tested pure helper inline so this model test exercises
// behavior rather than the production module graph.
source = source.replace(
  'import { normalizeTaskDisplayStatus, type TaskDisplayStatus } from "@/lib/tasks/taskStatus";\n',
  'const normalizeTaskDisplayStatus = (value) => { if (["running", "in_progress", "in-progress", "started", "active"].includes(value)) return "running"; if (["completed", "complete", "success", "done"].includes(value)) return "completed"; if (["error", "failed", "failure"].includes(value)) return "error"; if (["cancelled", "canceled"].includes(value)) return "cancelled"; return "pending"; };\n',
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "taskPlanPreviewModel.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildTaskPlanPreviewModel } = await import(moduleUrl);

const model = buildTaskPlanPreviewModel({
  type: "action",
  kind: "task_list_updated",
  metadata: {
    tasks: [
      { task_id: "t1", description: "Inspect streaming path", status: "in-progress", assigned_to: "Researcher" },
      { id: "t2", title: "Patch trace UI", status: "done", agentName: "Frontend" },
      { id: "t3", name: "Run verification", status: "failure", agent_id: "Verifier" },
      { id: "t4", task: "Document result", status: "canceled" },
      { id: "t5", description: "Pending one" },
      { id: "t6", description: "Pending two" },
      { id: "t7", description: "Pending three" },
      { id: "t8", description: "Pending four" },
      { id: "t9", description: "Hidden task" },
    ],
    battlePlan: {
      steps: ["Map events", "Patch UI", "Verify composition", "Ship"],
    },
    taskResult: {
      error: "Verification failed",
      output: "Should not be preferred",
      durationMs: 321,
      success: false,
    },
  },
});

assert.equal(model.hasPreview, true, "task metadata should produce a preview");
assert.equal(model.tasks.length, 8, "visible task list should be capped");
assert.equal(model.hiddenTaskCount, 1, "hidden task count should be exposed");
assert.equal(model.tasks[0].id, "t1", "snake_case task id should normalize");
assert.equal(model.tasks[0].label, "Inspect streaming path", "description should become label");
assert.equal(model.tasks[0].status, "running", "hyphenated in-progress should render as active");
assert.equal(model.tasks[0].assignee, "Researcher", "assigned_to should normalize");
assert.equal(model.tasks[1].label, "Patch trace UI", "title should become label");
assert.equal(model.tasks[1].status, "completed", "done should render completed");
assert.equal(model.tasks[1].assignee, "Frontend", "agentName should normalize");
assert.equal(model.tasks[2].status, "error", "failure should render error");
assert.equal(model.tasks[2].assignee, "Verifier", "agent_id should normalize");
assert.equal(model.tasks[3].status, "cancelled", "canceled should render cancelled");
assert.deepEqual(model.battlePlanSteps, ["Map events", "Patch UI", "Verify composition", "Ship"], "battle plan steps should be preserved");
assert.equal(model.taskResult.text, "Verification failed", "task result error should be preferred over output");
assert.equal(model.taskResult.durationMs, 321, "task result duration should be preserved");
assert.equal(model.taskResult.success, false, "task result success should be preserved");

const empty = buildTaskPlanPreviewModel({ type: "action", kind: "chat_status", metadata: {} });
assert.equal(empty.hasPreview, false, "empty metadata should not render a preview shell");

console.log("task plan preview model ok");
