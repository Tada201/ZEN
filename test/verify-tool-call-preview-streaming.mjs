import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const llmTypes = readFileSync(new URL("../src-tauri/src/llm/mod.rs", import.meta.url), "utf8");
assert.match(llmTypes, /ToolCallDelta\s*\{/);
assert.match(llmTypes, /arguments_snapshot:\s*String/);

for (const path of [
  "../src-tauri/src/llm/openai_compat/stream.rs",
  "../src-tauri/src/llm/lmstudio/chat.rs",
  "../src-tauri/src/llm/anthropic.rs",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /LlmChunk::ToolCallDelta/);
  assert.match(source, /arguments_snapshot/);
}

const runner = readFileSync(new URL("../src-tauri/src/agent/runner/escalation.rs", import.meta.url), "utf8");
assert.match(runner, /phase:\s*Some\("tool_call_streaming"\.to_string\(\)\)/);
assert.match(runner, /"toolCallPreview"/);

const assistant = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
assert.match(assistant, /tool_call_streaming/);

const trace = readFileSync(new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url), "utf8");
assert.match(trace, /Preparing \$\{preview\?\.toolName/);
assert.match(trace, /argumentsPreview/);

const ledger = readFileSync(new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url), "utf8");
assert.match(ledger, /tool-preview:/);
assert.match(ledger, /tool_call_streaming/);

console.log("tool-call preview streaming verifier passed");
