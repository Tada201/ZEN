import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/atlas/components/genui/premium/CitationCard.tsx", import.meta.url), "utf8");

assert(source.includes("authors: unknown"), "authors must not be trusted as an array at the card boundary");
assert(source.includes("function normalizeAuthors"), "citation authors need one normalization owner");
assert(source.includes("Array.isArray(value)"), "array author payloads must remain supported");
assert(source.includes("typeof value === \"string\""), "string author payloads must be supported");
assert(source.includes("normalizeAuthors(data.authors)"), "CitationCard must normalize authors before calling join");
assert(source.includes("authors.join(\", \")"), "rendering should only join the normalized author list");

console.log("citation card runtime contract passed");
