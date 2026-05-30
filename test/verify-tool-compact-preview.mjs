import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function importTs(path) {
  const source = readFileSync(path, "utf8")
    .replace(/import type \{ ToolCall \} from "\.\.\/types";\n/, "")
    .replace(/import type \{ ToolChecklistItem \} from "\.\/toolInputPreview";\n/, "");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const module = await importTs("src/atlas/components/chat/tool/toolCompactPreview.ts");
const { buildToolCompactPreview } = module;

const command = buildToolCompactPreview({
  name: "bash",
  input: { command: "npm run test:tool-output-preview" },
  status: "running",
});
assert(command?.tone === "command", "command tone should be inferred");
assert(command?.primary === "$ npm run test:tool-output-preview", "command preview should include exact command");

const file = buildToolCompactPreview({
  name: "edit_file",
  input: { path: "src/atlas/components/chat/ToolCallCard.tsx", operation: "update" },
  status: "running",
});
assert(file?.tone === "file", "file tone should be inferred");
assert(file?.primary.includes("ToolCallCard.tsx"), "file preview should show path");
assert(file?.secondary === "update", "file preview should show action");

const search = buildToolCompactPreview({
  name: "web_search",
  input: { query: "codebuff agent streaming tool call lifecycle" },
  status: "running",
});
assert(search?.tone === "search", "search tone should be inferred");
assert(search?.primary.includes("codebuff"), "search preview should show query");

const checklist = buildToolCompactPreview({
  name: "task_plan",
  input: {},
  checklistItems: [
    { label: "Trace event routing", completed: true },
    { label: "Render compact preview", completed: false },
  ],
  status: "running",
});
assert(checklist?.tone === "checklist", "checklist tone should be used");
assert(checklist?.primary === "2 checklist items, 1 open", "checklist preview should count open items");
assert(checklist?.secondary === "Trace event routing / Render compact preview", "checklist preview should show item labels");

const completed = buildToolCompactPreview({
  name: "bash",
  input: { command: "npm run build" },
  outputSummary: "Command completed successfully",
  status: "completed",
});
assert(completed?.tone === "result", "completed output should use result tone");
assert(completed?.primary === "Command completed successfully", "completed output should win over input preview");

const error = buildToolCompactPreview({
  name: "bash",
  input: { command: "npm run build" },
  outputSummary: "TypeScript failed",
  status: "error",
});
assert(error?.tone === "error", "error output should use error tone");
assert(error?.primary === "TypeScript failed", "error output should win over input preview");

const url = pathToFileURL("src/atlas/components/chat/tool/toolCompactPreview.ts");
assert(String(url).includes("toolCompactPreview.ts"), "test should resolve local module path");

console.log("tool compact preview verifier passed");
