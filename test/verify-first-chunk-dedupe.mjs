import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/useChatChunkEvent.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");

assert(
  source.includes("firstChunkTypesSent") &&
    source.includes("firstChunkTypeSentKey(chatId, chunkType)") &&
    !source.includes("firstTextChunkSent"),
  "first-chunk dedupe must be keyed by chat and chunk type, not text-only",
);

assert(
  source.includes('return type === "reasoning" ? "thought" : type || "text";'),
  "reasoning chunk aliases should flow through the thought/reasoning path",
);

assert(
  source.includes("canAppendToExisting ? existing.delta : \"\""),
  "mixed chunk-type buffer flushes must not carry the old type's delta into the new buffer",
);

const strippedSource = source.replace(/^import .+;\r?\n/gm, "");
const transpiled = ts.transpileModule(strippedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "useChatChunkEvent.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { firstChunkTypeSentKey, normalizeChatChunkType } = await import(moduleUrl);

assert.equal(normalizeChatChunkType(undefined), "text");
assert.equal(normalizeChatChunkType("text"), "text");
assert.equal(normalizeChatChunkType("thought"), "thought");
assert.equal(normalizeChatChunkType("reasoning"), "thought");

const sent = new Set();
sent.add(firstChunkTypeSentKey("chat-1", normalizeChatChunkType("thought")));

assert.equal(
  sent.has(firstChunkTypeSentKey("chat-1", normalizeChatChunkType("reasoning"))),
  true,
  "late chat:chunk:first reasoning/thought aliases should dedupe after chat:chunk wins the race",
);
assert.equal(
  sent.has(firstChunkTypeSentKey("chat-1", normalizeChatChunkType("text"))),
  false,
  "dedupe for one chunk type should not suppress a different chunk type",
);

console.log("first chunk dedupe verifier passed");
