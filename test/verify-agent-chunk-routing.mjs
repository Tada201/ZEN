import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const eventBus = readFileSync("src-tauri/src/agent/event_bus.rs", "utf8");
const escalation = readFileSync("src-tauri/src/agent/runner/escalation.rs", "utf8");
const loop = readFileSync("src-tauri/src/agent/runner/loop.rs", "utf8");
const events = readFileSync("src/api/events.ts", "utf8");
const useAgentEvents = readFileSync("src/atlas/hooks/stream/useAgentEvents.ts", "utf8");
const ledger = readFileSync("src/atlas/hooks/stream/agentActionLedger.ts", "utf8");
const laneModel = readFileSync("src/atlas/components/chat/agentDelegationLaneModel.ts", "utf8");
const lane = readFileSync("src/atlas/components/chat/AgentDelegationLane.tsx", "utf8");

assert(eventBus.includes("AgentChunk(AgentChunkPayload)"), "backend should define AgentChunk event");
assert(eventBus.includes('"agent:chunk"'), "backend should expose agent:chunk event name");
assert(escalation.includes("AgentChunkPayload"), "runner stream callback should import agent chunk payload");
assert(escalation.includes("AgentEvent::AgentChunk"), "runner stream callback should emit agent chunks");
assert(loop.includes("current_agent.id == \"generalist\""), "generalist/root turns should not emit noisy agent chunks");
assert(events.includes("AgentChunkEventPayload"), "frontend typed event payload should include agent chunks");
assert(events.includes('"agent:chunk": AgentChunkEventPayload'), "typed event map should include agent:chunk");
assert(useAgentEvents.includes('listenAppEvent("agent:chunk"'), "frontend should listen for agent chunks");
assert(ledger.includes('kind === "agent_chunk"'), "ledger should normalize agent chunk steps");
assert(ledger.includes("completeMatchingAgentChunkSteps"), "agent complete should close live chunk rows");
assert(ledger.includes("stripDuplicateResultSummary"), "ledger should avoid showing final result text that already streamed");
assert(laneModel.includes("liveContent"), "delegation lane model should expose live content");
assert(laneModel.includes("compactLivePreview"), "delegation lane model should expose compact transcript preview");
assert(laneModel.includes("hasTranscript"), "delegation lane model should mark expandable transcript state");
assert(lane.includes("Live output"), "delegation lane should render live output");
assert(lane.includes("aria-expanded"), "delegation lane transcript should be expandable");
assert(lane.includes("max-h-64"), "expanded transcript should be scroll bounded");

console.log("agent chunk routing verified");
