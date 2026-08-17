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
  archivedAt?: string | null;
  /** Workspace root captured for this chat; null means legacy/imported chats use the configured default workspace fallback. */
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

export interface BackendExecutionNode {
  id: string;
  traceId: string;
  runId: string;
  messageId: string;
  parentId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  sequence: number;
  kind: string;
  phase?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  summary: string;
  target?: string | null;
  resultSummary?: string | null;
  outputPreview?: string | null;
  safeDetails?: Record<string, unknown>;
  retryCount?: number | null;
}

export interface BackendExecutionTrace {
  traceId: string;
  chatId: string;
  messageId: string;
  traceVersion: number;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint" | string;
  startedAt?: number | null;
  completedAt?: number | null;
  updatedAt: string;
  eventCount: number;
  nodes: BackendExecutionNode[];
  /** Compatibility projection for legacy history consumers. */
  steps: unknown[];
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
  /**
   * Timeline kind for the persisted user row. Only set by automatic goal
   * continuations (`goal_continuation`), which render as a quiet system row
   * instead of a user bubble.
   */
  messageKind?: string | null;
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
  updateMessageSteps: (
    chatId: string,
    messageId: string,
    stepsJson: string,
    traceStatus?: "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint",
  ) => callCommand<void>("update_message_steps", { chatId, messageId, stepsJson, traceStatus }),
  /**
   * Persist an edited assistant message body (self-healing diagram repairs).
   * `stepsJson` + `traceStatus` optionally rewrite the execution timeline in
   * the same write so the fix survives reloads on the timeline path too.
   */
  updateMessageContent: (
    chatId: string,
    messageId: string,
    content: string,
    stepsJson?: string,
    traceStatus?: "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint",
  ) => callCommand<void>("update_message_content", {
    chatId,
    messageId,
    content,
    stepsJson: stepsJson ?? null,
    traceStatus: traceStatus ?? null,
  }),
  upsertExecutionTrace: (
    chatId: string,
    messageId: string,
    traceJson: string,
    traceStatus?: "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint",
  ) => callCommand<BackendExecutionTrace>("upsert_execution_trace", { chatId, messageId, traceJson, traceStatus }),
  listExecutionTraces: (chatId: string) =>
    callCommand<BackendExecutionTrace[]>("list_execution_traces", { chatId }),
  getExecutionTrace: (chatId: string, messageId: string) =>
    callCommand<BackendExecutionTrace | null>("get_execution_trace", { chatId, messageId }),
  searchChats: (query: string) => callCommand<SearchResult[]>("search_chats", { query }),
  exportChat: (chatId: string) => callCommand<unknown>("export_chat", { chatId }),
  importChat: (sourcePath: string) => callCommand<unknown>("import_chat", { sourcePath }),
  createChat: (title: string, model: string | null, workspaceRoot?: string | null) =>
    callCommand<BackendChat>("create_chat", { title, model, workspaceRoot: workspaceRoot ?? null }),
  setChatWorkspace: (chatId: string, workspaceRoot: string | null) =>
    callCommand<BackendChat>("set_chat_workspace", { chatId, workspaceRoot }),
  deleteChat: (chatId: string) => callCommand<void>("delete_chat", { chatId }),
  updateChatTitle: (chatId: string, title: string) =>
    callCommand<void>("update_chat_title", { chatId, title }),
  generateSessionTitle: (chatId: string, firstUserMessage: string) =>
    callCommand<string>("generate_session_title", { chatId, firstUserMessage }),
  /**
   * Self-heal a Mermaid diagram: send the broken code + renderer error to the
   * active model and return corrected Mermaid code. One-shot, no chat history,
   * no persistence — the corrected code is rendered in place by the frontend.
   */
  repairMermaid: (code: string, error: string, options?: { provider?: string; model?: string }) =>
    callCommand<string>("repair_mermaid", {
      code,
      error,
      provider: options?.provider ?? null,
      model: options?.model ?? null,
    }),
  /**
   * Self-heal an oversized/invalid chart payload: send the broken JSON + size
   * error to the active model and return corrected, condensed chart JSON.
   * One-shot, no chat history — the frontend re-parses and re-renders it.
   */
  repairChart: (code: string, error: string, options?: { provider?: string; model?: string }) =>
    callCommand<string>("repair_chart", {
      code,
      error,
      provider: options?.provider ?? null,
      model: options?.model ?? null,
    }),
  togglePinChat: (chatId: string) => callCommand<void>("toggle_pin_chat", { chatId }),
  archiveChat: (chatId: string) => callCommand<void>("archive_chat", { chatId }),
  unarchiveChat: (chatId: string) => callCommand<void>("unarchive_chat", { chatId }),
  bulkDeleteChats: (chatIds: string[]) => callCommand<void>("bulk_delete_chats", { chatIds }),
  createFolder: (name: string, color?: string) =>
    callCommand<BackendFolder>("create_chat_folder", { name, color: color ?? null, icon: "folder" }),
  updateFolder: (folderId: string, name?: string, color?: string) =>
    callCommand<void>("update_chat_folder", { folderId, name: name ?? null, color: color ?? null }),
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
      // Tauri command arguments use camelCase on the JS boundary and map
      // them to the Rust snake_case parameters. Sending generative_ui here
      // bypasses that mapping, so Rust receives None and disables GenUI.
      imageGen,
      generativeUi,
    });
  },
  abortChat: (chatId: string) => callCommand<boolean>("abort_chat", { chatId }),
  cancelSubagent: (chatId: string, spawnId: string) =>
    callCommand<boolean>("cancel_subagent", { chatId, spawnId }),
  pauseChat: (chatId: string) => callCommand<boolean>("pause_chat", { chatId }),
  continueChat: (chatId: string) => callCommand<boolean>("continue_chat", { chatId }),
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
