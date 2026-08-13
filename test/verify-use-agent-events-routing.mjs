import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(
  new URL("../src/atlas/hooks/stream/useAgentEvents.ts", import.meta.url),
  "utf8",
);

assert(
  source.includes('import { getDirectOrActiveStreamingChatId } from "./activeStreamRouting";'),
  "agent event hook should use the shared active-stream routing helper",
);

for (const eventName of ["orchestrator:progress", "chat:status", "chat:research-step"]) {
  const eventIndex = source.indexOf(`listenAppEvent("${eventName}"`);
  assert(eventIndex !== -1, `${eventName} listener should exist`);
  const listenerBlock = source.slice(eventIndex, source.indexOf("});", eventIndex) + 3);
  assert(
    listenerBlock.includes("getDirectOrActiveStreamingChatId(useChatStore.getState(), payload)"),
    `${eventName} should route sparse events to the active streaming chat`,
  );
}

assert(
  (source.includes('appendActionStep(chatId, { ...payload, chat_id: chatId }, "orchestrator_progress")') || source.includes('appendLifecycleStep(chatId, { ...payload, chat_id: chatId }, "orchestrator_progress")')),
  "orchestrator progress should stamp resolved chat_id before appending",
);
assert(
  (source.includes('appendActionStep(chatId, { ...payload, chat_id: chatId } as AgentActionEventPayload, "chat_status")') || source.includes('appendLifecycleStep(chatId, { ...payload, chat_id: chatId } as AgentActionEventPayload, "chat_status")')),
  "chat status should stamp resolved chat_id before appending",
);
const chatMessageIndex = source.indexOf('listenAppEvent("chat:message"');
assert(chatMessageIndex !== -1, "chat:message listener should exist");
const chatMessageBlock = source.slice(chatMessageIndex, source.indexOf("});", chatMessageIndex) + 3);
assert(
  chatMessageBlock.includes("INLINE_ACTION_KINDS.has(kind)") &&
  chatMessageBlock.includes("getDirectOrActiveStreamingChatId(useChatStore.getState(), payload)") &&
  chatMessageBlock.includes("payload.chat_id"),
  "chat:message should route inline action messages by active stream while preserving direct-only routing for normal messages",
);
assert(
  (chatMessageBlock.includes("appendActionStep(chatId, { ...payload, chat_id: chatId }, kind)") || chatMessageBlock.includes("appendLifecycleStep(chatId, { ...payload, chat_id: chatId }, kind)")),
  "chat:message inline actions should stamp resolved chat_id before appending",
);

console.log("use agent events routing ok");
