import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const chatStore = read("src/lib/stores/useChatStore.ts");
const queries = read("src/atlas/hooks/chat/useChatQueries.ts");
const useChat = read("src/atlas/hooks/useChat.ts");
const workspace = read("src/atlas/sections/WorkspaceSection.tsx");
const palette = read("src/atlas/CommandPalette.tsx");

assert(chatStore.includes("isNewChatDraft: boolean"), "chat store must track an intentional new-chat draft");
assert(chatStore.includes("startNewChat: () => void"), "chat store must expose a new-chat action");
assert(chatStore.includes("startNewChat: () => set({ activeSessionId: null, isNewChatDraft: true })"), "new chat must clear the active session without creating a backend row");
assert(queries.includes("!isNewChatDraft"), "session hydration must not auto-select history over an intentional new chat");
assert(useChat.includes("startNewChat"), "useChat must expose the draft-first new-chat action");
assert(workspace.includes("const handleStartNewChat"), "workspace must centralize the new-chat behavior");
assert(workspace.includes("onNewChat={handleStartNewChat}"), "header new chat must return to the welcome surface");
assert(workspace.includes("onCreate={handleStartNewChat}"), "sidebar new chat must return to the welcome surface");
assert(workspace.includes("<CommandPalette onNewChat={handleStartNewChat} />"), "command palette must use the same new-chat behavior");
assert(!workspace.includes('onNewChat={() => void handleCreateSession("New Chat")}'), "new chat must not eagerly create an empty backend session");
assert(palette.includes("onNewChat();"), "command palette must invoke the shared new-chat callback");

console.log("new-chat welcome flow verified");
