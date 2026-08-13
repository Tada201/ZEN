import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const assistantSource = readFileSync(
  new URL('../src/atlas/components/chat/AssistantMessage.tsx', import.meta.url),
  'utf8',
);
const traceSource = readFileSync(
  new URL('../src/atlas/components/chat/AgentExecutionTrace.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx', import.meta.url),
  'utf8',
);
const panelModelSource = readFileSync(
  new URL('../src/components/widgets/orchestrator/agentOrchestratorModel.ts', import.meta.url),
  'utf8',
);
const liveSessionSource = readFileSync(
  new URL('../src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx', import.meta.url),
  'utf8',
);

assert(
  assistantSource.includes('function isVisibleChatActionStep') &&
    assistantSource.includes('step.kind === "approval_request"') &&
    assistantSource.includes('step.kind === "clarification_request"') &&
    assistantSource.includes('step.kind === "chat_status"') &&
    !assistantSource.includes('step.kind === "agent_chunk" ||'),
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

assert(
  liveSessionSource.includes('Agent lanes') &&
    liveSessionSource.includes('Recent tools') &&
    /const\s+sessionMessages\s*=\s*useChatStore\(s\s*=>[\s\S]*?activeSessionId\s*\?\s*s\.sessionMessages\[activeSessionId\]\s*\?\?\s*EMPTY_MESSAGES\s*:\s*EMPTY_MESSAGES/.test(panelSource),
  'right panel should remain the detailed live execution surface',
);

console.log('chat orchestration compact mode verifier passed');
