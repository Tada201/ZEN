import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const providerTypes = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const providerSlice = readFileSync(new URL("../src/lib/stores/settings/createProviderSlice.ts", import.meta.url), "utf8");
const settingsStore = readFileSync(new URL("../src/lib/stores/useSettingsStore.ts", import.meta.url), "utf8");
const useChat = readFileSync(new URL("../src/atlas/hooks/useChat.ts", import.meta.url), "utf8");
const chatSection = readFileSync(new URL("../src/atlas/sections/ChatSection.tsx", import.meta.url), "utf8");
const workspaceSection = readFileSync(new URL("../src/atlas/sections/WorkspaceSection.tsx", import.meta.url), "utf8");
const voiceSettings = readFileSync(new URL("../src/components/settings/Tabs/VoiceSettings.tsx", import.meta.url), "utf8");
const voiceDisplay = readFileSync(new URL("../src-tauri/src/agent/runner/voice_display.rs", import.meta.url), "utf8");
const chatCommand = readFileSync(new URL("../src-tauri/src/commands/chat.rs", import.meta.url), "utf8");
const backendSettings = readFileSync(new URL("../src-tauri/src/commands/settings.rs", import.meta.url), "utf8");
const backendMeta = readFileSync(new URL("../src-tauri/src/llm/provider_meta.rs", import.meta.url), "utf8");
const models = readFileSync(new URL("../src-tauri/src/llm/openai_compat/models.rs", import.meta.url), "utf8");
const stream = readFileSync(new URL("../src-tauri/src/llm/openai_compat/stream.rs", import.meta.url), "utf8");

const nineRouterBlock = providerTypes.slice(
  providerTypes.indexOf("key: 'nine_router'"),
  providerTypes.indexOf("key: 'opencode'"),
);
assert(
  voiceSettings.includes('value={`${model.provider}::${model.id || model.name || ""}`}') &&
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
    chatSection.includes("setSelectedModelId(id, provider)") &&
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

assert(models.includes('"nine_router"') && models.includes("provider_is_mixed_router"), "9Router must use mixed-router capability rules");
assert(!stream.includes('| "kilocode" | "nine_router"'), "9Router must not default every model to tool support");
assert(stream.includes("model_supports_reasoning") && stream.includes("!allow_reasoning"), "9Router reasoning fields must be capability-gated");

console.log("9Router provider checks passed");
