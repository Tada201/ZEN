import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(
  new URL("../src/atlas/hooks/chat/useSendMessage.ts", import.meta.url),
  "utf8",
);

const optimisticIndex = source.indexOf("setSessionMessages(targetSessionId");
const abortIndex = source.indexOf("await chatApi.abortChat(targetSessionId)");
const freshGuardIndex = source.indexOf("if (!isFreshSession)");

assert(optimisticIndex !== -1, "send path must publish optimistic messages");
assert(abortIndex !== -1, "existing-session send path must retain abort handling");
assert(optimisticIndex < abortIndex, "optimistic messages must be published before abort IPC");
assert(freshGuardIndex !== -1 && freshGuardIndex < abortIndex, "fresh sessions must skip abort IPC");

console.log("fresh-session send sequencing verified");
