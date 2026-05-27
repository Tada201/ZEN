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
}

export const documentsApi = {
  ingestDocument: (path: string) => callCommand<BackendDocument>("ingest_document", { path }),
  listDocuments: () => callCommand<BackendDocument[]>("list_documents"),
  listDocumentsPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<BackendDocument>>("list_documents_page", { limit, offset }),
  getDocument: (docId: string) => callCommand<BackendDocument>("get_document", { docId }),
  deleteDocument: (docId: string) => callCommand<void>("delete_document", { docId }),
};
