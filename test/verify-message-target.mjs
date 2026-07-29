import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { loadSourceModule } from "./test-loader.mjs";

const { findWritableAssistantIndex } = await loadSourceModule("../src/atlas/hooks/stream/messageTarget.ts");

const activeBehindLedger = [
  { id: "user-1", role: "user", content: "test", status: "sent" },
  { id: "assistant-1", role: "assistant", content: "", status: "sending" },
  { id: "system-tool-1", role: "system", content: "tool running", status: "sent" },
];
assert.equal(
  findWritableAssistantIndex(activeBehindLedger),
  1,
  "stream writes should target the sending assistant even when a ledger row follows it",
);

const tempBehindLedger = [
  { id: "user-1", role: "user", content: "test", status: "sent" },
  { id: "temp-assistant-1", role: "assistant", content: "", status: "sent" },
  { id: "system-tool-1", role: "system", content: "tool running", status: "sent" },
];
assert.equal(
  findWritableAssistantIndex(tempBehindLedger),
  1,
  "DB refresh fallback should still target the temp assistant before it is reconciled",
);

assert.equal(
  findWritableAssistantIndex([{ id: "user-1", role: "user", content: "test", status: "sent" }]),
  -1,
  "no assistant should return -1",
);

console.log("message target ok");
