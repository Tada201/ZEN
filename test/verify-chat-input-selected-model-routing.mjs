import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const inputPath = new URL("../src/atlas/components/PremiumChatInput.tsx", import.meta.url);
const source = readFileSync(inputPath, "utf8");

assert(
  !source.includes("|| models[0]"),
  "chat input must not fall back to the first catalog model when the selected model is missing",
);

assert(
  source.includes("models.find(m => m.id === selectedModelId && m.provider === selectedProvider)") &&
    !source.includes("models.find(m => m.id === selectedModelId)\n      || models[0]"),
  "selected model metadata should only come from an exact provider/model match",
);

assert(
  source.includes("const modelId = selectedModelId || selectedModelInfo?.id") &&
    source.includes("const providerId = selectedProvider || selectedModelInfo?.provider"),
  "send payload should stay pinned to the user-selected provider and model ids",
);

console.log("chat input selected model routing verifier passed");
