import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const llmTypes = readFileSync(new URL("../src-tauri/crates/zen-llm/src/lib.rs", import.meta.url), "utf8");
assert.match(llmTypes, /ToolCallDelta\s*\{/);
assert.match(llmTypes, /ToolCallReady\s*\{/);
assert.match(llmTypes, /arguments_snapshot:\s*String/);

for (const path of [
  "../src-tauri/crates/zen-llm/src/openai_compat/stream.rs",
  "../src-tauri/crates/zen-llm/src/lmstudio/chat.rs",
  // `anthropic.rs` was split into `anthropic/{chat,mapping,mod,wire}.rs`; the
  // streaming half lives in `chat.rs`.
  "../src-tauri/crates/zen-llm/src/anthropic/chat.rs",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /LlmChunk::ToolCallDelta/);
  assert.match(source, /LlmChunk::ToolCallReady/);
  assert.match(source, /ready_emitted/);
  assert.match(source, /arguments_snapshot/);
}

// `runner/escalation.rs` was split by concern; the tool-call preview streaming
// path now lives in `runner/streaming.rs`.
const runner = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/streaming.rs", import.meta.url), "utf8");
// The runner emits phases via the ChatStatusPhase named constants (not inline
// string literals), so we match the constant form and separately pin the
// constant→value mapping in chat_status.rs below.
assert.match(runner, /ChatStatusPhase::TOOL_CALL_STREAMING\.to_string\(\)/);
assert.match(runner, /ChatStatusPhase::TOOL_CALL_READY\.to_string\(\)/);
assert.match(runner, /"toolCallPreview"/);

// Pin the string→constant mapping so a backend rename of the phase value can't
// silently desync what the frontend expects (CHAT_STATUS_PHASES.ToolCallStreaming
// === "tool_call_streaming").
const chatStatus = readFileSync(new URL("../src-tauri/crates/zen-agent/src/chat_status.rs", import.meta.url), "utf8");
assert.match(chatStatus, /TOOL_CALL_STREAMING:\s*&?'static str\s*=\s*"tool_call_streaming"/);
assert.match(chatStatus, /TOOL_CALL_READY:\s*&?'static str\s*=\s*"tool_call_ready"/);

// The frontend consumes the backend tool-preview phases but deliberately does
// NOT render them as timeline rows: the tool card already shows which tool
// runs, so the transient "Preparing X" / "X ready" status is suppressed. Pin
// that suppression so the noisy status rows can't silently return.
const parts = readFileSync(new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url), "utf8");
assert.match(parts, /isSuppressedToolPreviewStatus/);
assert.match(parts, /CHAT_STATUS_PHASES\.ToolCallStreaming/);
assert.match(parts, /CHAT_STATUS_PHASES\.ToolCallReady/);

const trace = readFileSync(new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url), "utf8");
assert.doesNotMatch(trace, /Preparing \$\{preview\?\.toolName/, "tool-preview 'Preparing X' row must not be rendered");
assert.doesNotMatch(trace, /Tool call"\} ready/, "tool-preview 'X ready' row must not be rendered");

const assistant = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
const assistantLogic = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.logic.ts", import.meta.url), "utf8");
assert.doesNotMatch(assistantLogic, /ToolCallStreaming,/, "preview phases must stay out of VISIBLE_CHAT_STATUS_PHASES");
assert.doesNotMatch(assistantLogic, /ToolCallReady,/, "preview phases must stay out of VISIBLE_CHAT_STATUS_PHASES");

console.log("tool-call preview streaming verifier passed");
