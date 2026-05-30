import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/tool/toolOutputPreview.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "toolOutputPreview.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildToolOutputPreview } = await import(moduleUrl);

const search = buildToolOutputPreview(JSON.stringify({
  status: "success",
  results: [
    { title: "Fast agent execution traces", summary: "Shows parallel tools as they finish.", url: "https://example.test/trace" },
    { title: "Approval gated commands", summary: "Keeps blocked commands visible." },
  ],
}));
assert.equal(search.results.length, 2, "search results should be extracted");
assert(search.summary.includes("2 results"), "summary should include result count");
assert.equal(search.results[0].title, "Fast agent execution traces", "first result title should be visible");

const command = buildToolOutputPreview(JSON.stringify({
  exit_code: 0,
  stdout: "Production build completed with existing warnings.",
  files: [{ path: "src/atlas/hooks/stream/useToolEvents.ts", changeType: "modified", lines_added: 4, deletions: 1, diff: "+ route sparse tool events" }],
}));
assert.equal(command.exitCode, "0", "exit code should be normalized");
assert.equal(command.files.length, 1, "file changes should be extracted");
assert.equal(command.files[0].linesAdded, 4, "snake_case additions should be normalized for file previews");
assert.equal(command.files[0].linesRemoved, 1, "deletions should be normalized for file previews");
assert(command.files[0].diff.includes("route sparse tool events"), "file diffs should be extracted for result previews");
assert(command.stdout.includes("Production build"), "stdout should be extracted");

const plain = buildToolOutputPreview("plain tool output");
assert.equal(plain.summary, "plain tool output", "plain text should remain previewable");

const artifact = buildToolOutputPreview(JSON.stringify({
  artifact: {
    id: "artifact-1",
    type: "html",
    title: "Generated dashboard",
    content: "<main>Dashboard</main>",
  },
}));
assert.equal(artifact.artifact.type, "html", "artifact type should be extracted");
assert.equal(artifact.artifact.title, "Generated dashboard", "artifact title should be extracted");
assert(artifact.summary.includes("artifact"), "artifact output should produce a useful summary");

const normalizedSearch = buildToolOutputPreview(JSON.stringify({
  id: "tool-call-1",
  tool_id: "web_search",
  status: "success",
  summary: "2 search results",
  output: {
    results: [
      { name: "Codebuff fast tool execution", snippet: "Streams tool progress quickly.", link: "https://example.test/codebuff" },
      { name: "Parallel agent traces", snippet: "Shows sub-agent lifecycle events." },
    ],
  },
}));
assert.equal(normalizedSearch.results.length, 2, "normalized backend envelopes should expose nested results");
assert.equal(normalizedSearch.results[0].title, "Codebuff fast tool execution", "nested result names should become titles");
assert.equal(normalizedSearch.results[0].url, "https://example.test/codebuff", "nested links should become urls");

const normalizedCommand = buildToolOutputPreview(JSON.stringify({
  tool_id: "run_command",
  status: "success",
  output: {
    stdout: "npm run build completed",
    stderr: "chunk size warning",
    exitCode: 0,
    changedFiles: [{ file: "src/atlas/components/chat/ToolCallCard.tsx", changeType: "modified" }],
  },
}));
assert.equal(normalizedCommand.exitCode, "0", "nested exitCode should be normalized");
assert(normalizedCommand.stdout.includes("npm run build"), "nested stdout should be extracted");
assert.equal(normalizedCommand.files.length, 1, "nested changedFiles should be extracted");
assert.equal(normalizedCommand.summary, "Build passed", "successful build output should produce a scannable collapsed summary");

const passedTests = buildToolOutputPreview(JSON.stringify({
  output: {
    stdout: "Test Suites: 3 passed, 3 total\nTests: 42 passed, 42 total",
    exitCode: 0,
  },
}));
assert.equal(passedTests.summary, "Tests passed: 42 passed", "test output should summarize passing count");

const failedTests = buildToolOutputPreview(JSON.stringify({
  output: {
    stdout: "Tests: 1 failed, 41 passed, 42 total",
    exitCode: 1,
  },
}));
assert.equal(failedTests.summary, "Tests failed: 1 failed", "test output should summarize failing count");

const normalizedArtifact = buildToolOutputPreview(JSON.stringify({
  display_name: "Generate UI",
  output: {
    generatedArtifact: {
      type: "markdown",
      title: "Task report",
      content: "# Report",
    },
  },
}));
assert.equal(normalizedArtifact.artifact.type, "markdown", "nested generatedArtifact should be extracted");
assert.equal(normalizedArtifact.summary, "markdown artifact: Task report", "nested artifact summary should be useful");

const rawResult = buildToolOutputPreview(JSON.stringify({
  raw_result: {
    error: "Permission denied",
    hint: "Ask for approval first",
  },
}));
assert(rawResult.stderr.includes("Permission denied"), "raw_result error should be extracted");
assert(rawResult.summary.includes("Permission denied"), "raw_result should drive fallback summary");

console.log("tool output preview ok");
