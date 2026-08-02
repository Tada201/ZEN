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
  /** Workspace root captured for this chat; null means use the global workspace fallback. */
  workspaceRoot?: string | null;
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
  reasoningDetails?: string;
  stepsJson?: string;
  attachments?: string;
}

export interface BackendChatTag {
  id: string;
  chatId: string;
  name: string;
  color?: string | null;
  createdAt: string | number;
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
  imageGen?: boolean;
  tools?: string[] | null;
  attachments?: Attachment[] | null;
  systemPrompt?: string | null;
  systemPromptMode?: "append" | "replace" | null;
  voiceDisplayContext?: string | null;
  /**
   * The selected model's real context window (`max_context_length`),
   * forwarded so the context-usage gauge divides against the true model
   * budget instead of Zen's compaction cap. Omit/null when unknown.
   */
  modelContextWindow?: number | null;
}
export const chatApi = {
  listChats: () => callCommand<BackendChat[]>("get_chats"),
  listChatsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendChat>>("get_chats_page", { limit, offset }),
  listArchivedChats: () => callCommand<BackendChat[]>("list_archived_chats"),
  listArchivedChatsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendChat>>("list_archived_chats_page", { limit, offset }),
  listChatTagsPage: (chatId: string, limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendChatTag>>("list_chat_tags_page", { chatId, limit, offset }),
  listAllChatTagsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendChatTag>>("list_all_chat_tags_page", { limit, offset }),
  listUniqueTagNamesPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<string>>("list_unique_tag_names_page", { limit, offset }),
  listFolders: () => callCommand<BackendFolder[]>("list_chat_folders"),
  listMessages: (chatId: string | null) => callCommand<BackendMessage[]>("get_messages", { chatId }),
  listMessagesPage: (chatId: string, limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendMessage>>("get_messages_page", { chatId, limit, offset }),
  updateMessageSteps: (chatId: string, messageId: string, stepsJson: string) =>
    callCommand<void>("update_message_steps", { chatId, messageId, stepsJson }),
  searchChats: (query: string) => callCommand<SearchResult[]>("search_chats", { query }),
  exportChat: (chatId: string) => callCommand<unknown>("export_chat", { chatId }),
  importChat: (sourcePath: string) => callCommand<unknown>("import_chat", { sourcePath }),
  createChat: (title: string, model: string | null) =>
    callCommand<BackendChat>("create_chat", { title, model }),
  setChatWorkspace: (chatId: string, workspaceRoot: string | null) =>
    callCommand<BackendChat>("set_chat_workspace", { chatId, workspaceRoot }),
  deleteChat: (chatId: string) => callCommand<void>("delete_chat", { chatId }),
  updateChatTitle: (chatId: string, title: string) =>
    callCommand<void>("update_chat_title", { chatId, title }),
  generateSessionTitle: (chatId: string, firstUserMessage: string) =>
    callCommand<string>("generate_session_title", { chatId, firstUserMessage }),
  togglePinChat: (chatId: string) => callCommand<void>("toggle_pin_chat", { chatId }),
  archiveChat: (chatId: string) => callCommand<void>("archive_chat", { chatId }),
  unarchiveChat: (chatId: string) => callCommand<void>("unarchive_chat", { chatId }),
  bulkDeleteChats: (chatIds: string[]) => callCommand<void>("bulk_delete_chats", { chatIds }),
  createFolder: (name: string) => callCommand<BackendFolder>("create_chat_folder", { name }),
  updateFolder: (folderId: string, name: string) =>
    callCommand<void>("update_chat_folder", { folderId, name }),
  deleteFolder: (folderId: string) =>
    callCommand<void>("delete_chat_folder", { folderId }),
  moveChatToFolder: (chatId: string, folderId: string) =>
    callCommand<void>("move_chat_to_folder", { chatId, folderId }),
  removeChatFromFolder: (chatId: string) =>
    callCommand<void>("remove_chat_from_folder", { chatId }),
  sendMessage: (request: SendMessageRequest) => {
    const { imageGen, generativeUi, ...rest } = request;
    return callCommand<void>("send_message", {
      ...rest,
      image_gen: imageGen,
      generative_ui: generativeUi,
    });
  },
  abortChat: (chatId: string) => callCommand<void>("abort_chat", { chatId }),
  exportImageToWorkspace: (imageUriOrFilename: string) => {
    let filename = imageUriOrFilename;
    if (imageUriOrFilename.includes("/")) {
      const parts = imageUriOrFilename.split("/");
      filename = parts[parts.length - 1];
    } else if (imageUriOrFilename.includes("\\")) {
      const parts = imageUriOrFilename.split("\\");
      filename = parts[parts.length - 1];
    }
    return callCommand<string>("export_image_to_workspace", { filename });
  },
};
