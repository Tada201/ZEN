import { callCommand } from "./tauriClient";
import type { Attachment } from "@/atlas/components/chat/types";

export interface BackendChat {
  id: string;
  title?: string;
  model?: string;
  createdAt: string | number;
  updatedAt: string | number;
  pinned?: number;
  folderId?: string | null;
  isArchived?: number;
}

export interface BackendFolder {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface BackendMessage {
  id: string;
  chatId: string;
  role: string;
  content: string;
  toolCalls?: string;
  createdAt: string | number;
  model?: string;
  isComplete?: number;
  kind?: string;
  metadata?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  messageContent: string;
  role: string;
  rank: number;
  timestamp: string;
}

export interface SendMessageRequest extends Record<string, unknown> {
  chatId: string;
  content: string;
  model: string | null;
  provider?: string | null;
  webSearch?: boolean;
  temperature: number | null;
  maxTokens: number | null;
  topP?: number | null;
  topK?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  repeatPenalty?: number | null;
  seed: number | null;
  stop?: unknown;
  thinking?: {
    enabled: boolean;
    effort?: "low" | "medium" | "high";
    budgetTokens?: number;
  } | null;
  deepResearch?: boolean;
  generativeUi?: boolean;
  tools?: string[] | null;
  attachments?: Attachment[] | null;
  systemPrompt?: string | null;
}

export const chatApi = {
  listChats: () => callCommand<BackendChat[]>("get_chats"),
  listChatsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendChat>>("get_chats_page", { limit, offset }),
  listArchivedChats: () => callCommand<BackendChat[]>("list_archived_chats"),
  listFolders: () => callCommand<BackendFolder[]>("list_chat_folders"),
  listMessages: (chatId: string | null) => callCommand<BackendMessage[]>("get_messages", { chatId }),
  listMessagesPage: (chatId: string, limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendMessage>>("get_messages_page", { chatId, limit, offset }),
  searchChats: (query: string) => callCommand<SearchResult[]>("search_chats", { query }),
  exportChat: (chatId: string) => callCommand<unknown>("export_chat", { chatId }),
  importChat: (sourcePath: string) => callCommand<unknown>("import_chat", { sourcePath }),
  createChat: (title: string, model: string | null) =>
    callCommand<BackendChat>("create_chat", { title, model }),
  deleteChat: (chatId: string) => callCommand<void>("delete_chat", { chatId }),
  updateChatTitle: (chatId: string, title: string) =>
    callCommand<void>("update_chat_title", { chatId, title }),
  togglePinChat: (chatId: string) => callCommand<void>("toggle_pin_chat", { chatId }),
  archiveChat: (chatId: string) => callCommand<void>("archive_chat", { chatId }),
  unarchiveChat: (chatId: string) => callCommand<void>("unarchive_chat", { chatId }),
  bulkDeleteChats: (chatIds: string[]) => callCommand<void>("bulk_delete_chats", { chatIds }),
  createFolder: (name: string) => callCommand<BackendFolder>("create_chat_folder", { name }),
  moveChatToFolder: (chatId: string, folderId: string) =>
    callCommand<void>("move_chat_to_folder", { chatId, folderId }),
  removeChatFromFolder: (chatId: string) =>
    callCommand<void>("remove_chat_from_folder", { chatId }),
  sendMessage: (request: SendMessageRequest) => callCommand<void>("send_message", request),
  abortChat: (chatId: string) => callCommand<void>("abort_chat", { chatId }),
};
