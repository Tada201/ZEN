import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const queriesSource = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const settingsTypesSource = readFileSync(new URL("../src/lib/stores/settings/types.ts", import.meta.url), "utf8");
const providerSliceSource = readFileSync(new URL("../src/lib/stores/settings/createProviderSlice.ts", import.meta.url), "utf8");
const modelSelectorSource = readFileSync(new URL("../src/components/settings/ui/ModelInPageSelector.tsx", import.meta.url), "utf8");

assert(
  queriesSource.includes("storeAvailableModels: s.availableModels"),
  "chat model query hook should subscribe to the settings-store model catalog",
);

assert(
  queriesSource.includes("return [...discoveredModels, ...storeAvailableModels, ...customModels]"),
  "chat input model list should merge query/cache models with settings-discovered models",
);

assert(
  queriesSource.includes("initialDataUpdatedAt: cachedModelCatalog.length > 0 ? 0 : undefined") &&
    queriesSource.includes('refetchOnMount: "always"'),
  "chat model query should show cached models immediately but still refresh stale provider catalogs on mount",
);

assert(
  queriesSource.includes("useSettingsStore.getState().setAvailableModels(models);"),
  "chat model query should publish refreshed backend models to the shared settings catalog",
);

assert(
  settingsTypesSource.includes("gemini: 'https://generativelanguage.googleapis.com/v1beta/openai'"),
  "Gemini direct provider URL should target the OpenAI-compatible v1beta endpoint",
);

assert(
  settingsTypesSource.includes("setAvailableModels: (models: ModelInfo[]) => void;"),
  "settings store type should expose setAvailableModels for catalog synchronization",
);

assert(
  queriesSource.includes("contextWindow: backendModel.contextWindow ?? backendModel.maxContextLength") &&
    queriesSource.includes('if (backendModel.supportsVision) capabilities.add("vision");') &&
    queriesSource.includes('if (backendModel.supportsTools) capabilities.add("tools");'),
  "chat model mapping should propagate backend context and capability metadata",
);

assert(
  providerSliceSource.includes("contextWindow: model.contextWindow ?? model.maxContextLength") &&
    providerSliceSource.includes("availableModelsByProvider: groupModelsByProvider(normalizedModels)"),
  "settings catalog updates should normalize backend metadata and refresh provider buckets",
);

assert(
  modelSelectorSource.includes("onClick={() => onModelSelect(model.id)}"),
  "settings model selector should persist raw model ids, not provider-prefixed ids",
);

assert(
  queriesSource.includes('const key = `${model.provider || "unknown"}:${model.id}`'),
  "merged model catalogs should dedupe by provider and model id",
);

console.log("chat model catalog merge verifier passed");
