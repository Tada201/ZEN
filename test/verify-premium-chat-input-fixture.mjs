import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const contract = read("src/atlas/components/chat/premiumChatInputFixtureContract.ts");
const fixture = read("src/atlas/components/chat/PremiumChatInputFixture.tsx");
const input = read("src/atlas/components/PremiumChatInput.tsx");
const types = read("src/atlas/components/chat/input/PremiumChatInputTypes.ts");

assert(contract.includes('"zen-harness=premium-chat-input"'), "the fixture needs a stable development query contract");
assert(app.includes("PREMIUM_CHAT_INPUT_FIXTURE_QUERY"), "App must recognize the fixture query");
assert(app.includes("import.meta.env.DEV"), "the fixture route must be development-only");
assert(app.includes("PremiumChatInputFixture"), "App must lazy-load the production composer fixture");

for (const state of [
  "empty",
  "typed",
  "long-draft",
  "loading",
  "paused",
  "readonly",
  "welcome",
  "sidebar",
  "task-plan",
  "attachments",
  "interactions",
]) {
  assert(fixture.includes(`caseId=\"${state}\"`), `fixture must include the ${state} baseline state`);
}

for (const interaction of [
  "Open add menu",
  "Open model picker",
  "Open image presets",
  "Add fixture file",
  "Show slash commands",
  "Open task plan",
  "Toggle thinking",
]) {
  assert(fixture.includes(interaction), `fixture must expose the ${interaction} interaction`);
}

assert(fixture.includes("onSend={onSend}"), "fixture must mount the real send callback path");
assert(fixture.includes("onSelectModel={onSelectModel}"), "fixture must mount the real model selection path");
assert(fixture.includes("input={draft}"), "fixture must exercise the controlled draft path");
assert(!fixture.includes("suppressLayoutAnimation"), "fixture should rely on the production instant-geometry contract");
assert(fixture.includes("DataTransfer"), "attachment baseline must use the real file input path");
assert(fixture.includes("useTaskStore"), "task-plan baseline must use the production task store");
assert(fixture.includes("No backend calls"), "fixture must communicate its local-only maturity boundary");
for (const width of ["320px", "390px", "480px", "768px", "1024px", "1440px"]) {
  assert(fixture.includes(`width=\"${width}\"`), `fixture must include the ${width} visual matrix width`);
}
assert(fixture.includes("data-fixture-theme={theme}"), "fixture cases must expose their visual theme to browser tooling");
assert(fixture.includes("theme=\"light\"") && fixture.includes("theme=\"dark\""), "fixture must include both light and dark theme cases");
assert(fixture.includes("FIXTURE_THEME_VARS"), "theme cases must use scoped semantic variables without mutating persisted settings");
assert(fixture.includes("caseId === \"task-plan\""), "task-plan controls must target only the task-plan fixture case");
assert(!fixture.includes('clickWithin("task-plan",'), "fixture controls must not reach across fixture case boundaries");
assert(!fixture.includes("invoke("), "fixture must not call Tauri commands directly");
assert(!fixture.includes("fetch("), "fixture must not call network APIs directly");
assert(!types.includes("suppressLayoutAnimation"), "the public composer contract must not retain a dead layout prop");
assert(input.includes("PremiumChatInput"), "the fixture must target the production composer rather than a copy");

console.log("premium chat input fixture contract passed");
