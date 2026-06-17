import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ArtifactData, Message } from "./types";
import { MessageItem } from "./MessageItem";
import { buildMessageListStreamSignature } from "./messageListStreamSignature";

const MemoizedMessageItem = memo(MessageItem);

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
  const lastScrollTime = useRef(0);
  const previousMessageCount = useRef(0);

  const getViewport = useCallback(
    () => scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null,
    [],
  );

  const filteredMessages = useMemo(
    () => messages.filter((message) => message.kind !== "tool_call" && message.kind !== "tool_result"),
    [messages],
  );

  const activeMessageSignature = useMemo(() => {
    const last = filteredMessages[filteredMessages.length - 1];
    return buildMessageListStreamSignature(last);
  }, [filteredMessages]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const onScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isAutoScrolling.current = distanceFromBottom <= 100;
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  useEffect(() => {
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    const addedMessage = filteredMessages.length > previousMessageCount.current;
    if (addedMessage && lastMessage?.role === "user") {
      isAutoScrolling.current = true;
    }
    previousMessageCount.current = filteredMessages.length;
  }, [filteredMessages]);

  useEffect(() => {
    if (!isAutoScrolling.current || filteredMessages.length === 0) return;
    const viewport = getViewport();
    if (!viewport) return;

    const now = performance.now();
    if (now - lastScrollTime.current < 50) return;
    lastScrollTime.current = now;

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMessageSignature, filteredMessages.length, getViewport]);

  return (
    <ScrollArea ref={scrollRef} className="flex-1 bg-transparent">
      {filteredMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 pt-32 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary animate-pulse">
            <Bot className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-xl font-bold tracking-tight">How can I help you today?</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            I'm Zen, your frontier AI coding assistant. I can write code, search the web, and build generative UI components for you.
          </p>
        </div>
      ) : (
        <div className="w-full pb-8">
          {filteredMessages.map((message) => (
            <MemoizedMessageItem
              key={message.id}
              message={message}
              onOpenArtifact={onOpenArtifact}
              onRetry={onRetry}
              onOpenSettings={onOpenSettings}
              onDismissError={onDismissError}
              onRegenerate={onRegenerate}
              compact={compact}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
});
