# Chat Attachments Feature — Phase Plan

Per-chat attachment workspace: user uploads img/txt/pdf/docx/xlsx into a chat,
files are stored in appdata (NOT injected into context), retrieved on demand by
agent tools, and previewable/deletable in an Attachments artifacts page.

**Scope:** text-based + image formats only. NO audio, NO zip/archives. Single-binary
MSI — native Rust extraction, no bundled Python/Tesseract requirement.

**Guiding principle:** don't stuff context — store + retrieve on demand. Image
tokens scale with PIXEL DIMENSIONS, not bytes (downscale cuts tokens; re-encode
only shrinks payload).

---

## Key existing plumbing (reuse, don't rebuild)
- `documents` table + `DocumentService` (`services/document.rs`) — currently
  workspace-scoped, no `chat_id`.
- Agent tools already exist: `list_documents`, `read_document_content`,
  `grep_documents` (`agent/tools/fs_tools.rs`) — need chat-scoping + richer metadata.
- Extraction (`rag/ingestion.rs`) — PDF native (`pdf_inspector`); docx/xlsx/pptx
  shell out to Python `markitdown`, images to `tesseract` (BOTH violate MSI-only).
- Chat attachment path (`fileToAttachment` → `send.rs:262-267`) inlines
  `extractedText` into the prompt (the wasteful thing to remove) + images to `images[]`.

---

## Phase 1 — Chat-scoped attachment store (backend spine)
Everything below depends on this.
- [x] Migrate `documents` in `db/mod.rs`: add `chat_id TEXT` (nullable), `token_estimate`, `page_count`, `sheet_names`, `content_hash`. App-level cascade (SQLite can't ALTER-add FK) via `delete_documents_for_chat`.
- [x] Blob store: dir-per-chat `<appdata>/attachments/<chat_id>/<doc_id>__<name>` + `<doc_id>.extracted.txt` sidecar, SHA-256 recorded. (Chose dir-per-chat over content-addressed for single-user simplicity — chat delete = recursive remove.)
- [x] Command `attach_file_to_chat(chat_id, filename, data_base64)`: size cap (25MB), per-chat count cap (20), `infer` magic-bytes vs extension allowlist, sanitized display name, path-traversal guard → store → extract → insert.
- [x] Scope `list_documents` / `read_document_content` / `grep_documents` by `chat_id` (agent sees only THIS chat's attachments, over the extracted sidecar).
- [x] Blob GC on chat delete + bulk delete (`delete_documents_for_chat` + `delete_chat_attachments`); per-file `delete_chat_attachment` command.
- [x] Verify: `cargo check --lib`, `cargo test --no-run`, `attachment_store` unit tests.

## Phase 2 — Native extraction (removes Python dependency)
- [x] Add deps (Security.md gate, pinned + >30d): `calamine =0.35.0` (xlsx/xls/xlsb/ods), docx/pptx via `zip`+`quick-xml =0.41.0` (transitive version), keep `pdf_inspector` (PDF).
- [x] Route `ingestion.rs::extract()` to native paths (`rag/office_extract.rs`); `markitdown` now only for legacy `.doc/.ppt/.rtf/.odt/.odp/.epub` if binary present — NEVER required for the common formats. `sheet_names` captured on attach.
- [ ] `read_document_content` slice reads: page range (PDF), sheet name (xlsx), offset/limit vs token budget. — DEFERRED to a follow-up; current read truncates at 24KB.
- [x] Verify: `cargo check --lib`, `cargo test --no-run`, `office_extract` unit tests.

## Phase 3 — Stop context-stuffing
- [x] `send.rs`: on send, non-image attachments are registered into the chat store (`attach_to_chat`) and their inline base64/`extractedText` stripped from the persisted row; history rebuild emits a short `[Attached file: … — use list_documents/read_document_content]` marker instead of inlining text. Legacy rows that still carry `extractedText` fall back to inlining so old chats keep content.
- [x] Images still go to `images[]` (correct vision path).
- [x] `fileAttachments.ts`: stopped `readAsText` for non-images (it mangled binary docs); only the base64 data URL is sent, backend extracts natively.
- [x] Verify: `cargo check --lib`, `cargo test --no-run`, `tsc --noEmit`. (Pre-existing `useSendHandler.test.tsx` failure is a missing jsdom env, fails on clean tree too — unrelated.)

## Phase 4 — Image downscale + compress (frontend)
- [x] `fileToAttachment`: canvas downscale to ~1568px long edge, WebP q0.8 re-encode, keep smaller of original/re-encoded, strip EXIF.
- [x] Report estimated image tokens (tile/area formula).
- [x] Verify: `tsc --noEmit`; existing `useSendHandler.test.tsx` still green.
- Also landed: `attachmentValidation.ts` trust-boundary gate (count/size/ext/dedup), drag-and-drop into composer (`useComposerDrop.ts`), user-message bubble hardening for empty/failed attachment data.

## Phase 5 — Attachments artifacts page (frontend)
- [x] New "Attachments" tab in right panel listing this chat's uploads.
- [x] Preview: images shown inline in the message; non-images use an extracted-text preview (`read_chat_attachment_text`, 256KB cap). Per-file delete.
- [x] Deps: NONE. Chose extracted-text preview over rich `pdfjs-dist`/`mammoth`/SheetJS rendering, so no new dependencies were added (avoids the frozen-vulnerable `xlsx` 0.18.5 supply-chain surface).
- [x] Verify: `tsc --noEmit`; frontend-rules 500-line cap; `html[data-motion="off"]` for any motion.

## Phase 6 — Token tracking
- [x] Surface real provider `usage` into `ContextViewerBadge`: `actual_input_tokens`/`actual_output_tokens` flow from the completed LLM response (OpenAI `prompt_tokens`/`completion_tokens`, Anthropic `input_tokens`/`output_tokens`) through the runner loop onto `ContextBreakdownPayload` + `ContextSnapshot`; badge popover shows "Actual in/out" beside the tokenizer estimate.
- [x] Client-side image-token attribution: OpenAI/Anthropic fold image cost into `input_tokens`, so `actual_input_tokens` already reflects it — no separate client split needed (only Gemini splits natively).
- [x] Verify: `tsc --noEmit`, `cargo check --lib`, `cargo test --no-run`, `test/verify-context-viewer.mjs` (109 pass).

---

## Limits & security defaults (apply across phases)
- Per-file cap 25MB; ~20 files/chat; per-chat total quota.
- Extension allowlist + `infer` magic-byte sniff (validate real bytes, reject mismatch).
- Generated internal storage name (sha256); sanitize display name (strip control/`../`/reserved), length-cap.
- Reject unparseable binaries with a toast — never send mojibake.
- Never log credentials/full payloads.

## Deferred / out of scope
- Scanned-PDF & image OCR (no pure-Rust path; later Windows.Media.Ocr).
- Zip/archive handling (no workspace for it yet).
- Audio/video.
- Local embeddings/RAG search over attachments (`search_documents`) — add later if useful.
