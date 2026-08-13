import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fixture = read("src/atlas/components/chat/PremiumChatInputFixture.tsx");
const plan = read("Plan_agentic-workbench-completion.md");
const qa = read("docs/architecture/premium-chat-input-visual-qa.md");
const packageJson = JSON.parse(read("package.json"));

assert(packageJson.scripts["test:premium-chat-input-system"] === "node test/verify-premium-chat-input-system.mjs", "package scripts must expose the Phase 7 composer aggregator");
assert(existsSync(new URL("../src/atlas/components/chat/premiumChatInputFixtureContract.ts", import.meta.url)), "the fixture query contract must remain addressable");

for (const width of ["320px", "390px", "480px", "768px", "1024px", "1440px"]) {
  assert(fixture.includes(`width=\"${width}\"`), `fixture must render the ${width} visual QA width`);
}
for (const theme of ["theme=\"light\"", "theme=\"dark\"", "data-fixture-theme={theme}"]) {
  assert(fixture.includes(theme), `fixture must render and identify ${theme.replace(/.*=\"?/, "")}`);
}
for (const state of ["empty", "typed", "long-draft", "loading", "paused", "readonly", "welcome", "sidebar", "task-plan", "attachments", "interactions"]) {
  assert(fixture.includes(`caseId=\"${state}\"`), `fixture must retain the ${state} state`);
}
for (const interaction of ["Show slash commands", "Open model picker", "Open add menu", "Add fixture file", "Toggle thinking"]) {
  assert(fixture.includes(interaction), `fixture must retain the ${interaction} interaction path`);
}
assert(fixture.includes("No backend calls") && fixture.includes("DataTransfer"), "fixture must remain deterministic and local-only");

for (const section of ["Phase 14 — Premium Chat Input hardening and final visual QA", "composer task/capability/geometry risks", "Manual browser visual evidence"]) {
  assert(plan.includes(section), `consolidated plan must retain ${section}`);
}
assert(qa.includes("Phase 7 rollout checklist"), "visual QA documentation must retain the rollout checklist");
for (const criterion of ["320px", "1440px", "light", "dark", "focus return", "IME", "reduced motion", "no horizontal overflow"]) {
  assert(qa.toLowerCase().includes(criterion.toLowerCase()), `visual QA matrix must define ${criterion}`);
}

const verifiers = [
  "verify-premium-chat-input-fixture.mjs",
  "verify-premium-chat-input-tokens.mjs",
  "verify-premium-chat-input-geometry.mjs",
  "verify-premium-chat-input-accessibility.mjs",
  "verify-premium-chat-input-composition.mjs",
  "verify-premium-chat-input-responsive.mjs",
  "verify-premium-chat-input-motion.mjs",
  "verify-premium-chat-input-consolidation.mjs",
  "verify-premium-chat-input-runtime.mjs",
  "verify-input-responsiveness.mjs",
  "verify-chat-input-selected-model-routing.mjs",
  "verify-chat-orchestration-compact-mode.mjs",
  "verify-chat-render-stability.mjs",
  "verify-chat-scrubber-input-stability.mjs",
  "verify-chat-transition-content.mjs",
  "verify-new-chat-welcome.mjs",
  "verify-motion-policy.mjs",
];

for (const verifier of verifiers) {
  const result = spawnSync(process.execPath, [`test/${verifier}`], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Phase 7 composer verifier failed: ${verifier}`);
  }
  process.stdout.write(result.stdout || "");
}

console.log(`premium chat input system verification passed (${verifiers.length} contracts)`);
