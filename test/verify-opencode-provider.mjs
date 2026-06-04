import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const providerTypes = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const providerSlice = readFileSync(new URL("../src/lib/stores/settings/createProviderSlice.ts", import.meta.url), "utf8");
const settingsTypes = readFileSync(new URL("../src/lib/stores/settings/types.ts", import.meta.url), "utf8");
const settingsSchema = readFileSync(new URL("../src/lib/stores/settings/schema.ts", import.meta.url), "utf8");
const backendProviderMeta = readFileSync(new URL("../src-tauri/src/llm/provider_meta.rs", import.meta.url), "utf8");
const backendSettings = readFileSync(new URL("../src-tauri/src/commands/settings.rs", import.meta.url), "utf8");
const openAiModels = readFileSync(new URL("../src-tauri/src/llm/openai_compat/models.rs", import.meta.url), "utf8");
const openAiStream = readFileSync(new URL("../src-tauri/src/llm/openai_compat/stream.rs", import.meta.url), "utf8");

assert(
  providerTypes.includes("key: 'opencode'") &&
    providerTypes.includes("name: 'OpenCode Free'") &&
    providerTypes.includes("requiresKey: false") &&
    providerTypes.includes("https://opencode.ai/zen/v1"),
  "OpenCode Free must be registered as a no-key native frontend provider",
);

assert(
  !providerTypes.includes("opencode: 'opencodeApiKey'"),
  "OpenCode Free must not be gated by an API key field",
);

assert(
  providerTypes.includes("opencode: 'opencodeBaseUrl'") &&
    providerSlice.includes('opencodeBaseUrl: "https://opencode.ai/zen/v1"') &&
    settingsTypes.includes("opencodeBaseUrl: string") &&
    settingsSchema.includes('opencodeBaseUrl: z.string().default("https://opencode.ai/zen/v1")'),
  "OpenCode Free base URL must be persisted and discoverable by provider config",
);

assert(
  backendProviderMeta.includes('name: "opencode"') &&
    backendProviderMeta.includes('name: "opencode_free"') &&
    backendProviderMeta.includes('default_base_url: "https://opencode.ai/zen/v1"') &&
    backendSettings.includes('"opencode"') &&
    backendSettings.includes('let is_no_key_builtin = p_name == "opencode";') &&
    backendSettings.includes("(is_local && is_active) || is_no_key_builtin || is_active || has_key || has_url"),
  "Backend provider registry must include native OpenCode defaults and discovery",
);

assert(
  openAiModels.includes("opencode_free_model") &&
    openAiModels.includes('id.ends_with("-free")') &&
    openAiModels.includes('id == "big-pickle"'),
  "OpenCode provider model fetch should expose the free OpenCode model lane only",
);

assert(
  openAiStream.includes('"opencode"') && openAiStream.includes('"opencode_free"'),
  "OpenCode provider should be allowed through the OpenAI-compatible tool policy",
);

console.log("opencode native provider checks passed");
