import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const scripts = packageJson.scripts || {};
const args = new Set(process.argv.slice(2));
const patternArg = process.argv.find((arg) => arg.startsWith("--pattern="));
const pattern = patternArg ? new RegExp(patternArg.slice("--pattern=".length), "i") : null;
const includeBackend = args.has("--include-backend");
const failFast = args.has("--fail-fast");

const aggregateScripts = new Set([
  "test",
  "test:agentic-ui",
  "test:backend",
]);

const featureTests = Object.entries(scripts)
  .filter(([name, command]) => {
    if (!name.startsWith("test:")) return false;
    if (aggregateScripts.has(name)) return includeBackend && name === "test:backend";
    if (pattern && !pattern.test(name)) return false;
    return typeof command === "string" && command.trim().startsWith("node test/");
  })
  .map(([name, command]) => ({ name, command }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (featureTests.length === 0) {
  console.error("No feature test scripts matched.");
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const startedAt = performance.now();
const results = [];

console.log(`Running ${featureTests.length} feature test${featureTests.length === 1 ? "" : "s"}...`);

for (const { name, command } of featureTests) {
  const testStartedAt = performance.now();
  const code = await runScript(name, command);
  const durationMs = Math.round(performance.now() - testStartedAt);
  results.push({ name, code, durationMs });

  const status = code === 0 ? "PASS" : "FAIL";
  console.log(`${status} ${name} (${formatDuration(durationMs)})`);

  if (code !== 0 && failFast) {
    break;
  }
}

const failed = results.filter((result) => result.code !== 0);
const totalMs = Math.round(performance.now() - startedAt);

console.log("");
console.log("Feature Test Summary");
console.log(`Total: ${results.length}/${featureTests.length}`);
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Time: ${formatDuration(totalMs)}`);

if (failed.length > 0) {
  console.log("");
  console.log("Failed scripts:");
  for (const result of failed) {
    console.log(`- ${result.name} (exit ${result.code}, ${formatDuration(result.durationMs)})`);
  }
  process.exit(1);
}

function runScript(name, command) {
  return new Promise((resolve) => {
    const [bin, ...args] = command.trim().split(/\s+/);
    const child = spawn(bin === "node" ? process.execPath : npmCommand, bin === "node" ? args : ["run", "--silent", name], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
