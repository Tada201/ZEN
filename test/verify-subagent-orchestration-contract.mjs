import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tree = read("src/atlas/agentRuntime/delegationTree.ts");
const runtime = read("src/atlas/agentRuntime/subagentRuntime.ts");
const scopedStore = read("src/atlas/agentRuntime/scopedSubagentStore.ts");
const card = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const panel = read("src/atlas/components/right-panel/OrchestratorPanel.tsx");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const assistantLogic = read("src/atlas/components/chat/AssistantMessage.logic.ts");
const types = read("src/atlas/components/chat/types.ts");
const agentEvents = read("src/atlas/hooks/stream/useAgentEvents.ts");
const statusPanel = read("src/atlas/components/chat/RunStatusPopover.tsx");
const contextHeader = read("src/atlas/components/chat/WorkspaceContextHeader.tsx");
const chatApi = read("src/api/chatApi.ts");
const lifecycle = read("src-tauri/src/commands/chat/lifecycle.rs");
const tauriLib = read("src-tauri/src/lib.rs");
const spawnTools = read("src-tauri/src/agent/tools/spawn_tools.rs");

assert(tree.includes("export function buildDelegationTree"), "subagent hierarchy must have one canonical tree builder");
assert(tree.includes("parentSpawnId"), "delegations must expose an explicit parent delegation edge");
assert(tree.includes("childToolCallIds"), "delegation ownership must use authoritative child tool ids");
assert(tree.includes("selectOwnedChildTools"), "delegation tree must use the shared child-tool ownership selector");
assert(runtime.includes("const traceMatches = tools.filter((tool) => tool.traceId === record.spawnId)"), "legacy trace-id fallback should remain available for old traces");
assert(!tree.includes("tool.parentAgentId === record.agentId"), "broad parent-agent matching must not attach sibling tools");
assert(tree.includes("Math.min(8"), "corrupt nested traces must have a bounded hierarchy depth");

assert(runtime.includes("parentToolCallId: existing.parentToolCallId || incoming.parentToolCallId"), "partial lifecycle updates must preserve parent ownership");
assert(!runtime.includes("|| tool.parentAgentId === record.agentId"), "runtime child selection must not use broad agent ownership");
assert(!scopedStore.includes("|| tool.parentAgentId === record.agentId"), "scoped child selection must not use broad agent ownership");

assert(card.includes("childAgents?: Step[]"), "subagent cards must accept nested delegated agents");
assert(card.includes("delegationTree?: DelegationTree"), "nested cards must resolve child delegation records from the shared tree");
assert(card.includes("Nested delegated agents"), "nested delegations must render under their parent card");
assert(card.includes("marginInlineStart"), "nested delegations must communicate hierarchy without flooding the timeline");
// The inline marker is intentionally minimal: `Subagent: <name> | <status>`
// with the full trace + child tools living in the Agents panel. Clicking the
// name opens that panel. Child-tool rendering is no longer inline.
assert(card.includes("openSubagentInPanel"), "inline subagent name must open the Agents panel");
assert(card.includes("Subagent:"), "inline marker must label the delegated agent");

assert(panel.includes("buildDelegationTree"), "Agents panel must consume the canonical delegation tree");
assert(panel.includes("selectDelegationChildTools"), "Agents panel must use authoritative child-tool ownership");
assert(panel.includes("Nested subagents"), "Agents panel must preserve nested delegation hierarchy");
assert(panel.includes("flattenSubagentItems"), "focused nested agents must remain selectable in the detail view");
assert(panel.includes("Needs review"), "Agents panel must distinguish incomplete child output");
assert(panel.includes("function ElapsedSubagentTime"), "running subagents must expose a dedicated elapsed timer");
assert(panel.includes("window.setInterval(() => setNow(Date.now()), 1000)"), "elapsed timers should tick at most once per second");
assert(panel.includes("window.clearInterval(interval)"), "elapsed timers must clean up their interval");
assert(panel.includes("avoids re-rendering every subagent row"), "timer updates should stay local to the timer node");
assert(panel.includes("animate-spin"), "running indicators must visibly spin");
assert(!panel.includes("useElapsedNow"), "the panel must not re-render globally for each timer tick");
assert(panel.includes("useIsFetching"), "Agents panel must observe the canonical message query while it hydrates");
assert(panel.includes("getQueryData<Message[]>") && panel.includes("messagesFetching"), "Agents panel must reconcile query data with the live message store");
assert(panel.includes("Loading delegated work…"), "Agents panel must not show an empty state before history loading finishes");
assert(panel.includes("Restoring delegated work…") && panel.includes("Reconciling the saved chat trace"), "Agents panel must disclose reload reconciliation");
assert(panel.includes("Refreshing saved execution history…"), "background history refresh must remain visible without hiding existing work");
assert(panel.includes("Couldn’t restore delegated work") && panel.includes("refetchQueries"), "history failures must not masquerade as an empty Agents panel");
assert(panel.includes("Reload reconciliation:") && panel.includes("recoveryState === \"stale\""), "recovered interrupted subagents must be identified honestly");
assert(panel.includes("function isSubagentRunning"), "stale recovered runs must not be counted as actively running");
assert(agentEvents.includes("existing?.subagent?.timestamp ?? timestamp"), "subagent start timestamps must survive progress updates");
assert(statusPanel.includes("collectSubagents"), "run status must consume canonical subagent records");
assert(statusPanel.includes("SubagentTimer") && statusPanel.includes("setInterval"), "run status must show a live subagent timer");
assert(statusPanel.includes("subagent.agentName") && statusPanel.includes("subagent.task"), "run status must show the subagent name and task");
assert(statusPanel.includes("Stop") && statusPanel.includes("cancelSubagent"), "run status must expose a per-subagent stop control");
assert(contextHeader.includes("<RunStatusPopover messages={messages} isStreaming={isStreaming} />"), "the status popover must receive the active chat timeline");
assert(chatApi.includes('cancelSubagent:') && chatApi.includes('"cancel_subagent"'), "subagent cancellation must use a typed frontend API");
assert(lifecycle.includes("pub async fn cancel_subagent") && lifecycle.includes("subagent_cancellation_tokens"), "backend cancellation must target one child token");
assert(tauriLib.includes("commands::chat::cancel_subagent"), "subagent cancellation must be registered with Tauri");
assert(spawnTools.includes("let terminal_status = if was_cancelled") && spawnTools.includes('status: terminal_status.to_string()'), "user-stopped subagents must finish as cancelled rather than failed");

assert(assistant.includes("buildDelegationTree"), "assistant rendering must consume the canonical delegation tree");
assert(assistantLogic.includes("parentSpawnId"), "nested subagent rows must be removed from the flat parent timeline");
assert(assistant.includes("childrenByParent"), "parent cards must receive their nested delegation children");
assert(assistant.includes("childToolCalls={message.toolCalls || []}"), "child selection must happen centrally rather than through an ad hoc filter");

assert(types.includes("childToolCallIds?: string[]"), "persisted subagent records must retain child tool relationships");

console.log("subagent orchestration contract ok");
