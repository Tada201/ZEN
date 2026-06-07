import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const providerTypes = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const providerSlice = readFileSync(new URL("../src/lib/stores/settings/createProviderSlice.ts", import.meta.url), "utf8");
const backendSettings = readFileSync(new URL("../src-tauri/src/commands/settings.rs", import.meta.url), "utf8");
const backendMeta = readFileSync(new URL("../src-tauri/src/llm/provider_meta.rs", import.meta.url), "utf8");
const models = readFileSync(new URL("../src-tauri/src/llm/openai_compat/models.rs", import.meta.url), "utf8");
const stream = readFileSync(new URL("../src-tauri/src/llm/openai_compat/stream.rs", import.meta.url), "utf8");

const nineRouterBlock = providerTypes.slice(
  providerTypes.indexOf("key: 'nine_router'"),
  providerTypes.indexOf("key: 'opencode'"),
);

assert(nineRouterBlock.includes("requiresKey: false"), "9Router must allow no-key local discovery");
assert(!providerTypes.includes("nine_router: 'nineRouterApiKey'"), "9Router must not be frontend key-gated");
assert(providerSlice.includes("providerInfo?.requiresKey"), "Generic cloud key guard must remain intact");

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
