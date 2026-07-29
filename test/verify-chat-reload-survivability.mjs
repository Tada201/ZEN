import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const useChatQueriesModule = await loadSourceModule("../src/atlas/hooks/chat/useChatQueries.ts");
const mapDbMessageToMessage = useChatQueriesModule.mapDbMessageToMessage;

const complete = mapDbMessageToMessage({
  id: "msg-1",
  chatId: "chat-1",
  role: "assistant",
  content: "Final answer",
  model: "test",
  createdAt: new Date().toISOString(),
  isComplete: 1,
  toolCalls: null,
  reasoningDetails: null,
  metadata: null,
  attachments: null,
  kind: "chat",
});
if (complete.status !== "sent") throw new Error(`Expected completed message status sent, got ${complete.status}`);

const incompleteWithContent = mapDbMessageToMessage({
  id: "msg-2",
  chatId: "chat-1",
  role: "assistant",
  content: "Partial text",
  model: "test",
  createdAt: new Date().toISOString(),
  isComplete: 0,
  toolCalls: null,
  reasoningDetails: null,
  metadata: null,
  attachments: null,
  kind: "chat",
});
if (incompleteWithContent.status !== "sending") throw new Error(`Expected incomplete message with content to stay sending, got ${incompleteWithContent.status}`);

const incompleteWithToolCalls = mapDbMessageToMessage({
  id: "msg-3",
  chatId: "chat-1",
  role: "assistant",
  content: "",
  model: "test",
  createdAt: new Date().toISOString(),
  isComplete: 0,
  toolCalls: JSON.stringify([{ id: "tool-1", name: "search", status: "completed", input: {}, output: "" }]),
  reasoningDetails: null,
  metadata: null,
  attachments: null,
  kind: "chat",
});
if (incompleteWithToolCalls.status !== "sending") throw new Error(`Expected incomplete message with toolCalls to stay sending, got ${incompleteWithToolCalls.status}`);

const incompleteWithoutPayload = mapDbMessageToMessage({
  id: "msg-4",
  chatId: "chat-1",
  role: "assistant",
  content: "",
  model: "test",
  createdAt: new Date().toISOString(),
  isComplete: 0,
  toolCalls: null,
  reasoningDetails: null,
  metadata: null,
  attachments: null,
  kind: "chat",
});
if (incompleteWithoutPayload.status !== "failed") throw new Error(`Expected empty incomplete message to fail, got ${incompleteWithoutPayload.status}`);

await closeSourceModuleLoader();
console.log("chat reload survivability ok");
