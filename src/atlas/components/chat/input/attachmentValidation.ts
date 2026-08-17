/**
 * Frontend attachment gate — mirrors the backend trust-boundary checks in
 * `services/document.rs::attach_to_chat` so oversize / unsupported / duplicate
 * files are rejected with a message before we ever base64-encode and ship them
 * over IPC. The backend re-validates (magic-byte sniff, size, count); this is
 * fast user feedback, not the security boundary.
 */

// Keep in sync with `attachment_store::MAX_ATTACHMENT_BYTES` / _PER_CHAT.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_CHAT = 20;

// Mirrors is_allowed_text_ext + is_allowed_sniffed (binary) extensions. Images
// go through the vision path; the rest are extracted server-side on demand.
const ALLOWED_EXTS = new Set([
  // text / code
  "txt", "md", "csv", "json", "html", "css", "xml", "yaml", "yml", "toml",
  "rs", "js", "ts", "tsx", "jsx", "py", "go", "c", "cpp", "h", "rst",
  "org", "adoc", "log",
  // documents
  "pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub",
  // images
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff",
]);

export interface FileRejection {
  name: string;
  reason: string;
}

export interface ValidationResult {
  accepted: File[];
  rejected: FileRejection[];
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// A stable identity for dedup: name + size + lastModified. Two files with the
// same three are the same pick for our purposes (browsers can't hash cheaply).
function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

/**
 * Filter an incoming batch against the existing selection. Enforces the size
 * cap, extension allowlist, empty-file guard, per-chat count cap, and dedup
 * (both against already-selected files and within the batch itself).
 */
export function validateFiles(
  incoming: File[],
  existing: File[],
): ValidationResult {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];
  const seen = new Set(existing.map(fileKey));
  let count = existing.length;

  for (const file of incoming) {
    if (count >= MAX_ATTACHMENTS_PER_CHAT) {
      rejected.push({
        name: file.name,
        reason: `attachment limit reached (${MAX_ATTACHMENTS_PER_CHAT} max)`,
      });
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) {
      rejected.push({ name: file.name, reason: "already attached" });
      continue;
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: "file is empty" });
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push({
        name: file.name,
        reason: `exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit`,
      });
      continue;
    }
    // Trust the extension for the allowlist; images may report an empty
    // `type` on some drops so we don't gate on MIME alone.
    const ext = extOf(file.name);
    const isImage = file.type.startsWith("image/");
    if (!isImage && !ALLOWED_EXTS.has(ext)) {
      rejected.push({ name: file.name, reason: "unsupported file type" });
      continue;
    }

    seen.add(key);
    accepted.push(file);
    count += 1;
  }

  return { accepted, rejected };
}

/**
 * Runnable self-check. Not wired to a framework — call from a dev console or a
 * throwaway test. Kept exported so it typechecks and tree-shakes out of prod.
 * ponytail: inline asserts, no framework — matches repo's "one runnable check".
 */
export function __attachmentValidationSelfCheck(): void {
  const mk = (name: string, size: number, type = ""): File =>
    ({ name, size, type, lastModified: 1 }) as File;
  const big = validateFiles([mk("a.pdf", MAX_ATTACHMENT_BYTES + 1)], []);
  console.assert(big.rejected.length === 1 && big.accepted.length === 0, "oversize rejected");
  const dup = validateFiles([mk("a.pdf", 10)], [mk("a.pdf", 10)]);
  console.assert(dup.rejected[0]?.reason === "already attached", "dedup vs existing");
  const bad = validateFiles([mk("a.exe", 10)], []);
  console.assert(bad.rejected[0]?.reason === "unsupported file type", "ext allowlist");
  const empty = validateFiles([mk("a.txt", 0)], []);
  console.assert(empty.rejected[0]?.reason === "file is empty", "empty rejected");
  const overflow = validateFiles(
    Array.from({ length: 25 }, (_, i) => mk(`f${i}.txt`, 10)),
    [],
  );
  console.assert(overflow.accepted.length === MAX_ATTACHMENTS_PER_CHAT, "count cap");
}
