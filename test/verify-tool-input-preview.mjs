import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/tool/toolInputPreview.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "toolInputPreview.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildToolChecklistPreview } = await import(moduleUrl);

const todos = buildToolChecklistPreview({
  todos: [
    { task: "Inspect current trace UI", completed: true },
    { task: "Patch checklist preview", completed: false },
    { description: "Run focused tests", status: "completed" },
    { title: "Verify build", done: true },
  ],
});

assert.equal(todos.length, 4, "todos should produce checklist preview items");
assert.equal(todos[0].label, "Inspect current trace UI", "todo task should become label");
assert.equal(todos[0].completed, true, "completed flag should be preserved");
assert.equal(todos[1].completed, false, "incomplete todo should stay active");
assert.equal(todos[2].label, "Run focused tests", "description should become label");
assert.equal(todos[2].completed, true, "completed status should be recognized");
assert.equal(todos[3].completed, true, "done flag should be recognized");

const capped = buildToolChecklistPreview({
  tasks: Array.from({ length: 10 }, (_, index) => ({ name: `Task ${index + 1}` })),
});
assert.equal(capped.length, 8, "checklist previews should stay bounded");
assert.equal(capped[7].label, "Task 8", "bounded preview should preserve order");

const empty = buildToolChecklistPreview({ command: "npm run build" });
assert.equal(empty.length, 0, "non-checklist tool inputs should not render checklist previews");

console.log("tool input preview ok");
