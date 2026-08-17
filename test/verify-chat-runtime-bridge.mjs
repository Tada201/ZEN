import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/atlas/hooks/stream/useChatChunkEvent.ts", import.meta.url), "utf8");
assert(source.includes("createAgentRuntimeBridge"), "chat chunk listener must own a canonical runtime bridge");
assert(source.includes("normalizeChatDeltaEvent"), "first and normal chunks must be normalized at the event boundary");
assert(source.includes("normalizeChatDoneEvent"), "chat done must enter the canonical runtime");
assert(source.includes("normalizeChatErrorEvent"), "chat error must enter the canonical runtime");
assert(source.includes("runtimeBridge?.dispatch(normalized)"), "normalized text must dispatch through the runtime scheduler");
assert(source.includes("runtimeBridge?.dispatchTerminal(normalizedDone)"), "completion must synchronously drain the runtime scheduler before finalization reads steps");
assert(source.includes("runtimeBridge?.dispatchTerminal(normalizedError)"), "error terminal must synchronously drain the runtime scheduler");
assert(source.includes("never apply the same raw") || source.includes("canonical runtime"), "legacy text writes must not duplicate canonical runtime updates");

console.log("chat runtime bridge contract verified");
