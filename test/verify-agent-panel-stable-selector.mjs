import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(
  new URL('../src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx', import.meta.url),
  'utf8',
);
const modelSource = readFileSync(
  new URL('../src/components/widgets/orchestrator/agentOrchestratorModel.ts', import.meta.url),
  'utf8',
);

assert(modelSource.includes('export const EMPTY_MESSAGES: Message[] = [];'), 'AgentOrchestratorPanel should use a stable empty message array');
assert(
  source.includes('s.sessionMessages[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES'),
  'AgentOrchestratorPanel store selector should not allocate a new empty array per snapshot',
);
assert(!source.includes('s.sessionMessages[activeSessionId] ?? []'), 'AgentOrchestratorPanel must not return fresh [] from Zustand selector');

console.log('agent panel stable selector verifier passed');
