import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const assistantLogic = read("src/atlas/components/chat/AssistantMessage.logic.ts");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");
const delegation = read("src/atlas/components/chat/AgentDelegationLane.tsx");
const subagent = read("src/atlas/components/chat/SubagentExecutionCard.tsx");
const actionTrace = read("src/atlas/components/chat/AssistantMessageTrace.tsx");
const deepResearch = read("src/atlas/components/chat/DeepResearchRunMessage.tsx");
const disclosure = read("src/atlas/components/chat/executionDisclosure.ts");
const rightPanel = read("src/atlas/components/right-panel/RightPanelInsights.tsx");

assert(assistantLogic.includes("function getExecutionStepKey"), "assistant should centralize stable execution step identity");
assert(assistantLogic.includes("toolBatchId") && assistantLogic.includes("executionId") && assistantLogic.includes("runId"), "live group keys should prefer canonical execution identity");
assert(assistant.includes("executionGroupKeyCacheRef") && assistantLogic.includes("groupKeyCache"), "live group keys should cache child identity across stream updates");
assert(assistantLogic.includes("baseFingerprint") && assistantLogic.includes("fallbackFingerprint") && assistantLogic.includes("immutable group shape"), "groups without IDs should use immutable fingerprint identity before index fallback");
assert(assistantLogic.includes("rememberedKey"), "late canonical identity must not remount an already-visible live group");
assert(!assistantLogic.includes("step.toolCalls.map(t => t.id).join"), "live group keys must not depend on changing child-id lists");
const executionGroupBlock = assistant.match(/<ExecutionGroup[\s\S]*?\/>/)?.[0] || "";
const subagentBlock = assistant.match(/<SubagentExecutionCard[\s\S]*?\/>/)?.[0] || "";
assert(!executionGroupBlock.includes("isStreaming="), "ExecutionGroup must not receive the removed presentation prop");
assert(!subagentBlock.includes("isStreaming="), "SubagentExecutionCard must not receive the removed presentation prop");
const rightPanelExecutionGroupBlock = rightPanel.match(/<ExecutionGroup[\s\S]*?\/>/)?.[0] || "";
assert(!rightPanelExecutionGroupBlock.includes("isStreaming="), "right-panel ExecutionGroup projections must not pass the removed presentation prop");
assert(!assistant.includes("slide-in-from-top-1"), "assistant trace motion must not use directional entrance slides");
assert(assistant.includes("animate-in fade-in duration-150"), "assistant trace updates should use a short opacity-only entrance");
assert(!trace.includes("animationDelay") && !trace.includes("slide-in-from-top-2"), "tool rows must not use index-based staggered waterfall motion");
assert(trace.includes("transitionDisclosure") && disclosure.includes("live result cannot disappear"), "completed live groups must preserve their open surface");
assert(!reasoning.includes("collapseTimeoutRef") && !reasoning.includes("setExpanded(false)"), "reasoning must not force-close after live completion");
assert(reasoning.includes("}, 1000);"), "reasoning timer must align with displayed seconds");
assert(reasoning.includes("transitionDisclosure") && reasoning.includes("toggleDisclosure"), "reasoning disclosure lifecycle should use the shared transition policy");
assert(reasoning.includes("}, [isThinking]);"), "reasoning timer must not restart when disclosure is toggled");
assert(delegation.includes("transitionDisclosure") && delegation.includes("toggleDisclosure"), "delegation lanes must use the shared disclosure transition policy");
// The inline subagent marker is static (no foldout) — it opens the Agents
// panel on click rather than expanding in place, so it has no disclosure state.
assert(subagent.includes("openSubagentInPanel"), "inline subagent marker must open the Agents panel instead of expanding");
assert(trace.includes("transitionDisclosure") && trace.includes("toggleDisclosure"), "grouped execution traces must use the shared disclosure transition policy");
assert(actionTrace.includes("isRunning && \"text-foreground\""), "active action labels should use a stable semantic foreground color");
assert(!actionTrace.includes("text-premium-shimmer"), "execution action labels must not use animated shimmer");
assert(!deepResearch.includes("animate-text-shimmer"), "active research labels must not use animated shimmer");

console.log("execution trace motion remediation verified");
