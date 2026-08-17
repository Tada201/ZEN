import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { documentsApi, type BackendDocument } from "@/api/documentsApi";
import { useUIStore } from "@/lib/stores/useUIStore";
import { cn } from "@/lib/utils";

/**
 * `AttachmentsPanel` — right-rail view listing the active chat's uploaded
 * files. Cards show server-computed metadata (size, token estimate, page/sheet
 * counts); selecting a non-image reads its capped extracted-text sidecar on
 * demand (never held in chat context). Images have no useful text sidecar, so
 * they preview from the message bubble, not here. Per-file delete removes the
 * DB row + blob + sidecar.
 */

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageDoc(doc: BackendDocument): boolean {
  return (doc.mimeType ?? "").startsWith("image/");
}

function parseSheetNames(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function AttachmentsPanel() {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const [docs, setDocs] = useState<BackendDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeChatId) {
      setDocs([]);
      return;
    }
    setLoading(true);
    try {
      setDocs(await documentsApi.listChatAttachments(activeChatId));
    } catch (e) {
      toast.error(`Couldn't load attachments: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeChatId]);

  useEffect(() => {
    void load();
    // Reset selection when switching chats.
    setSelectedId(null);
    setPreviewText("");
  }, [load]);

  const selected = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  const openPreview = useCallback(async (doc: BackendDocument) => {
    setSelectedId(doc.id);
    setPreviewText("");
    if (isImageDoc(doc)) return; // no text sidecar for images
    setPreviewLoading(true);
    try {
      setPreviewText(await documentsApi.readChatAttachmentText(doc.id));
    } catch (e) {
      setPreviewText(`Could not read preview: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const remove = useCallback(async (doc: BackendDocument) => {
    try {
      await documentsApi.deleteChatAttachment(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (selectedId === doc.id) {
        setSelectedId(null);
        setPreviewText("");
      }
    } catch (e) {
      toast.error(`Couldn't delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [selectedId]);

  if (!activeChatId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <Paperclip size={22} className="mb-3 opacity-50" />
        <p className="text-sm">Select a chat to see its attachments.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Attachments{docs.length > 0 ? ` (${docs.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Refresh"
          aria-label="Refresh attachments"
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>
      <AttachmentsBody
        docs={docs}
        loading={loading}
        selected={selected}
        selectedId={selectedId}
        previewText={previewText}
        previewLoading={previewLoading}
        onOpen={openPreview}
        onRemove={remove}
      />
    </div>
  );
}

interface BodyProps {
  docs: BackendDocument[];
  loading: boolean;
  selected: BackendDocument | null;
  selectedId: string | null;
  previewText: string;
  previewLoading: boolean;
  onOpen: (doc: BackendDocument) => void;
  onRemove: (doc: BackendDocument) => void;
}

function AttachmentsBody({
  docs, loading, selected, selectedId, previewText, previewLoading, onOpen, onRemove,
}: BodyProps) {
  if (docs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <Paperclip size={22} className="mb-3 opacity-50" />
        <p className="text-sm">{loading ? "Loading…" : "No files attached to this chat yet."}</p>
        {!loading && (
          <p className="mt-2 max-w-xs text-xs leading-relaxed opacity-70">
            Drag files onto the composer or use the + menu to attach documents.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border p-2">
        {docs.map((doc) => (
          <AttachmentCard
            key={doc.id}
            doc={doc}
            active={selectedId === doc.id}
            onOpen={() => onOpen(doc)}
            onRemove={() => onRemove(doc)}
          />
        ))}
      </ul>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!selected ? (
          <p className="text-xs text-muted-foreground">Select a file to preview its extracted text.</p>
        ) : isImageDoc(selected) ? (
          <p className="text-xs text-muted-foreground">
            Image preview is shown inline in the chat message. No text extraction for images.
          </p>
        ) : previewLoading ? (
          <p className="text-xs text-muted-foreground">Reading…</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/90">
            {previewText || "(no extracted text)"}
          </pre>
        )}
      </div>
    </div>
  );
}

function AttachmentCard({
  doc, active, onOpen, onRemove,
}: {
  doc: BackendDocument;
  active: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const image = isImageDoc(doc);
  const sheets = parseSheetNames(doc.sheetNames);
  const meta = [
    formatBytes(doc.fileSize),
    doc.tokenEstimate ? `~${doc.tokenEstimate.toLocaleString()} tok` : null,
    doc.pageCount ? `${doc.pageCount} pg` : null,
    sheets.length > 0 ? `${sheets.length} sheet${sheets.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li>
      <div
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
          active ? "bg-primary/10" : "hover:bg-muted/50",
        )}
      >
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/60">
            {image ? <ImageIcon size={14} className="text-primary" /> : <FileText size={14} className="text-muted-foreground" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-foreground">{doc.filename}</span>
            <span className="truncate text-[10px] text-muted-foreground">{meta || "—"}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          title={`Delete ${doc.filename}`}
          aria-label={`Delete ${doc.filename}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

export default AttachmentsPanel;
