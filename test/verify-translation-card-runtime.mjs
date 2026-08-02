import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/atlas/components/genui/premium/TranslationCard.tsx", import.meta.url), "utf8");

// Regression contract: generated-card confidence is runtime data and must be
// normalized before the presentation helper calls string methods.
assert(source.includes("confidence?: unknown"), "confidence must not be trusted as a string at the card boundary");
assert(source.includes("typeof value === \"number\""), "numeric confidence scores must be supported");
assert(source.includes("typeof value === \"object\""), "structured confidence payloads must be supported");
assert(source.includes("normalizeConfidence(data.confidence)"), "TranslationCard must normalize confidence before rendering");
assert(source.includes("c.toLowerCase()"), "confidence color mapping should remain centralized after normalization");

console.log("translation card runtime contract passed");
