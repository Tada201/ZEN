import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(
  new URL('../src/atlas/hooks/stream/useChatChunkEvent.ts', import.meta.url),
  'utf8',
);
const bufferSource = readFileSync(
  new URL('../src/atlas/hooks/stream/chatChunkBuffer.ts', import.meta.url),
  'utf8',
);

assert(bufferSource.includes('function clearChunkTrackingForChat') || bufferSource.includes('export function clearChunkTrackingForChat'), 'stream hook should centralize per-chat chunk tracking cleanup');
assert(
  source.includes('clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);'),
  'stream error/done/reset paths should clear stale chunk tracking',
);
assert(source.includes('let appliedToSendingAssistant = false;'), 'chat:error should track whether it affected a live assistant');
assert(source.includes('if (prev[assistantIdx].status !== "sending") return prev;'), 'chat:error must not mark completed assistant messages as failed');
assert(source.includes('appliedToSendingAssistant = true;'), 'chat:error should only toast when a live assistant was actually failed');
assert(source.includes('if (appliedToSendingAssistant && !recoverable)') && source.includes('toast.error'), 'stale or recoverable chat:error events should not show user-facing error toast');

console.log('stale stream error guard verifier passed');
