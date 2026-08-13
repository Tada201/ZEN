import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const hook = read("src/atlas/hooks/useStreamingChat.ts");
const api = read("src/api/chatApi.ts");
const mock = read("src/api/mockClient.ts");
const footer = read("src/atlas/components/ChatInputFooter.tsx");
const lifecycle = read("src-tauri/src/commands/chat/lifecycle.rs");
const recovery = read("test/verify-execution-recovery-ux.mjs");

assert.equal(packageJson.scripts["test:execution-recovery-ux"], "node test/verify-execution-recovery-ux.mjs");
assert.equal(packageJson.scripts["test:phase-13-production-controls"], "node test/verify-phase-13-production-controls.mjs");
const aggregate = packageJson.scripts["test:agentic-workbench"];
assert.equal(typeof aggregate, "string", "the agentic workbench aggregate gate must be exposed");
for (const script of [
  "test:execution-trace-authority",
  "test:execution-trace-reload-parity",
  "test:inline-ledger-quality",
  "test:phase-9-10-edge-cases",
  "test:phase-11-subagent-hierarchy",
  "test:phase-12-run-inspector",
  "test:phase-13-production-controls",
  "test:execution-recovery-ux",
  "test:cooperative-pause-contract",
  "test:autonomy-controls-contract",
]) {
  assert(aggregate.includes(`npm run ${script}`), `aggregate gate must include ${script}`);
}

assert(hook.includes("controlRequestRef"), "control requests need stale-response protection");
assert(hook.includes("toast.error(\"Could not stop the response. It may still be running.\")"), "failed stop must not lie about cancellation");
assert(hook.includes("if (requestId !== controlRequestRef.current) return;"), "late control responses must not overwrite newer intent");
assert(!hook.includes("clearChunkTrackingForChat(chatId, {}, {})"), "abort must not pretend empty maps clear the live chunk buffers");
assert(hook.includes("Could not pause the response") && hook.includes("Could not resume the response"), "pause/resume failures must be actionable");
assert(hook.includes("That response has already finished") && hook.includes("That response is no longer running"), "backend no-op controls must not fabricate local state");
assert(api.includes('callCommand<boolean>("abort_chat"') && api.includes('callCommand<boolean>("pause_chat"') && api.includes('callCommand<boolean>("continue_chat"'), "control IPC must report whether a live run accepted the request");
assert(mock.includes("abort_chat: () => true") && mock.includes("pause_chat: () => true") && mock.includes("continue_chat: () => true"), "mock control commands must preserve the boolean contract");
assert(lifecycle.includes("ZenResult<bool>") && lifecycle.includes("Ok(cancelled)"), "backend stop must distinguish accepted cancellation from a no-op");

assert(footer.includes("Pause response at the next safe boundary"));
assert(footer.includes("Resume response"));
assert(footer.includes("Stop paused response"));
assert(lifecycle.includes("control.pause()") && lifecycle.includes("control.resume()"));
assert(lifecycle.includes("token.cancel()"), "stop must cancel the backend execution token");
assert(recovery.includes("markRecoveredMessage") && recovery.includes("Interrupted"), "recovery UX must remain covered by the production gate");

console.log("phase 13 production controls verified");
