import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src-tauri/src/db/mod.rs", import.meta.url), "utf8");
const queries = readFileSync(new URL("../src-tauri/crates/zen-db/src/queries/execution_trace.rs", import.meta.url), "utf8");
const command = readFileSync(new URL("../src-tauri/src/commands/chat/trace.rs", import.meta.url), "utf8");
const registration = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/api/chatApi.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/atlas/hooks/stream/persistExecutionCheckpoint.ts", import.meta.url), "utf8");
const hydration = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const mock = readFileSync(new URL("../src/api/mockClient.ts", import.meta.url), "utf8");

for (const table of ["execution_traces", "execution_trace_events"]) {
  assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} should be created idempotently`);
}
for (const field of ["trace_version", "status", "sequence", "parent_id", "run_id", "agent_id", "safe_details_json", "payload_json", "output_preview", "retry_count"]) {
  assert(schema.includes(field), `normalized trace schema should retain ${field}`);
}
assert(schema.includes("migrate_legacy_trace_rows"), "existing steps_json rows should be registered during migration");

for (const marker of ["MAX_TRACE_EVENTS", "MAX_TRACE_EVENT_BYTES", "MAX_TRACES_PER_CHAT", "ON CONFLICT(trace_id)", "ORDER BY sequence ASC"])
  assert(queries.includes(marker), `trace query layer should contain ${marker}`);
assert(queries.includes("DELETE FROM execution_trace_events"), "checkpoint writes should replace one trace atomically");
assert(queries.includes("DELETE FROM execution_traces WHERE chat_id"), "trace retention should be bounded per chat");
assert(queries.includes("validate_trace_payload"), "backend should validate trace payloads before persistence");

for (const commandName of ["upsert_execution_trace", "get_execution_trace", "list_execution_traces"]) {
  assert(command.includes(`pub async fn ${commandName}`), `${commandName} should have a typed Tauri command`);
  assert(registration.includes(`commands::chat::${commandName}`), `${commandName} should be registered with Tauri`);
}
for (const method of ["upsertExecutionTrace", "getExecutionTrace", "listExecutionTraces"]) {
  assert(api.includes(`${method}:`), `frontend API should expose ${method}`);
}

assert(persistence.includes("chatApi.upsertExecutionTrace(chatId, messageId, json, status)"), "live checkpoints should write normalized events");
assert(persistence.includes("Promise.allSettled"), "legacy and normalized persistence should fail independently during migration");
assert(hydration.includes("chatApi.listExecutionTraces(currentSessionId)"), "reload should hydrate normalized traces");
assert(hydration.includes("Normalized v2 nodes are the authority"), "normalized nodes should win over legacy steps_json when available");
assert(hydration.includes("projectNormalizedTraceToMessage"), "reload should project normalized nodes directly into the message timeline");
assert(api.includes("nodes: BackendExecutionNode[]"), "typed trace API should expose canonical normalized nodes");
assert(mock.includes("list_execution_traces"), "browser-only mode should have a typed trace fallback");

console.log("normalized trace storage contract ok");
