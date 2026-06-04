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
  assistantSource.match(/<AgentExecutionTrace[\s\S]*?preferCompact/g)?.length >= 2,
  'assistant chat should render tool execution traces in compact mode',
);

assert(
  traceSource.includes('preferCompact = false') &&
    traceSource.includes('importantToolCalls') &&
    traceSource.includes('preferCompact && importantToolCalls.length === 0') &&
    (traceSource.includes('preferCompact ? importantToolCalls : toolCalls') ||
      traceSource.includes('preferCompact ? importantToolCalls : normalizedToolCalls')),
  'agent execution trace should support compact chat mode while preserving approval/error tool rows',
);

assert(
  liveSessionSource.includes('Agent lanes') &&
    liveSessionSource.includes('Recent tools') &&
    panelSource.includes('useChatStore(s => activeSessionId ? s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES'),
  'right panel should remain the detailed live execution surface',
);

console.log('chat orchestration compact mode verifier passed');
