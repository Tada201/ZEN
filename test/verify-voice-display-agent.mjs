import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const resource = JSON.parse(readFileSync(new URL("../src-tauri/resources/agents/voice_display.json", import.meta.url), "utf8"));
const loopSource = readFileSync(new URL("../src-tauri/src/agent/runner/loop.rs", import.meta.url), "utf8");
const runnerSource = readFileSync(new URL("../src-tauri/src/agent/runner/voice_display.rs", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("../src-tauri/src/commands/chat.rs", import.meta.url), "utf8");

assert.deepEqual(resource.tool_ids, ["manage_board"], "voice display agent must remain render-only");
assert(loopSource.includes("spawn_voice_display_agent"), "completed voice runs must launch the display agent");
assert(runnerSource.includes('format!("voice-display:{}"'), "display events must use an isolated synthetic chat id");
assert(runnerSource.includes('HashSet::from(["manage_board".to_string()])'), "runtime allowlist must enforce board-only tools");
assert(runnerSource.includes("tokio::spawn"), "display rendering must not block main response completion");
assert(runnerSource.includes("voiceDisplayAgentContextTokens") && runnerSource.includes("voiceDisplayAgentPrompt"), "voice display settings must affect runtime behavior");
assert(chatSource.includes('get("voiceDisplayAgentEnabled")') && chatSource.includes('get("voiceDisplayAgentModel")'), "chat command must read persisted frontend setting keys");

console.log("voice display agent wiring verified");
