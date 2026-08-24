import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const serviceSource = readFileSync(
  new URL("../src-tauri/src/services/tool.rs", import.meta.url),
  "utf8",
);
const commandSource = readFileSync(
  new URL("../src-tauri/src/commands/agent.rs", import.meta.url),
  "utf8",
);
const eventsSource = readFileSync(
  new URL("../src/api/events.ts", import.meta.url),
  "utf8",
);
const toolEventsSource = readFileSync(
  new URL("../src/atlas/hooks/stream/useToolEvents.ts", import.meta.url),
  "utf8",
);
const dispatchSource = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/src/agent/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");

assert(serviceSource.includes("pub struct PendingToolApproval"), "pending approvals should store more than a bare boolean");
assert(serviceSource.includes("chat_id: String") && serviceSource.includes("tool_name: String"), "pending approvals should retain chat and tool identity");
assert(serviceSource.includes("args_hash") && serviceSource.includes("args_snapshot"), "approval requests should snapshot approved arguments");
assert(serviceSource.includes("pub enum ToolApprovalOutcome"), "approval flow should distinguish deny, timeout, cancel, and mismatch");
assert(serviceSource.includes("ToolApprovalOutcome::TimedOut") && serviceSource.includes('"tool:authorization_timeout"'), "approval timeout should emit a dedicated event");
assert(serviceSource.includes("ToolApprovalOutcome::ArgumentMismatch"), "approval should reject mismatched argument hashes");
assert(commandSource.includes("ToolApprovalDecision") && commandSource.includes("args_hash"), "resolve_tool_approval should return the stored approval hash");
assert(commandSource.includes("remember_exact") && commandSource.includes("state.session_permissions") && commandSource.includes("format!(\"{}:{}\", tx.tool_name, tx.args_hash)"), "resolve_tool_approval should support exact session-scoped approval memory");
assert(commandSource.includes("Tool approval is missing, expired, or already resolved"), "stale approval resolution should fail explicitly instead of reporting false success");
assert(eventsSource.includes("ToolAuthorizationTimeoutEventPayload") && eventsSource.includes('"tool:authorization_timeout"'), "frontend event map should type authorization timeout events");
assert(toolEventsSource.includes('listenAppEvent("tool:authorization_timeout"') && toolEventsSource.includes('"Tool approval timed out."'), "frontend should render timeout as a visible tool error");
assert(dispatchSource.includes("approval_outcome.error_message()"), "runner should return specific approval outcome errors to the model");

const toolsApiSource = readFileSync(
  new URL("../src/api/toolsApi.ts", import.meta.url),
  "utf8",
);
const approvalUiSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url),
  "utf8",
);
const approvalActionsSource = readFileSync(
  new URL("../src/atlas/components/chat/approvalActions.ts", import.meta.url),
  "utf8",
);
const approvalCenterSource = readFileSync(
  new URL("../src/atlas/components/chat/right-panel/ApprovalCenter.tsx", import.meta.url),
  "utf8",
);
const approvalModelSource = readFileSync(
  new URL("../src/atlas/components/chat/right-panel/approvalCenterModel.ts", import.meta.url),
  "utf8",
);
assert(toolsApiSource.includes("rememberExact = false") && toolsApiSource.includes("rememberExact"), "frontend tools API should pass exact approval memory intent");
assert(approvalUiSource.includes("Always allow exact") && approvalUiSource.includes("resolveToolApproval(toolCallId, true, true)"), "approval UI should expose explicit exact-session approval");
assert(approvalActionsSource.includes("toolsApi.resolveApproval") && approvalActionsSource.includes("rememberExact = false"), "approval resolution should have one typed frontend owner");
assert(approvalCenterSource.includes("Approve once") && approvalCenterSource.includes("Remember exact") && approvalCenterSource.includes("Permission decisions remain backend-owned"), "approval center should expose distinct actions without duplicating policy");
assert(approvalCenterSource.includes("No safe argument preview is available") && !approvalCenterSource.includes("JSON.stringify(toolCall.input"), "approval center should not fall back to raw tool arguments");
assert(approvalModelSource.includes("toolCall.status !== \"awaiting_approval\"") && approvalModelSource.includes("seen.has(toolCall.id)"), "approval center should derive and deduplicate pending tool calls from the live ledger");

console.log("tool approval hardening ok");
