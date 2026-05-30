import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/messageTarget.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "messageTarget.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { findWritableAssistantIndex } = await import(moduleUrl);

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
