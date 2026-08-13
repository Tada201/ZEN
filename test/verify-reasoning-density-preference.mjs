import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("src/lib/stores/settings/schema.ts");
const types = read("src/lib/stores/settings/types.ts");
const aiSlice = read("src/lib/stores/settings/createAISlice.ts");
const mapper = read("src/lib/stores/settingsMapper.ts");
const bridge = read("src/lib/stores/settings/settingsBridge.ts");
const settingsUi = read("src/components/settings/Tabs/ChatSettings.tsx");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");

assert(
  schema.includes('reasoningDisclosureDensity: z.enum(["compact", "balanced", "detailed"]).default("balanced")'),
  "settings schema must define the three density values with a balanced default",
);
assert(
  types.includes('reasoningDisclosureDensity: "compact" | "balanced" | "detailed"'),
  "typed settings state must expose the reasoning density union",
);
assert(
  aiSlice.includes('reasoningDisclosureDensity: "balanced"'),
  "AI settings slice must initialize reasoning density to balanced",
);
assert(
  mapper.includes('reasoningDisclosureDensity: "chat.reasoning-disclosure-density"'),
  "settings persistence must use a stable chat reasoning density key",
);
assert(
  bridge.includes('"chat.reasoning-disclosure-density": { field: "reasoningDisclosureDensity", type: "string" }'),
  "settings bridge must round-trip the density control",
);
assert(
  settingsUi.includes('settings["chat.reasoning-disclosure-density"]') &&
    settingsUi.includes('{ value: "compact", label: "Compact" }') &&
    settingsUi.includes('{ value: "balanced", label: "Balanced" }') &&
    settingsUi.includes('{ value: "detailed", label: "Detailed" }'),
  "chat settings must expose compact, balanced, and detailed choices",
);
assert(
  reasoning.includes("useSettingsStore") &&
    reasoning.includes("data-reasoning-density") &&
    reasoning.includes("max-h-[180px]") &&
    reasoning.includes("max-h-[260px]") &&
    reasoning.includes("max-h-[420px]"),
  "reasoning disclosure must consume the preference and apply distinct density styles",
);
assert(
  reasoning.includes('defaultOpen ?? density === "detailed"'),
  "detailed mode should open unspecified completed disclosures by default without overriding explicit caller choices",
);

console.log("reasoning density preference contract passed");
