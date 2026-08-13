import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const crud = readFileSync(new URL("../src-tauri/src/commands/chat/crud.rs", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/atlas/hooks/stream/persistExecutionCheckpoint.ts", import.meta.url), "utf8");
const queries = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const messageTypes = readFileSync(new URL("../src/atlas/components/chat/types.ts", import.meta.url), "utf8");
const chatApi = readFileSync(new URL("../src/api/chatApi.ts", import.meta.url), "utf8");
const assistant = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");

assert(crud.includes("normalize_trace_checkpoint"), "backend should normalize trace checkpoints");
for (const field of ["trace_version", "trace_status", "saved_at", "steps"]) {
  assert(crud.includes(`\"${field}\"`), `checkpoint envelope should contain ${field}`);
}
assert(crud.includes("trace_status: Option<String>"), "checkpoint command should accept lifecycle status");
assert(crud.includes("queries::update_message_steps(&db, &chat_id, &message_id, &checkpoint)"), "backend should persist its normalized envelope");

for (const status of ["completed", "cancelled", "failed", "interrupted"]) {
  assert(persistence.includes(`\"${status}\"`), `frontend should support ${status} checkpoint status`);
}
assert(persistence.includes("chatApi.updateMessageSteps(chatId, messageId, json, status)"), "frontend should send checkpoint status to the backend");
assert(persistence.includes("tracePersistence: \"failed\""), "checkpoint failures should become visible runtime state");
assert(persistence.includes("flushPendingCheckpoints"), "pending checkpoints should flush on lifecycle teardown");

assert(queries.includes("const rawSteps = msg.stepsJson ?? parsedMetadata?.executionSteps"), "reload hydration should read persisted trace envelopes");
assert(queries.includes("parseArray(rawSteps)"), "reload hydration should unwrap backend checkpoint envelopes");
assert(messageTypes.includes("Array.isArray(parsed.steps)"), "legacy normalizer should accept versioned checkpoint envelopes");
assert(chatApi.includes("traceStatus?"), "typed chat API should expose trace status");
assert(
  assistant.includes("tracePersistencePresentation") &&
    assistant.includes('context: "persistence"') &&
    assistant.includes("tracePersistencePresentation.title"),
  "the normal timeline should surface persistence failures through the canonical presentation model",
);

console.log("trace persistence contract ok");
