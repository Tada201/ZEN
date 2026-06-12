import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const utilityPath = new URL("../src/atlas/lib/toolProtocolText.ts", import.meta.url);
const chunkBufferPath = new URL("../src/atlas/hooks/stream/chatChunkBuffer.ts", import.meta.url);
const voiceEventsPath = new URL("../src/atlas/components/voice/useVoiceChatEvents.ts", import.meta.url);
const voiceTextPath = new URL("../src/atlas/components/voice/voiceTextUtils.ts", import.meta.url);
const runnerPath = new URL("../src-tauri/src/agent/runner/loop.rs", import.meta.url);
const helpersPath = new URL("../src-tauri/src/agent/runner/helpers.rs", import.meta.url);
const chatTypesPath = new URL("../src/atlas/components/chat/types.ts", import.meta.url);

const utilitySource = readFileSync(utilityPath, "utf8");
const chunkBufferSource = readFileSync(chunkBufferPath, "utf8");
const voiceEventsSource = readFileSync(voiceEventsPath, "utf8");
const voiceTextSource = readFileSync(voiceTextPath, "utf8");
const runnerSource = readFileSync(runnerPath, "utf8");
const helpersSource = readFileSync(helpersPath, "utf8");
const chatTypesSource = readFileSync(chatTypesPath, "utf8");

const transpiled = ts.transpileModule(utilitySource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: "toolProtocolText.ts",
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { filterToolProtocolStream, stripToolProtocolText } = await import(moduleUrl);

const first = filterToolProtocolStream("I will check.\n```js");
assert.equal(first.visible, "I will check.\n");
assert.equal(first.pending, "```js");

const second = filterToolProtocolStream(
  'on\n{"tool":"tool_list","arguments":{"query":"board"}}\n```\nDone.',
  first.pending,
);
assert.equal(second.visible, "\nDone.");
assert.equal(second.pending, "");

assert.equal(
  stripToolProtocolText('Before\n```json\n{"tool":"manage_board","args":{}}\n```\nAfter'),
  "Before\n\nAfter",
);
assert.equal(stripToolProtocolText('```json\n{"name":"Zen"}\n```'), '```json\n{"name":"Zen"}\n```');

assert(chunkBufferSource.includes("filterToolProtocolStream"));
assert(chunkBufferSource.includes("stripToolProtocolText(content)"));
assert(chunkBufferSource.includes("The streamed steps are the chronological source of truth"));
assert(!chunkBufferSource.includes("remove subsequent partial text steps"));
assert(voiceEventsSource.includes("rawResponseRef.current += delta"));
assert(voiceTextSource.includes("(?:```|$)"));
assert(voiceTextSource.includes("call_[a-z0-9_-]+"));
assert(runnerSource.includes("visible_response_content = strip_text_tool_call_blocks"));
assert(helpersSource.includes("fn strips_tool_protocol_but_keeps_commentary"));
assert(chatTypesSource.includes('role === "assistant" ? stripToolProtocolText(rawContent)'));

console.log("tool protocol visibility verifier passed");
