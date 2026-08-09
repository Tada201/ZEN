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
    /const compactToolCalls = preferCompact[\s\S]*?importantToolCalls/.test(traceSource) &&
    /const renderedToolCalls = preferCompact[\s\S]*?status === "running"/.test(traceSource) &&
    traceSource.includes('tool.status === "awaiting_approval" || tool.status === "error"'),
  'agent execution trace should support compact chat mode while preserving approval/error/running tool rows',
);

assert(
  liveSessionSource.includes('Agent lanes') &&
    liveSessionSource.includes('Recent tools') &&
    /const\s+sessionMessages\s*=\s*useChatStore\(s\s*=>[\s\S]*?activeSessionId\s*\?\s*s\.sessionMessages\[activeSessionId\]\s*\?\?\s*EMPTY_MESSAGES\s*:\s*EMPTY_MESSAGES/.test(panelSource),
  'right panel should remain the detailed live execution surface',
);

console.log('chat orchestration compact mode verifier passed');
