/**
 * `AttachmentPills` — attachment state hook carved out of
 * `PremiumChatInput.tsx` so the input file stops wiring file inputs,
 * selected-file state, and removal handlers inline.
 *
 * Exposes a single `useAttachments()` hook that owns the selected-files
 * array and gives callers `addFiles(fileList)`, `removeFile(index)`,
 * and `clearFiles()`. The hook is the single source of truth; it
 * returns plain `File[]` so consumers can pass results straight into
 * `fileToAttachment` on submit. There is no rendering side effect — the
 * hook is purely concerned with state.
 *
 * The visible file-chip row stays in `ActionPills` (which owns the
 * related gen-mode pills). Renaming `AttachmentPills.tsx` to just
 * `useAttachments.ts` is a future cleanup; for now the file name
 * matches the historical concern so existing finder / grep traffic
 * continues to surface attachment-related code in one place.
 */

import { useCallback, useState } from "react";

export interface AttachmentState {
  selectedFiles: File[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
}

export function useAttachments(): AttachmentState {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.isArray(files) ? files : Array.from(files);
    if (arr.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...arr]);
  }, []);

  const removeFile = useCallback(
    (index: number) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const clearFiles = useCallback(() => setSelectedFiles([]), []);

  return { selectedFiles, addFiles, removeFile, clearFiles };
}

export default useAttachments;
