import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const inputSource = readFileSync(new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url), "utf8");
const providerTypesSource = readFileSync(new URL("../src/lib/types/provider.ts", import.meta.url), "utf8");
const querySource = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const modelSelectorSource = readFileSync(new URL("../src/atlas/components/ModelSelector.tsx", import.meta.url), "utf8");
const dbModelsSource = readFileSync(new URL("../src-tauri/src/db/models.rs", import.meta.url), "utf8");
const openAiModelsSource = readFileSync(new URL("../src-tauri/src/llm/openai_compat/models.rs", import.meta.url), "utf8");
const pinnedSource = readFileSync(new URL("../src/atlas/components/chat/input/PinnedActionBar.tsx", import.meta.url), "utf8");
const plusSource = readFileSync(new URL("../src/atlas/components/chat/input/PlusActionMenu.tsx", import.meta.url), "utf8");
const chatCommandSource = readFileSync(new URL("../src-tauri/src/commands/chat.rs", import.meta.url), "utf8");
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

assert(
  inputSource.includes("selectedModelInfo.supportsReasoning === true") &&
    inputSource.includes("return selectedModelInfo.reasoningConfigType ?? 'none';"),
  "chat input should render Thinking from provider metadata, not local model-name guesses",
);

assert(
  inputSource.includes("const buildThinkingPayload = useCallback((): ThinkingPayload =>") &&
    inputSource.includes("if (reasoningConfigType === 'effort')") &&
    inputSource.includes("if (reasoningConfigType === 'budget')") &&
    inputSource.includes("return { enabled: true };") &&
    inputSource.includes("thinking: buildThinkingPayload()"),
  "chat input should only send reasoning parameters supported by the selected model metadata",
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
