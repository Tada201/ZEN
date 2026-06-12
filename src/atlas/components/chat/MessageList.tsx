import { useEffect, useRef, memo, useCallback, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bot } from "lucide-react";
import { Message, ArtifactData } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import { MessageItem } from "./MessageItem";
import { buildMessageListStreamSignature } from "./messageListStreamSignature";

const MemoizedMessageItem = memo(MessageItem);
const LIST_TOP_PADDING = 96;
const LIST_BOTTOM_PADDING = 192;

export const MessageList = memo(function MessageList({
  messages,
  onOpenArtifact,
  isStreaming: _isStreaming,
  onRetry,
  onOpenSettings,
  onDismissError,
  onRegenerate,
  compact,
}: {
  messages: Message[];
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(true);
  // Fix #3: Throttle scroll updates to max 20/sec
  const lastScrollTime = useRef(0);
  const resizeObservers = useRef(new Map<Element, ResizeObserver>());
  const lastViewportWidth = useRef(0);
  const measureFrame = useRef<number | null>(null);
  const followupMeasureFrame = useRef<number | null>(null);
  const delayedMeasureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get the actual scrollable element from Radix ScrollArea
  const getViewport = useCallback(() => scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement, []);

  // Fix #8: Dynamic estimateSize — track measured sizes for better scroll bar accuracy
  const sizeCache = useRef(new Map<number, number>());

  const filteredMessages = useMemo(() => {
    return messages.filter(m => m.kind !== "tool_call" && m.kind !== "tool_result");
  }, [messages]);

  const messageOrderSignature = useMemo(
    () => filteredMessages.map((message) => message.id).join("|"),
    [filteredMessages],
  );

  const activeMessageSignature = useMemo(() => {
    const last = filteredMessages[filteredMessages.length - 1];
    if (!last) return "";
    return buildMessageListStreamSignature(last);
  }, [filteredMessages]);

  const rowVirtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: getViewport,
    getItemKey: (index) => filteredMessages[index]?.id ?? index,
    estimateSize: (index) => sizeCache.current.get(index) || 400,
    overscan: 5,
  });

  // Re-read heights from all mounted DOM elements and update virtualizer + cache
  const remeasureAllMountedElements = useCallback(() => {
    resizeObservers.current.forEach((_observer, el) => {
      const htmlEl = el as HTMLElement;
      rowVirtualizer.measureElement(htmlEl);
      const index = Number(htmlEl.dataset?.index);
      if (!isNaN(index) && htmlEl.offsetHeight > 0) {
        sizeCache.current.set(index, htmlEl.offsetHeight);
      }
    });
  }, [rowVirtualizer]);

  const scheduleFullMeasure = useCallback(() => {
    if (measureFrame.current !== null) return;
    measureFrame.current = window.requestAnimationFrame(() => {
      measureFrame.current = null;
      // Re-measure all mounted elements directly from DOM instead of
      // clearing cache (which would fall back to wrong 200px estimates)
      remeasureAllMountedElements();
      followupMeasureFrame.current = window.requestAnimationFrame(() => {
        followupMeasureFrame.current = null;
        remeasureAllMountedElements();
      });
      // Delayed pass for snap/instant resizes where DOM reflow is deferred
      if (delayedMeasureTimer.current !== null) clearTimeout(delayedMeasureTimer.current);
      delayedMeasureTimer.current = setTimeout(() => {
        delayedMeasureTimer.current = null;
        remeasureAllMountedElements();
      }, 150);
      if (isAutoScrolling.current && filteredMessages.length > 0) {
        rowVirtualizer.scrollToIndex(filteredMessages.length - 1, {
          align: "end",
          behavior: "auto",
        });
      }
    });
  }, [filteredMessages.length, remeasureAllMountedElements, rowVirtualizer]);

  // Callback for caching measured sizes from the virtualizer
  const measureElementWithCache = useCallback((el: HTMLElement | null) => {
    if (el) {
      rowVirtualizer.measureElement(el);
      const index = Number(el.dataset.index);
      if (!isNaN(index) && el.offsetHeight > 0) {
        sizeCache.current.set(index, el.offsetHeight);
      }
      if (!resizeObservers.current.has(el)) {
        const observer = new ResizeObserver(() => {
          rowVirtualizer.measureElement(el);
          const nextIndex = Number(el.dataset.index);
          if (!isNaN(nextIndex) && el.offsetHeight > 0) {
            sizeCache.current.set(nextIndex, el.offsetHeight);
          }
        });
        observer.observe(el);
        resizeObservers.current.set(el, observer);
      }
    }
  }, [rowVirtualizer]);

  useEffect(() => {
    sizeCache.current.clear();
    rowVirtualizer.measure();
  }, [messageOrderSignature, rowVirtualizer]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    lastViewportWidth.current = viewport.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? viewport.clientWidth);
      if (!width || Math.abs(width - lastViewportWidth.current) < 2) return;
      lastViewportWidth.current = width;
      scheduleFullMeasure();
    });

    observer.observe(viewport);

    // Fix: force re-measure when crossing the md breakpoint (768px)
    // since tool cards use md:grid-cols-2 which causes dramatic height changes
    const mql = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = () => scheduleFullMeasure();
    mql.addEventListener("change", onBreakpoint);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", onBreakpoint);
    };
  }, [getViewport, scheduleFullMeasure]);

  useEffect(() => {
    return () => {
      if (measureFrame.current !== null) {
        window.cancelAnimationFrame(measureFrame.current);
        measureFrame.current = null;
      }
      if (followupMeasureFrame.current !== null) {
        window.cancelAnimationFrame(followupMeasureFrame.current);
        followupMeasureFrame.current = null;
      }
      if (delayedMeasureTimer.current !== null) {
        clearTimeout(delayedMeasureTimer.current);
        delayedMeasureTimer.current = null;
      }
      resizeObservers.current.forEach((observer) => observer.disconnect());
      resizeObservers.current.clear();
    };
  }, []);

  // Track if the user manually scrolled up
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const onScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      // If we are within 100px of bottom, we consider it "at bottom"
      const atBottom = Math.ceil(scrollHeight - scrollTop) - clientHeight <= 100;
      isAutoScrolling.current = atBottom;
    };

    viewport.addEventListener("scroll", onScroll);
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  // Only auto-scroll on user-initiated sends, not on assistant responses.
  // If user scrolled up to read history, don't yank them back.
  const prevLengthRef = useRef(filteredMessages.length);
  useEffect(() => {
    if (filteredMessages.length > prevLengthRef.current) {
      const lastMsg = filteredMessages[filteredMessages.length - 1];
      if (lastMsg?.role === "user") {
        isAutoScrolling.current = true;
      }
    }
    prevLengthRef.current = filteredMessages.length;
  }, [filteredMessages.length]);

  // Recalculate virtualizer positions when content changes (prevents overlap
  // when streaming messages grow beyond their initial height estimate).
  useEffect(() => {
    rowVirtualizer.measure();
  }, [activeMessageSignature, filteredMessages.length, rowVirtualizer]);

  // Auto-scroll with throttle: allow unthrottled scroll on new messages,
  // throttle only during streaming content growth.
  useEffect(() => {
    if (!isAutoScrolling.current || filteredMessages.length === 0) return;

    const isNewMessage = filteredMessages.length > prevLengthRef.current;
    const now = Date.now();

    // Always scroll immediately for new messages (user just sent something)
    if (isNewMessage) {
      lastScrollTime.current = now;
    } else if (now - lastScrollTime.current < 50) {
      return; // Throttle during streaming content growth
    }
    lastScrollTime.current = now;

    rowVirtualizer.scrollToIndex(filteredMessages.length - 1, {
      align: 'end',
      behavior: 'auto',
    });
  }, [filteredMessages.length, activeMessageSignature, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <ScrollArea 
      ref={scrollRef} 
      className="flex-1 bg-transparent"
    >
      <div 
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize() + LIST_TOP_PADDING + LIST_BOTTOM_PADDING}px`,
        }}
      >
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32 text-center px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary mb-6 animate-pulse">
              <Bot className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">How can I help you today?</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              I'm Zen, your frontier AI coding assistant. I can write code, search the web, and build generative UI components for you.
            </p>
          </div>
        ) : (
          virtualItems.map((virtualItem) => {
            const m = filteredMessages[virtualItem.index];
            if (!m) return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={measureElementWithCache}
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start + LIST_TOP_PADDING}px)`,
                  zIndex: 0,
                  contain: "style",
                }}
              >
                <MemoizedMessageItem
                  message={m}
                  onOpenArtifact={onOpenArtifact}
                  onRetry={onRetry}
                  onOpenSettings={onOpenSettings}
                  onDismissError={onDismissError}
                  onRegenerate={onRegenerate}
                  compact={compact}
                />
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
});
