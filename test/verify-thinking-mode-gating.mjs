import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const inputSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const reasoningCapsSource = readFileSync(new URL("../src/atlas/components/useReasoningCapabilities.ts", import.meta.url), "utf8");
const chatInputModesSource = readFileSync(new URL("../src/atlas/components/useChatInputModes.ts", import.meta.url), "utf8");
const providerTypesSource = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const querySource = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const dbModelsSource = readFileSync(new URL("../src-tauri/src/db/models.rs", import.meta.url), "utf8");
const pinnedSource = readFileSync(new URL("../src/atlas/components/chat/input/PinnedActionBar.tsx", import.meta.url), "utf8");
const plusSource = readFileSync(new URL("../src/atlas/components/chat/input/PlusActionMenu.tsx", import.meta.url), "utf8");
const thinkingConfigSource = readFileSync(new URL("../src/atlas/components/chat/input/ThinkingConfig.tsx", import.meta.url), "utf8");
const chatCommandSource = readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8");
const anthropicSource = readFileSync(new URL("../src-tauri/src/llm/anthropic.rs", import.meta.url), "utf8");
const resolverSource = readFileSync(new URL("../src-tauri/src/llm/reasoning/resolver.rs", import.meta.url), "utf8");
const reasoningModSource = readFileSync(new URL("../src-tauri/src/llm/reasoning/mod.rs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../src-tauri/src/llm/reasoning/registry.rs", import.meta.url), "utf8");

// The frontend model type carries a single backend-resolved capability object,
// NOT the retired supportsReasoning/reasoningConfigType pair.
assert(
  providerTypesSource.includes("reasoning?: ReasoningCapability") &&
    providerTypesSource.includes("export interface ReasoningCapability") &&
    !providerTypesSource.includes("supportsReasoning") &&
    !providerTypesSource.includes("reasoningConfigType"),
  "frontend model type should carry a single resolved ReasoningCapability object",
);

// The provider capability profiles no longer declare a provider-wide reasoning
// default — reasoning is per-model, owned by the backend resolver.
assert(
  !providerTypesSource.includes("supportsReasoning: false") &&
    !providerTypesSource.includes("supportsReasoning: true"),
  "provider profiles must not hardcode reasoning support (backend owns it)",
);

assert(
  dbModelsSource.includes("pub reasoning: Option<crate::llm::ReasoningCapability>") &&
    !dbModelsSource.includes("pub supports_reasoning") &&
    !dbModelsSource.includes("pub reasoning_config_type"),
  "backend ModelInfo should expose one resolved reasoning capability",
);

assert(
  querySource.includes("model.reasoning") &&
    !querySource.includes("supportsReasoning: model.supportsReasoning"),
  "chat model mapping should preserve the resolved reasoning capability",
);

// UI derivation reads the capability object; the composer renders from it.
assert(
  reasoningCapsSource.includes("selectedModelInfo?.reasoning") &&
    reasoningCapsSource.includes('capability.support === "tunable"') &&
    inputSource.includes("useReasoningCapabilities("),
  "chat input should render Thinking from the resolved capability, not name guesses",
);

// buildThinkingPayload emits generic intent only; it never branches on a
// provider protocol and never claims enabled for a non-Zen capability.
assert(
  chatInputModesSource.includes("const buildThinkingPayload = useCallback(") &&
    chatInputModesSource.includes('capability.controlAvailability !== "zen"') &&
    chatInputModesSource.includes("return { enabled: false };") &&
    !chatInputModesSource.includes("anthropic") &&
    !chatInputModesSource.includes("gemini"),
  "buildThinkingPayload should emit generic intent, never provider protocols",
);

// ThinkingConfig renders each capability state; no legacy config-type strings.
assert(
  thinkingConfigSource.includes("capability.support === 'always_on'") &&
    thinkingConfigSource.includes("controlAvailability === 'provider_managed'") &&
    thinkingConfigSource.includes("capability.levels") &&
    !thinkingConfigSource.includes("reasoningConfigType"),
  "ThinkingConfig must render every capability state from the resolved object",
);

// The chip renders for any visible support state, driven by the object.
assert(
  pinnedSource.includes("reasoningCapability.support === 'always_on'") &&
    plusSource.includes("showReasoning"),
  "thinking controls should render from the resolved capability support state",
);

// send.rs stays a thin adapter: it forwards generic intent through the
// resolver's normalize_request and never re-derives protocol or budget.
assert(
  chatCommandSource.includes("ReasoningIntent") &&
    chatCommandSource.includes("llm_provider.reasoning_capability(&active_model)") &&
    chatCommandSource.includes("capability.normalize_request(&intent)") &&
    !chatCommandSource.includes("config.reasoning_effort = t.effort"),
  "send.rs should normalize generic intent via the resolver, not inline policy",
);

// The resolver is the SSOT: detection order + normalize_request live here, and
// include_reasoning must not be treated as always_on.
assert(
  resolverSource.includes("pub fn resolve(") &&
    resolverSource.includes("from_supported_parameters") &&
    resolverSource.includes("include_reasoning") &&
    resolverSource.includes("visibility signal"),
  "resolver should own detection order and treat include_reasoning as visibility only",
);

// Capability invariants + normalize_request live in the reasoning module.
assert(
  reasoningModSource.includes("pub fn normalize_request(") &&
    reasoningModSource.includes("ResolvedReasoningRequest") &&
    reasoningModSource.includes("AlwaysOn =>"),
  "reasoning module should own normalize_request and capability invariants",
);

// Anthropic resolves via the registry and encodes both adaptive + budget.
assert(
  anthropicSource.includes("fn anthropic_reasoning_metadata(model_id: &str)") &&
    anthropicSource.includes("AnthropicAdaptive") &&
    anthropicSource.includes("AnthropicBudget") &&
    anthropicSource.includes('thinking_type: "adaptive"'),
  "Anthropic should encode adaptive and budget thinking by resolved protocol",
);

// Registry classifies newer Claude as adaptive, 3.7 as budget.
assert(
  registrySource.includes("anthropic_adaptive") &&
    registrySource.includes("anthropic_budget") &&
    registrySource.includes("GeminiLevel"),
  "registry should carry version-aware protocols",
);

console.log("thinking mode gating verifier passed");
