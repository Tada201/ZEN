import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const assistantSource = readFileSync(
  new URL('../src/atlas/components/chat/AssistantMessage.tsx', import.meta.url),
  'utf8',
);
const assistantLogicSource = readFileSync(
  new URL('../src/atlas/components/chat/AssistantMessage.logic.ts', import.meta.url),
  'utf8',
);
const traceSource = readFileSync(
  new URL('../src/atlas/components/chat/AgentExecutionTrace.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../src/atlas/components/right-panel/OrchestratorPanel.tsx', import.meta.url),
  'utf8',
);

assert(
  assistantLogicSource.includes('function isVisibleChatActionStep') &&
    assistantLogicSource.includes('step.kind === "approval_request"') &&
    assistantLogicSource.includes('step.kind === "clarification_request"') &&
    assistantLogicSource.includes('step.kind === "chat_status"') &&
    !assistantLogicSource.includes('step.kind === "agent_chunk" ||'),
  'assistant chat should only render concise status and user-action orchestration rows',
);

assert(
  assistantSource.includes('<ExecutionGroup') &&
    assistantSource.includes('preferCompact'),
  'assistant chat should render tool execution traces through the compact ExecutionGroup surface',
);

assert(
  traceSource.includes('preferCompact = false') &&
    traceSource.includes('importantToolCalls') &&
    /const shouldDefaultOpen = preferCompact[\s\S]*?importantToolCalls/.test(traceSource) &&
    traceSource.includes('normalizedToolCalls.map') &&
    /tool\.status === "awaiting_approval"[\s\S]*?tool\.status === "error"/.test(traceSource) &&
    traceSource.includes('tool.recoveryState === "stale"'),
  'agent execution trace should force-open on approval/error/running while always rendering the full expandable tool list',
);

// The right panel remains the detailed delegation surface: the retired legacy
// orchestrator widget is gone, so this asserts the Agents panel keeps a stable
// message selector and its own running/ended breakdown.
assert(
  panelSource.includes('Running ·') &&
    panelSource.includes('Ended ·') &&
    /const\s+messages\s*=\s*useChatStore\(\(state\)\s*=>[\s\S]*?activeChatId\s*\?\s*state\.sessionMessages\[activeChatId\]\s*\?\?\s*EMPTY_MESSAGES\s*:\s*EMPTY_MESSAGES/.test(panelSource),
  'right panel should remain the detailed live execution surface',
);

console.log('chat orchestration compact mode verifier passed');
