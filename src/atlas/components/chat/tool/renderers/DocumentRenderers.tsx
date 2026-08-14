import { FileText, Folder, File as FileIcon } from "lucide-react";
import { CodeBlock } from "../../CodeBlock";
import { Panel, MoreRow, asRecord, str, arr } from "./primitives";
import type { RendererContext } from "./registry";

const MAX_ROWS = 8;
const MAX_GREP_FILES = 8;
const MAX_MATCHES_PER_FILE = 5;
const MAX_DIR_ROWS = 40;

function filenameOf(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Map a file extension to a Prism language hint for the read viewer. */
function languageOf(path: string): string {
  const ext = path.replace(/\\/g, "/").split("/").pop()?.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    rs: "rust", py: "python", go: "go", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", rb: "ruby",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    css: "css", html: "markup", sh: "bash", sql: "sql", toml: "bash",
  };
  return map[ext] || "plaintext";
}

/* ── list_documents ───────────────────────────────────────────── */
// Output: { documents: [{ id, file_name, file_path, status }] }
export function DocumentList({ output }: RendererContext) {
  const docs = arr(asRecord(output).documents);
  if (docs.length === 0) {
    // Distinguish "ran, found nothing" from "unexpected shape" (→ null → fallback).
    return "documents" in asRecord(output) ? (
      <Panel label="Documents">
        <div className="text-[12px] text-muted-foreground">No documents ingested.</div>
      </Panel>
    ) : null;
  }

  const rows = docs.slice(0, MAX_ROWS).map(asRecord);
  return (
    <Panel label={`${docs.length} documents`}>
      <div className="flex flex-col gap-1">
        {rows.map((doc, index) => {
          const name = str(doc.file_name) || filenameOf(str(doc.file_path)) || str(doc.id) || "—";
          const status = str(doc.status);
          const ready = /ready|ingested|complete|indexed|done/i.test(status);
          return (
            <div key={str(doc.id) || index} className="flex items-center gap-2 min-w-0">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{name}</span>
              {status && (
                <span
                  className={
                    ready
                      ? "shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success"
                      : "shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  }
                >
                  {status}
                </span>
              )}
            </div>
          );
        })}
        <MoreRow hidden={docs.length - rows.length} />
      </div>
    </Panel>
  );
}

/* ── list_directory ───────────────────────────────────────────── */
// Output: { path, entries: [{ name, type: "dir"|"file", size?, modified_ms? }], truncated }
export function DirectoryList({ output }: RendererContext) {
  const record = asRecord(output);
  const entries = arr(record.entries);
  if (entries.length === 0) {
    return "entries" in record ? (
      <Panel label="Directory">
        <div className="text-[12px] text-muted-foreground">Empty directory.</div>
      </Panel>
    ) : null;
  }

  const truncated = record.truncated === true;
  const rows = entries.slice(0, MAX_DIR_ROWS).map(asRecord);
  return (
    <Panel label={`${entries.length} item${entries.length === 1 ? "" : "s"}${truncated ? " (truncated)" : ""}`}>
      <div className="flex flex-col gap-0.5">
        {rows.map((entry, index) => {
          const isDir = str(entry.type) === "dir";
          const name = str(entry.name) || "—";
          const size = typeof entry.size === "number" ? formatBytes(entry.size) : "";
          const Icon = isDir ? Folder : FileIcon;
          return (
            <div key={name + index} className="flex items-center gap-2 min-w-0">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${isDir ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${isDir ? "text-foreground" : "text-muted-foreground"}`}>
                {name}{isDir ? "/" : ""}
              </span>
              {size && (
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{size}</span>
              )}
            </div>
          );
        })}
        <MoreRow hidden={entries.length - rows.length} />
      </div>
    </Panel>
  );
}

/* ── read_document_content ────────────────────────────────────── */
// Output: { file_path, content, modified_ms? }
export function DocumentContent({ output }: RendererContext) {
  const record = asRecord(output);
  const content = str(record.content);
  const path = str(record.file_path);
  if (!content) return null;

  const truncated = content.includes("[TRUNCATED");
  const lineCount = content.split("\n").length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-0.5 min-w-0">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {path || "file"}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {lineCount} lines{truncated ? " · truncated" : ""}
        </span>
      </div>
      <CodeBlock code={content} language={languageOf(path)} />
    </div>
  );
}

/* ── grep_documents / search_files ────────────────────────────── */
// Output: { results: [{ filename, path?, count?, matches: [{ line, content }] }], count?, total_matches? }
export function GrepResults({ output }: RendererContext) {
  const record = asRecord(output);
  const results = arr(record.results);
  if (results.length === 0) {
    return "results" in record ? (
      <Panel label="Search">
        <div className="text-[12px] text-muted-foreground">No matches found.</div>
      </Panel>
    ) : null;
  }

  const files = results.slice(0, MAX_GREP_FILES).map(asRecord);
  // `content` mode carries per-line matches; `files_with_matches`/`count` mode
  // carries a numeric `count` with empty matches. Prefer the explicit total.
  const totalMatches =
    typeof record.total_matches === "number"
      ? record.total_matches
      : files.reduce((sum, file) => {
          const n = arr(file.matches).length;
          return sum + (n > 0 ? n : typeof file.count === "number" ? file.count : 0);
        }, 0);

  return (
    <Panel label={`${totalMatches} match${totalMatches === 1 ? "" : "es"} · ${results.length} file${results.length === 1 ? "" : "s"}`}>
      <div className="flex flex-col gap-2">
        {files.map((file, fileIndex) => {
          const name = str(file.filename) || filenameOf(str(file.path)) || `File ${fileIndex + 1}`;
          const lineMatches = arr(file.matches).slice(0, MAX_MATCHES_PER_FILE).map(asRecord);
          const count = typeof file.count === "number" ? file.count : lineMatches.length;
          return (
            <div key={name + fileIndex} className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{name}</span>
                {lineMatches.length === 0 && count > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{count}</span>
                )}
              </div>
              {lineMatches.length > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {lineMatches.map((match, matchIndex) => (
                    <div key={matchIndex} className="flex gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {String(match.line ?? "?")}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                        {str(match.content)}
                      </span>
                    </div>
                  ))}
                  <MoreRow hidden={arr(file.matches).length - lineMatches.length} />
                </div>
              )}
            </div>
          );
        })}
        <MoreRow hidden={results.length - files.length} />
      </div>
    </Panel>
  );
}
