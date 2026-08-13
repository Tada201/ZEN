import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const checkpoint = read("src/atlas/hooks/stream/persistExecutionCheckpoint.ts");
const chunkEvent = read("src/atlas/hooks/stream/useChatChunkEvent.ts");

// The debounced checkpoint must retain enough context to fire itself later.
assert(
  /type PersistedCheckpoint = \{[\s\S]*?chatId: string;[\s\S]*?messageId: string;[\s\S]*?status: TraceStatus;/.test(checkpoint),
  "pending entries must carry chatId+messageId+status so a flush can write without the caller",
);
assert(
  /pending\.set\(key, \{ timer, json, chatId, messageId, status: traceStatus \}\)/.test(checkpoint),
  "scheduled checkpoint must store chatId+messageId+status in the pending entry",
);
assert(
  /export function flushPendingCheckpoints\(\): void/.test(checkpoint),
  "must export a synchronous flushPendingCheckpoints",
);
assert(
  /for \(const \[key, entry\] of pending\)[\s\S]*?clearTimeout\(entry\.timer\)[\s\S]*?writeCheckpoint\(key, entry\.chatId, entry\.messageId, entry\.json, entry\.status\)/.test(checkpoint),
  "flush must clear each pending timer and write it immediately",
);

// A hard WebView2 close fires pagehide without unmounting React; both the
// text buffers and the tool-timeline checkpoints must flush there and on unmount.
assert(
  /flushPendingCheckpoints/.test(chunkEvent) && /from "\.\/persistExecutionCheckpoint"/.test(chunkEvent),
  "useChatChunkEvent must import flushPendingCheckpoints",
);
assert(
  /window\.addEventListener\("pagehide", handlePageHide\)/.test(chunkEvent),
  "must register a pagehide flush handler",
);
assert(
  /window\.removeEventListener\("pagehide", handlePageHide\)/.test(chunkEvent),
  "must remove the pagehide handler on cleanup",
);
const handler = chunkEvent.match(/const handlePageHide = \(\) => \{([\s\S]*?)\};/);
assert(handler, "handlePageHide must exist");
assert(/flushAllChunkBuffers\(\)/.test(handler[1]) && /flushPendingCheckpoints\(\)/.test(handler[1]),
  "pagehide handler must flush both chunk buffers and checkpoints");
// Unmount cleanup must also flush the checkpoints, not just the chunk buffers.
const cleanup = chunkEvent.match(/return \(\) => \{[\s\S]*?flushPendingCheckpoints\(\);\s*\};/);
assert(cleanup, "unmount cleanup must call flushPendingCheckpoints");

console.log("checkpoint pagehide flush contract ok");
