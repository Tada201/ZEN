import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

// Rule 2 — Subagent output MUST NOT flood the parent chat. Subagent rows
// show delegation status + final summary in the parent chat; child-agent
// token deltas / prompt text / full transcripts go to the dedicated agents
// panel (or stay behind an explicit diagnostic disclosure). The principal
// failure mode is a child-agent `agent:chunk` payload lacking a real chat
// id racing the parent's own `chat:chunk` stream — visible stutter on the
// user-visible timeline. This verifier pins every layer of that contract.

const agentEventsSource = readFileSync(
  new URL("../src/atlas/hooks/stream/useAgentEvents.ts", import.meta.url),
  "utf8",
);
const delegationLaneSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url),
  "utf8",
);
const chatFixturesSource = readFileSync(
  new URL("./chat-fixtures.json", import.meta.url),
  "utf8",
);
const subagentBatchContractSource = readFileSync(
  new URL("./verify-subagent-batch-contract.mjs", import.meta.url),
  "utf8",
);

// ── 2a. Routing gate ──
// `isSubagentChunkRoutable` decides whether a subagent chunk enters the
// buffer. It MUST be a named export (so vitest can unit-test it directly)
// and MUST require a real, non-empty string chat id — snake_case OR
// camelCase, never looser than that.
assert(
  agentEventsSource.includes("export function isSubagentChunkRoutable"),
  "isSubagentChunkRoutable must be a named export so the chunk-routing contract is unit-testable",
);
assert(
  agentEventsSource.includes('typeof payload.chat_id === "string"') &&
    agentEventsSource.includes('typeof payload.chatId === "string"'),
  "isSubagentChunkRoutable must inspect both snake_case chat_id and camelCase chatId so every payload variant is honored",
);
assert(
  agentEventsSource.includes("return Boolean(fromSnake || fromCamel)"),
  "isSubagentChunkRoutable must require a real non-empty string chat id (not just truthy field presence)",
);

// ── 2b. Listener hardening ──
// The agent:chunk listener must drop un-routable payloads before they can
// reach the chat store; otherwise they race the parent's own chat:chunk
// buffer and cause the visible stutter described in RULES.md.
assert(
  agentEventsSource.includes("if (!isSubagentChunkRoutable(payload))"),
  "agent:chunk listener must drop un-routable subagent payloads before they race the parent's chat:chunk stream",
);

// ── 2c. Per-chat chunk buffer ──
// Subagent chunks must be buffered per chat id and flushed in a single
// rAF batch so the parent's message list stays consistent and the
// chat:chunk buffer never mixes child-agent deltas into parent messages.
assert(
  agentEventsSource.includes("agentChunkBufferRef") &&
    agentEventsSource.includes("bufferAgentChunk(") &&
    agentEventsSource.includes("flushAgentChunkBuffer"),
  "agent:chunk payloads must be buffered per chat id and flushed in a single rAF batch, never inline-spliced into the parent store",
);

// ── 2d. Agents-panel focus ──
// Subagent spawns must drive the dedicated agents panel (right-rail
// OrchestratorPanel) so the parent chat timeline only carries a delegation
// summary row — never child-agent transcript content.
assert(
  agentEventsSource.includes("focusActiveAgentsPanel") &&
    agentEventsSource.includes("shouldFocusAgentsForSpawn("),
  "subagent spawn events must focus the dedicated Agents panel via shouldFocusAgentsForSpawn / focusActiveAgentsPanel",
);
assert(
  agentEventsSource.includes("syncAgentSpawnToActivity") &&
    agentEventsSource.includes("syncAgentCompleteToActivity") &&
    agentEventsSource.includes("syncAgentHandoffToActivity"),
  "subagent lifecycle events must be synced to the dedicated agents activity panel, not inlined into the chat transcript",
);

// ── 2e. Delegation lane in the parent chat ──
// AgentDelegationLane (the row that DOES appear in the chat) must read a
// pre-computed compact preview from the model and cap any in-flight text at
// a sane character ceiling — never expose the full transcript inline. The
// source reads `lane.compactLivePreview`, then slices it at 260 into a
// `conciseLivePreview` rendering variable; both substrings are expected.
assert(
  delegationLaneSource.includes("lane.compactLivePreview") &&
    delegationLaneSource.includes("livePreview.length > 260") &&
    delegationLaneSource.includes(".slice(0, 260)") &&
    delegationLaneSource.includes("conciseLivePreview"),
  "AgentDelegationLane must rely on a pre-computed compactLivePreview from the model, slice it to <= 260 chars, and render `conciseLivePreview` so the parent chat never receives the full transcript",
);
assert(
  delegationLaneSource.includes("Delegated to") &&
    delegationLaneSource.includes("{lane.agentName}") &&
    delegationLaneSource.includes("lane.resultSummary"),
  "AgentDelegationLane must render 'Delegated to {agentName}' plus the lane resultSummary, never raw spawn ids or full transcripts",
);

// ── 2f. Coverage for back-compat with existing contract test ──
assert(
  subagentBatchContractSource.includes("spawn?.spawnId") &&
    subagentBatchContractSource.includes("failedAgents"),
  "the dedicated OrchestratorPanel contract (failedAgents, spawn?.spawnId) must stay green while the new isolation rules are added",
);

// ── 2g. Fixture coverage ──
// A test_subagent_routing fixture must exist so the parent-chat-vs-agents-
// panel split is reproducible from the chat-fixtures.json streaming path.
assert(
  chatFixturesSource.includes("\"test_subagent_routing\""),
  "chat-fixtures.json must include a test_subagent_routing sequence so the parent-vs-dedicated-panel split is fixture-testable",
);
assert(
  chatFixturesSource.includes("\"agent:chunk\"") &&
    chatFixturesSource.includes("\"agent:spawn\"") &&
    chatFixturesSource.includes("\"agent:complete\""),
  "test_subagent_routing fixture must exercise agent:spawn / agent:chunk / agent:complete so the routing and isolation paths are both proven",
);

console.log("subagent timeline isolation verifier passed");
