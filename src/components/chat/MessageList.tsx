import { useRef, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Message, ArtifactData } from "./types";
import { MessageItem } from "./MessageItem";

const MemoizedMessageItem = memo(MessageItem);

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

  // Get the actual scrollable element from Radix ScrollArea
  const getViewport = () => scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: getViewport,
    estimateSize: () => 150, // Average message height estimate
    overscan: 5,
  });

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
  }, []);

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    const viewport = getViewport();
    if (viewport && isAutoScrolling.current) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: isStreaming ? "auto" : "smooth"
      });
    }
  }, [messages.length, messages[messages.length - 1]?.content.length, isStreaming]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <ScrollArea 
      ref={scrollRef} 
      className="flex-1 bg-background/50"
    >
      <div 
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize() + 192}px`, // Add padding at bottom
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32 text-center px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary mb-6 animate-pulse">
              <Bot className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">How can I help you today?</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              I'm Zen, your OSINT and investigation assistant. I can analyze telemetry, search records, and build visual reports for you.
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
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MemoizedMessageItem
                  message={m}
                  onOpenArtifact={onOpenArtifact}
                  isStreaming={isStreaming && virtualItem.index === messages.length - 1}
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
