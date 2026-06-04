import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const focusSource = readFileSync(
  new URL('../src/atlas/hooks/stream/agentPanelFocus.ts', import.meta.url),
  'utf8',
);
const agentEventsSource = readFileSync(
  new URL('../src/atlas/hooks/stream/useAgentEvents.ts', import.meta.url),
  'utf8',
);
const toolEventsSource = readFileSync(
  new URL('../src/atlas/hooks/stream/useToolEvents.ts', import.meta.url),
  'utf8',
);

assert(
  focusSource.includes('useUIStore.getState()') &&
    focusSource.includes('ui.setActiveRightTab("agents")') &&
    focusSource.includes('ui.setRightPanelOpen(true)'),
  'agent panel focus helper should open the right panel on the agents tab',
);
assert(
  focusSource.includes('!force && ui.rightPanelOpen && ui.activeRightTab !== "agents"') &&
    focusSource.includes('return;'),
  'agent panel focus helper should avoid stealing another active right-panel tab unless forced',
);
assert(
  focusSource.includes('shouldFocusAgentsForTool') &&
    focusSource.includes('payload.agent_id') &&
    focusSource.includes('payload.tool_batch_id'),
  'tool focus gating should detect agent-owned and batch tool execution',
);
assert(
  agentEventsSource.includes('focusActiveAgentsPanel({ force: true });') &&
    agentEventsSource.includes('listenAppEvent("agent:spawn"') &&
    agentEventsSource.includes('listenAppEvent("agent:chunk"') &&
    agentEventsSource.includes('listenAppEvent("agent:handoff"'),
  'agent spawn/chunk/handoff should force the Active Agents panel open',
);
assert(
  toolEventsSource.includes('listenAppEvent("tool:authorization_request"') &&
    toolEventsSource.includes('focusActiveAgentsPanel({ force: true });'),
  'tool approval requests should force the Active Agents panel open',
);
assert(
  toolEventsSource.includes('shouldFocusAgentsForTool(event.payload)') &&
    toolEventsSource.includes('focusActiveAgentsPanel();'),
  'agent-owned or batched tools should open the Active Agents panel conservatively',
);

console.log('agent panel auto focus verifier passed');
