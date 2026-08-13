/**
 * `useAutoResizeTextarea` — owns the textarea ref, the parent
 * container ref, the `ResizeObserver` that measures it, the
 * `requestAnimationFrame`-bounded auto-resize loop, and the derived
 * `isCompact` ("the input is narrow enough to switch rendering modes")
 * flag. Carved out of `PremiumChatInput.tsx` so the composer no longer
 * carries ~50 lines of effect plumbing.
 *
 * Single source of truth for the textarea growth + responsive layout
 * cues. Callers compose the refs onto their respective elements and
 * read `isCompact` to switch between layouts.
 *
 * Auto-resize semantics:
 *   * Heights cap at `maxHeight` (default 200) to prevent runaway growth.
 *   * Empty message resets to `minHeight` (default 32).
 *   * The rAF is cancelled on cleanup to avoid orphan frame callbacks
 *     racing the next render.
 */

import { useEffect, useRef, useState } from "react";

const DEFAULT_MAX_HEIGHT = 200;
const DEFAULT_MIN_HEIGHT = 32;
const COMPACT_BREAKPOINT = 480;

export interface UseAutoResizeTextareaOptions {
  /** Current text-area value. Empty string triggers `minHeight`. */
  message: string;
  /**
   * Whether the sidebar layout forces compact mode. Optional — when the
   * prop on the host component is `boolean | undefined` (e.g. an
   * optional `isSidebar?: boolean`), the hook normalises the value
   * with `?? false` so callers do not need to coerce at the call site.
   */
  isSidebar?: boolean;
  /** Maximum height in pixels. Defaults to 200. */
  maxHeight?: number;
  /** Floor height in pixels. Defaults to 32. */
  minHeight?: number;
  /** Container width breakpoint that flips `isCompact` to true. Default 480. */
  compactBreakpoint?: number;
}

export interface UseAutoResizeTextareaResult {
  /** Attach to the `<textarea>`. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Attach to the wrapping `<div>` that owns width measurements. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** True if the container is narrow OR the input lives in a sidebar. */
  isCompact: boolean;
}

export function useAutoResizeTextarea({
  message,
  isSidebar = false,
  maxHeight = DEFAULT_MAX_HEIGHT,
  minHeight = DEFAULT_MIN_HEIGHT,
  compactBreakpoint = COMPACT_BREAKPOINT,
}: UseAutoResizeTextareaOptions): UseAutoResizeTextareaResult {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure the container. ResizeObserver fires whenever the parent
  // (sidebar vs. full-width vs. responsive collapse) changes shape.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.round(entry.contentRect.width);
        setContainerWidth((previousWidth) => previousWidth === nextWidth ? previousWidth : nextWidth);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-resize the textarea to fit its content. rAF coalescing keeps
  // keystroke-driven renders smooth and avoids layout thrash during
  // fast typing.
  useEffect(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = "auto";
      const nextHeight = !message ? minHeight : Math.min(textarea.scrollHeight, maxHeight);
      const nextHeightPx = `${nextHeight}px`;
      if (textarea.style.height !== nextHeightPx) {
        textarea.style.height = nextHeightPx;
      }
    });

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [message, maxHeight, minHeight, containerWidth]);

  const isCompact = (containerWidth > 0 && containerWidth < compactBreakpoint) || isSidebar;

  return { textareaRef, containerRef, isCompact };
}

export default useAutoResizeTextarea;
