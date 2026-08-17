import { callCommand } from "./tauriClient";
import type { PaginatedResponse } from "./chatApi";

export interface BackendDocument {
  id: string;
  filename: string;
  mimeType?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  docType?: string | null;
  status: string;
  errorMsg?: string | null;
  workspace: string;
  embeddingModel?: string | null;
  createdAt: string;
  // Per-chat attachment metadata (NULL for workspace-global docs).
  chatId?: string | null;
  tokenEstimate?: number | null;
  pageCount?: number | null;
  /** JSON array of sheet names for spreadsheets, else NULL. */
  sheetNames?: string | null;
  contentHash?: string | null;
}

export const documentsApi = {
  ingestDocument: (path: string) => callCommand<BackendDocument>("ingest_document", { path }),
  listDocuments: () => callCommand<BackendDocument[]>("list_documents"),
  listDocumentsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendDocument>>("list_documents_page", { limit, offset }),
  getDocument: (docId: string) => callCommand<BackendDocument>("get_document", { docId }),
  deleteDocument: (docId: string) => callCommand<void>("delete_document", { docId }),

  // ─── Per-chat attachments ───
  attachFileToChat: (chatId: string, filename: string, dataBase64: string) =>
    callCommand<BackendDocument>("attach_file_to_chat", { chatId, filename, dataBase64 }),
  listChatAttachments: (chatId: string) =>
    callCommand<BackendDocument[]>("list_chat_attachments", { chatId }),
  deleteChatAttachment: (docId: string) =>
    callCommand<void>("delete_chat_attachment", { docId }),
  readChatAttachmentText: (docId: string) =>
    callCommand<string>("read_chat_attachment_text", { docId }),
};
