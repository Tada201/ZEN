import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lane = readFileSync("src/atlas/components/chat/AgentDelegationLane.tsx", "utf8");
const laneModel = readFileSync("src/atlas/components/chat/agentDelegationLaneModel.ts", "utf8");
const trace = readFileSync("src/atlas/components/chat/AgentExecutionTrace.tsx", "utf8");
const subagent = readFileSync("src/atlas/components/chat/SubagentExecutionCard.tsx", "utf8");

assert(lane.includes("useEffect") && lane.includes("transitionDisclosure"), "delegation lanes should reconcile lifecycle transitions through the shared policy");
assert(lane.includes("disclosureStateRef") && lane.includes("createDisclosureState"), "delegation lanes should own one shared disclosure state");
assert(lane.includes("toggleDisclosure(disclosureStateRef.current"), "manual delegation disclosure should override automatic lifecycle behavior");
assert(lane.includes('aria-expanded={canExpand ? isExpanded : undefined}'), "delegation disclosure should expose expanded state");
assert(lane.includes("aria-busy={isRunning}"), "running delegation should expose busy state");
assert(lane.includes('role="status"'), "delegation status should be announced structurally");
assert(lane.includes("motion-reduce:transition-none"), "delegation chevron should respect reduced motion");
assert(lane.includes("Live output") && lane.includes("max-h-64"), "delegation transcript should be labeled and scroll bounded");
assert(lane.includes("whitespace-pre-wrap") && lane.includes("break-words"), "delegation transcript should wrap safely in narrow surfaces");
assert(laneModel.includes("spawnId") && laneModel.includes("batchId"), "delegation model should preserve stable execution identity");
assert(trace.includes("bare") && trace.includes("single foldout"), "child tool traces should remain behind the parent delegation disclosure");
assert(trace.includes("execution-context-summary") && trace.includes("Execution lanes"), "inline traces should expose centralized agent and batch context");
assert(subagent.includes("aria-label=") && subagent.includes("motion-reduce:transition-none"), "subagent summary should retain accessible disclosure and reduced motion");

const checkpoint = readFileSync("src/atlas/hooks/stream/persistExecutionCheckpoint.ts", "utf8");
assert(checkpoint.includes("projectStepsForPersistence"), "active checkpoints should reuse the canonical safe persistence projection");
assert(checkpoint.includes("temp-assistant-"), "active checkpoints must reject optimistic assistant ids");
assert(checkpoint.includes("CHECKPOINT_DELAY_MS"), "active checkpoints should be throttled to avoid one database write per event");

console.log("execution trace delegation UX verified");
