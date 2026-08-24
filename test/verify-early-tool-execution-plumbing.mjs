import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const escalation = readFileSync(new URL("../src-tauri/src/agent/runner/streaming.rs", import.meta.url), "utf8");
assert.match(escalation, /struct EarlyToolExecutionContext/);
assert.match(escalation, /struct EarlyToolExecutionState/);
assert.match(escalation, /mark_started/);
assert.match(escalation, /clear_pending/);
assert.match(escalation, /early_token\.cancel\(\)/);
assert.match(escalation, /token\.child_token\(\)/);
assert.match(escalation, /early_token_for_callback/);
assert.match(escalation, /execute_tools_with_hooks/);
assert.match(escalation, /LlmChunk::ToolCallReady/);
assert.match(escalation, /tokio::spawn\(async move/);
assert.match(escalation, /key_for\(\s*name: &str,\s*args: &serde_json::Value,\s*id: Option<&str>,\s*index: Option<usize>,?\s*\)/s);
assert.match(escalation, /format!\("sig:\{index\}:\{name\}:\{:x\}"/);

const loop = readFileSync(new URL("../src-tauri/src/agent/runner/turn_loop.rs", import.meta.url), "utf8") +
  readFileSync(new URL("../src-tauri/src/agent/runner/step_exec.rs", import.meta.url), "utf8");
assert.match(loop, /EarlyToolExecutionState::new/);
assert.match(loop, /EarlyToolExecutionContext/);
assert.match(loop, /wait_for_result/);
assert.match(loop, /remaining_calls/);
assert.match(loop, /execute_tools_with_hooks/);
assert.match(loop, /EarlyToolExecutionState::key_for\(\s*&tool_call\.name,\s*&tool_call\.args,\s*None,\s*Some\(index\),?\s*\)/s);

const lifecycle = readFileSync(new URL("../src-tauri/src/agent/runner/lifecycle.rs", import.meta.url), "utf8");
assert.match(lifecycle, /impl Clone for Runner/);

console.log("early tool execution plumbing verifier passed");
