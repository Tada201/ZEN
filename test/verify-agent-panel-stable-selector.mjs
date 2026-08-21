import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

// The legacy `src/components/widgets/orchestrator/` panel was retired; the
// Agents panel (OrchestratorPanel) is the only live delegation surface, so the
// stable-selector contract now applies to it.
const source = readFileSync(
  new URL('../src/atlas/components/right-panel/OrchestratorPanel.tsx', import.meta.url),
  'utf8',
);

assert(source.includes('const EMPTY_MESSAGES: Message[] = [];'), 'Agents panel should use a stable empty message array');
assert(
  source.includes('state.sessionMessages[activeChatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES'),
  'Agents panel store selector should not allocate a new empty array per snapshot',
);
assert(!source.includes('state.sessionMessages[activeChatId] ?? []'), 'Agents panel must not return fresh [] from Zustand selector');

console.log('agent panel stable selector verifier passed');
