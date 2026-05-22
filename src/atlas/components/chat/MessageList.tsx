import { useEffect, useRef, memo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Message, ArtifactData } from "./types";
import { MessageItem } from "./MessageItem";

// Fix #9: Custom memo comparator — the message prop is a new object reference
// on every streaming update (spread in useStreamingChat), so default shallow
// memo never prevents a re-render. Compare meaningful fields instead.
const MemoizedMessageItem = memo(MessageItem, (prev, next) => {
  return prev.message.id === next.message.id
    && prev.message.content === next.message.content
    && prev.message.status === next.message.status
    && prev.message.steps?.length === next.message.steps?.length
    && prev.message.error === next.message.error
    && prev.compact === next.compact;
});

export const MessageList = memo(function MessageList({
  messages,
  onOpenArtifact,
  isStreaming,
  onRetry,
  onOpenSettings,
  compact,
}: {
  messages: Message[];
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: any, provider?: string) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(true);
  // Fix #3: Throttle scroll updates to max 20/sec
  const lastScrollTime = useRef(0);

  // Get the actual scrollable element from Radix ScrollArea
  const getViewport = useCallback(() => scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement, []);

  // Fix #8: Dynamic estimateSize — track measured sizes for better scroll bar accuracy
  const sizeCache = useRef(new Map<number, number>());

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: getViewport,
    estimateSize: (index) => sizeCache.current.get(index) || 200,
    overscan: 5,
  });

  // Callback for caching measured sizes from the virtualizer
  const measureElementWithCache = useCallback((el: HTMLElement | null) => {
    if (el) {
      rowVirtualizer.measureElement(el);
      const index = Number(el.dataset.index);
      if (!isNaN(index) && el.offsetHeight > 0) {
        sizeCache.current.set(index, el.offsetHeight);
      }
    }
  }, [rowVirtualizer]);

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

  // Fix #1 & #3: Auto-scroll using virtualizer API with throttle.
  // Removed content.length dependency — virtualizer handles size changes via measureElement.
  useEffect(() => {
    if (!isAutoScrolling.current || messages.length === 0) return;

    const now = Date.now();
    if (now - lastScrollTime.current < 50) return; // Max 20 scroll/sec
    lastScrollTime.current = now;

    rowVirtualizer.scrollToIndex(messages.length - 1, {
      align: 'end',
      behavior: isStreaming ? 'auto' : 'smooth',
    });
  }, [messages.length, isStreaming, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <ScrollArea 
      ref={scrollRef} 
      className="flex-1 bg-transparent"
    >
      <div 
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize() + 192}px`, // Add 192px (12rem) padding to total size
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32 text-center px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary mb-6 animate-pulse">
              <BotIcon className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">How can I help you today?</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              I'm Zen, your frontier AI coding assistant. I can write code, search the web, and build generative UI components for you.
            </p>
          </div>
        ) : (
          virtualItems.map((virtualItem) => {
            const m = messages[virtualItem.index];
            if (!m) return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={measureElementWithCache}
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MemoizedMessageItem
                  message={m}
                  onOpenArtifact={onOpenArtifact}
                  onRetry={onRetry}
                  onOpenSettings={onOpenSettings}
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

function BotIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

