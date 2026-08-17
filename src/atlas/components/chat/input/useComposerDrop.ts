/**
 * `useComposerDrop` — drag-and-drop of files onto the chat composer shell.
 *
 * Returns the drop-target handlers plus an `isDragging` flag the shell uses to
 * paint a drop overlay. Drag events bubble and fire per child element, so we
 * count enter/leave depth to avoid the overlay flickering as the pointer moves
 * across the textarea, pills, and buttons inside the shell.
 *
 * We only claim drags that actually carry files (`Files` in `dataTransfer`),
 * so dragging selected text or a link into the textarea keeps native
 * behaviour. Rejected files are surfaced by the caller-supplied `addFiles`
 * return value (validation lives in `useAttachments`).
 */

import { useCallback, useRef, useState } from "react";
import type { FileRejection } from "./attachmentValidation";

export interface ComposerDropHandlers {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const carriesFiles = (e: React.DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function useComposerDrop(
  addFiles: (files: FileList | File[]) => FileRejection[],
  onReject: (rejected: FileRejection[]) => void,
  disabled?: boolean,
): ComposerDropHandlers {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (disabled || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, [disabled]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    // Always claim file drags over the composer so the browser never falls
    // back to navigating to (opening) the dropped file — even when disabled,
    // where we signal "not allowed" instead of accepting.
    e.preventDefault();
    e.dataTransfer.dropEffect = disabled ? "none" : "copy";
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (disabled || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, [disabled]);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!carriesFiles(e)) return;
    // Swallow the drop regardless of disabled state; a disabled composer must
    // not let the file open in the WebView.
    e.preventDefault();
    depth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const rejected = addFiles(files);
      if (rejected.length > 0) onReject(rejected);
    }
  }, [disabled, addFiles, onReject]);

  return { isDragging, onDragEnter, onDragOver, onDragLeave, onDrop };
}

export default useComposerDrop;
