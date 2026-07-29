import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const llmTypes = readFileSync(new URL("../src-tauri/src/llm/mod.rs", import.meta.url), "utf8");
assert.match(llmTypes, /ToolCallDelta\s*\{/);
assert.match(llmTypes, /ToolCallReady\s*\{/);
assert.match(llmTypes, /arguments_snapshot:\s*String/);

for (const path of [
  "../src-tauri/src/llm/openai_compat/stream.rs",
  "../src-tauri/src/llm/lmstudio/chat.rs",
  "../src-tauri/src/llm/anthropic.rs",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /LlmChunk::ToolCallDelta/);
  assert.match(source, /LlmChunk::ToolCallReady/);
  assert.match(source, /ready_emitted/);
  assert.match(source, /arguments_snapshot/);
}

const runner = readFileSync(new URL("../src-tauri/src/agent/runner/escalation.rs", import.meta.url), "utf8");
// The runner emits phases via the ChatStatusPhase named constants (not inline
// string literals), so we match the constant form and separately pin the
// constant→value mapping in chat_status.rs below.
assert.match(runner, /ChatStatusPhase::TOOL_CALL_STREAMING\.to_string\(\)/);
assert.match(runner, /ChatStatusPhase::TOOL_CALL_READY\.to_string\(\)/);
assert.match(runner, /"toolCallPreview"/);

// Pin the string→constant mapping so a backend rename of the phase value can't
// silently desync what the frontend expects (CHAT_STATUS_PHASES.ToolCallStreaming
// === "tool_call_streaming").
const chatStatus = readFileSync(new URL("../src-tauri/src/agent/chat_status.rs", import.meta.url), "utf8");
assert.match(chatStatus, /TOOL_CALL_STREAMING:\s*&?'static str\s*=\s*"tool_call_streaming"/);
assert.match(chatStatus, /TOOL_CALL_READY:\s*&?'static str\s*=\s*"tool_call_ready"/);

// The frontend consumes phases via the CHAT_STATUS_PHASES camelCase constants
// (defined in src/api/chatStatus.ts), not the snake_case literals — so we match
// the constant form here, mirroring the backend ChatStatusPhase pinning above.
const assistant = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
assert.match(assistant, /CHAT_STATUS_PHASES\.ToolCallStreaming/);
assert.match(assistant, /CHAT_STATUS_PHASES\.ToolCallReady/);

const trace = readFileSync(new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url), "utf8");
assert.match(trace, /Preparing \$\{preview\?\.toolName/);
assert.match(trace, /Tool call"\} ready/);
assert.match(trace, /argumentsPreview/);

const ledger = readFileSync(new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url), "utf8");
assert.match(ledger, /tool-preview:/);
assert.match(ledger, /CHAT_STATUS_PHASES\.ToolCallStreaming/);
assert.match(ledger, /CHAT_STATUS_PHASES\.ToolCallReady/);

console.log("tool-call preview streaming verifier passed");
