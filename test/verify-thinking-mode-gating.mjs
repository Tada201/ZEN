import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const inputSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const reasoningCapsSource = readFileSync(new URL("../src/atlas/components/useReasoningCapabilities.ts", import.meta.url), "utf8");
const chatInputModesSource = readFileSync(new URL("../src/atlas/components/useChatInputModes.ts", import.meta.url), "utf8");
const providerTypesSource = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const querySource = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const modelSelectorSource = readFileSync(new URL("../src/atlas/components/ModelSelector.tsx", import.meta.url), "utf8");
const dbModelsSource = readFileSync(new URL("../src-tauri/src/db/models.rs", import.meta.url), "utf8");
const openAiModelsSource = readFileSync(new URL("../src-tauri/src/llm/openai_compat/models.rs", import.meta.url), "utf8");
const pinnedSource = readFileSync(new URL("../src/atlas/components/chat/input/PinnedActionBar.tsx", import.meta.url), "utf8");
const plusSource = readFileSync(new URL("../src/atlas/components/chat/input/PlusActionMenu.tsx", import.meta.url), "utf8");
const thinkingConfigSource = readFileSync(new URL("../src/atlas/components/chat/input/ThinkingConfig.tsx", import.meta.url), "utf8");
const chatCommandSource = readFileSync(new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url), "utf8");
const openAiStreamSource = readFileSync(new URL("../src-tauri/src/llm/openai_compat/stream.rs", import.meta.url), "utf8");
const anthropicSource = readFileSync(new URL("../src-tauri/src/llm/anthropic.rs", import.meta.url), "utf8");

assert(
  providerTypesSource.includes("supportsReasoning?: boolean") &&
    providerTypesSource.includes("reasoningConfigType?: 'none' | 'effort' | 'budget'"),
  "frontend model type should carry provider-discovered reasoning metadata",
);

assert(
  dbModelsSource.includes("pub supports_reasoning: Option<bool>") &&
    dbModelsSource.includes("pub reasoning_config_type: Option<String>"),
  "backend model metadata should expose reasoning support and config type",
);

assert(
  querySource.includes("supportsReasoning: model.supportsReasoning") &&
    querySource.includes("reasoningConfigType: model.reasoningConfigType") &&
    modelSelectorSource.includes("supportsReasoning?: boolean") &&
    modelSelectorSource.includes('reasoningConfigType?: "none" | "effort" | "budget"'),
  "chat model mapping should preserve provider reasoning metadata",
);

// Reasoning-capability derivation was carved out of PremiumChatInput.tsx into
// useReasoningCapabilities.ts (keeps the composer under the 350-line budget).
assert(
  reasoningCapsSource.includes("selectedModelInfo.supportsReasoning === true") &&
    reasoningCapsSource.includes('return "none";') &&
    inputSource.includes("useReasoningCapabilities("),
  "chat input should render Thinking from provider metadata, not local model-name guesses",
);

// buildThinkingPayload moved into useChatInputModes.ts (mode ownership).
// 'none' models have no tunable reasoning parameter and send.rs only
// forwards effort/budget, so the fallthrough must report enabled:false —
// an enabled:true claim would send nothing on the wire.
assert(
  chatInputModesSource.includes("const buildThinkingPayload = useCallback(") &&
    chatInputModesSource.includes('if (reasoningConfigType === "effort")') &&
    chatInputModesSource.includes('if (reasoningConfigType === "budget")') &&
    chatInputModesSource.includes("no tunable reasoning parameter") &&
    chatInputModesSource.includes("return { enabled: false };") &&
    !chatInputModesSource.includes("return { enabled: true };") &&
    inputSource.includes("buildThinkingPayload"),
  "chat input should only send reasoning parameters supported by the selected model metadata",
);

// The on/off toggle is a placebo for reasoningConfigType 'none' (nothing is
// sent on the wire), so ThinkingConfig must render it only for tunable
// types; the 'none' informational note shows at full opacity with no toggle.
assert(
  thinkingConfigSource.includes("{isTunable && (") &&
    thinkingConfigSource.includes("isTunable && !isThinking") &&
    thinkingConfigSource.includes("reasoningConfigType === 'none'") &&
    thinkingConfigSource.includes("aria-pressed={isThinking}"),
  "reasoning on/off toggle must render only when the model exposes a tunable reasoning parameter",
);
assert(
  !thinkingConfigSource.includes("Enabling it ensures"),
  "the 'none' note must not promise that toggling changes model behavior",
);

assert(
  !inputSource.includes("modelSupportsReasoning(") &&
    !inputSource.includes("const isReasoningProvider = ['openai', 'anthropic', 'google', 'deepseek', 'ollama', 'lmstudio']"),
  "chat input should not maintain hardcoded provider/model reasoning inference",
);

assert(
  openAiModelsSource.includes("let reasoning_metadata = |id: &str|") &&
    anthropicSource.includes("fn anthropic_reasoning_metadata(model_id: &str)") &&
    anthropicSource.includes("manual extended thinking") === false,
  "provider adapters should own provider-specific reasoning metadata",
);

assert(
  pinnedSource.includes("actionId === 'thinking' && supportsReasoning") &&
    plusSource.includes("!pinnedActions.includes('thinking') && supportsReasoning"),
  "thinking controls should only render when selected model supports reasoning",
);

assert(
  chatCommandSource.includes("if let Some(t) = thinking") &&
    chatCommandSource.includes("if t.enabled") &&
    chatCommandSource.includes("config.reasoning_effort = t.effort") &&
    chatCommandSource.includes("config.thinking_budget = t.budget_tokens"),
  "backend should only forward reasoning parameters when thinking is enabled",
);

assert(
  openAiStreamSource.includes("config.reasoning_effort.clone()") &&
    anthropicSource.includes("let thinking = config") &&
    anthropicSource.includes(".thinking_budget") &&
    anthropicSource.includes("supports_manual_thinking_budget(model)") &&
    anthropicSource.includes("thinking: Option<AnthropicThinking>"),
  "provider adapters should forward supported reasoning config fields",
);

console.log("thinking mode gating verifier passed");
