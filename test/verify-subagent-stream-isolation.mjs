import { readFileSync, existsSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const runnerLifecycle = readFileSync(
  "src-tauri/crates/zen-agent/src/runner/lifecycle.rs",
  "utf8",
);
check(
  "Runner::child drops the live-stream on_event callback entirely",
  !runnerLifecycle.includes("on_event"),
  "the dead tauri::ipc::Channel path must stay deleted",
);

const escalation = readFileSync(
  "src-tauri/crates/zen-agent/src/runner/streaming.rs",
  "utf8",
);
check(
  "should_emit_live_stream_event exists and gates AgentChunk for depth>0",
  /pub\(super\) fn should_emit_live_stream_event\([\s\S]*?LiveEventKind::AgentChunk[\s\S]*?false/.test(escalation),
);
check(
  "partial-saver depth gate present",
  /pub\(super\) fn should_run_partial_saver\([\s\S]*?depth == 0/.test(escalation),
);

const loop = readFileSync("src-tauri/crates/zen-agent/src/runner/turn_loop.rs", "utf8") +
  readFileSync("src-tauri/crates/zen-agent/src/runner/step_exec.rs", "utf8");
check(
  "loop gates per-iteration persist on depth",
  /pub\(super\) fn should_persist_iteration_state/.test(loop),
);

const eventBus = readFileSync(
  "src-tauri/crates/zen-agent/src/event_bus.rs",
  "utf8",
);
check(
  "EventBus default capacity is 4096",
  /Self::new\(4096\)/.test(eventBus),
);

const spawn = [
  "child.rs", "completion.rs", "deps.rs", "failure.rs", "messaging.rs",
  "model_select.rs", "outcome.rs", "params.rs", "tool.rs",
]
  .map((f) => readFileSync(`src-tauri/src/agent/tools/spawn_tools/${f}`, "utf8"))
  .join("");
check(
  "spawn emits SubagentStep instead of inline chat:message",
  /AgentEvent::SubagentStep/.test(spawn) && !spawn.includes("should_emit_inline_chat_message_for_spawn"),
);

const useAgentEvents = readFileSync(
  "src/atlas/hooks/stream/useAgentEvents.ts",
  "utf8",
);
check(
  "frontend drops agent:chunk without chat_id",
  /export function isSubagentChunkRoutable/.test(useAgentEvents) &&
    /isSubagentChunkRoutable\(payload\)/.test(useAgentEvents),
);

const focus = readFileSync(
  "src/atlas/hooks/stream/agentPanelFocus.ts",
  "utf8",
);
check(
  "agents-panel focus dedupes per spawn_id",
  /export function shouldFocusAgentsForSpawn/.test(focus),
);

const smooth = readFileSync(
  "src/atlas/components/chat/SmoothMarkdown.tsx",
  "utf8",
);
check(
  "SmoothMarkdown DEFAULT_TICK_MS bumped to 48",
  /DEFAULT_TICK_MS\s*=\s*48/.test(smooth),
);

if (process.exitCode) {
  console.error("\nOne or more subagent isolation checks failed.");
} else {
  console.log("\nAll subagent stream-isolation checks passed.");
}
