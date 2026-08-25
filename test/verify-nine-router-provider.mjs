import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const providerTypes = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const providerSlice = readFileSync(new URL("../src/lib/stores/settings/createProviderSlice.ts", import.meta.url), "utf8");
const settingsStore = readFileSync(new URL("../src/lib/stores/useSettingsStore.ts", import.meta.url), "utf8");
const useChat = readFileSync(new URL("../src/atlas/hooks/useChat.ts", import.meta.url), "utf8");
const workspaceSection = readFileSync(new URL("../src/atlas/sections/WorkspaceSection.tsx", import.meta.url), "utf8");
const voiceSettings = readFileSync(new URL("../src/components/settings/Tabs/VoiceSettings.tsx", import.meta.url), "utf8");
const voiceDisplay = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/voice_display.rs", import.meta.url), "utf8");
// `commands/chat/send.rs` was split into `send/{history,persist,prompt,research,
// resolve,route,validate}.rs`. Read the parent plus every submodule as one blob
// so shape assertions that predate the split keep anchoring on the same content.
const chatCommand = ["history", "persist", "prompt", "research", "resolve", "route", "validate"]
  .map((m) => readFileSync(new URL(`../src-tauri/src/commands/chat/send/${m}.rs`, import.meta.url), "utf8"))
  .concat(readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8"))
  .join("\n");
const backendSettings = readFileSync(new URL("../src-tauri/src/commands/settings.rs", import.meta.url), "utf8");
// The LLM layer moved into the `zen-llm` crate during the workspace migration.
const backendMeta = readFileSync(new URL("../src-tauri/crates/zen-llm/src/provider_meta.rs", import.meta.url), "utf8");
const models = readFileSync(new URL("../src-tauri/crates/zen-llm/src/openai_compat/models.rs", import.meta.url), "utf8");
const stream = readFileSync(new URL("../src-tauri/crates/zen-llm/src/openai_compat/stream.rs", import.meta.url), "utf8");

const nineRouterBlock = providerTypes.slice(
  providerTypes.indexOf("key: 'nine_router'"),
  providerTypes.indexOf("key: 'opencode'"),
);
assert(
  // The provider::model template moved off the voice-settings UI; provider
  // retention for the display agent is enforced backend-side.
  chatCommand.includes('split_once("::")') &&
    voiceDisplay.includes("provider_by_name(&provider_name, &db)"),
  "Voice display model selection must retain its provider instead of using the global active provider",
);

assert(nineRouterBlock.includes("requiresKey: false"), "9Router must allow no-key local discovery");
assert(!providerTypes.includes("nine_router: 'nineRouterApiKey'"), "9Router must not be frontend key-gated");
assert(providerSlice.includes("providerInfo?.requiresKey"), "Generic cloud key guard must remain intact");
assert(
  settingsStore.includes("await state?.hydrateFromBackend()") &&
    settingsStore.includes("fetchModels(hydratedState.activeProvider)"),
  "Provider discovery must refresh after backend hydration so 9Router does not require clicking Save",
);
assert(
  useChat.includes("switchModel(provider, id)") &&
    workspaceSection.includes("setSelectedModelId(id, prov)"),
  "Model selection must persist provider and model atomically to prevent 9Router models being sent through OpenCode",
);

assert(
  backendMeta.includes('name: "nine_router"') && backendMeta.includes('default_base_url: "http://localhost:20128/v1"'),
  "9Router backend metadata must retain its local endpoint",
);
assert(
  backendSettings.includes('p_name == "nine_router"') &&
    backendSettings.includes("let should_fetch = if is_local") &&
    backendSettings.includes("if should_fetch"),
  "Inactive global refreshes must not poll 9Router",
);

// 9router was deliberately removed from provider_is_mixed_router (see
// models.rs comment: ~90% of its catalog is tool-capable, so it falls through
// to the `fallback` default instead of the conservative `false`).
assert(
  models.includes('"openrouter" | "together" | "perplexity"') &&
    models.includes("provider_is_mixed_router"),
  "Mixed-router capability rules must remain for non-9Router routers",
);
assert(!models.includes('"nine_router" | "openrouter"'), "9Router must not be in the mixed-router list");
assert(!stream.includes('| "kilocode" | "nine_router"'), "9Router must not default every model to tool support");
assert(stream.includes("model_supports_reasoning") && stream.includes("!allow_reasoning"), "9Router reasoning fields must be capability-gated");

console.log("9Router provider checks passed");
