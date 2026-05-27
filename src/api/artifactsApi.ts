import { callCommand } from "./tauriClient";
import type { PaginatedResponse } from "./chatApi";

export interface BackendArtifact {
  id: string;
  chatId: string;
  messageId: string;
  type: string;
  title: string;
  content: string;
  language?: string | null;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const artifactsApi = {
  listArtifactsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendArtifact>>("list_artifacts_page", { limit, offset }),
  listChatArtifactsPage: (chatId: string, limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendArtifact>>("list_chat_artifacts_page", {
      chatId,
      limit,
      offset,
    }),
};
