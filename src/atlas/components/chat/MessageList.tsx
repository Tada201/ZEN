import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ArtifactData, Message } from "./types";
import { MessageItem } from "./MessageItem";
import { buildMessageListStreamSignature } from "./messageListStreamSignature";
import { ChatTimelineScrubber } from "./ChatTimelineScrubber";

const MemoizedMessageItem = memo(MessageItem);

// Long threads keep every committed row in the DOM, which grows unbounded on
// deep sessions. Render the first HEAD rows (opening context) plus the last
// TAIL rows (recent activity), collapsing the middle behind a one-click reveal.
// The active tail message is always rendered separately, so windowing only
// touches settled transcript.
const WINDOW_HEAD = 2;
const WINDOW_TAIL = 40;
const WINDOW_THRESHOLD = WINDOW_HEAD + WINDOW_TAIL + 1;

export const MessageList = memo(function MessageList({
  messages,
  onOpenArtifact,
  isStreaming: _isStreaming,
  onRetry,
  onOpenSettings,
  onDismissError,
  onRegenerate,
  onContinueResearch,
  compact,
}: {
  messages: Message[];
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onContinueResearch?: (request: string) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const previousMessageCount = useRef(0);

  const getViewport = useCallback(
    () => scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null,
    [],
  );

  const scheduleScrollToBottom = useCallback(() => {
    if (!isAutoScrolling.current || scrollFrameRef.current !== null) return;
    const viewport = getViewport();
    if (!viewport) return;

    // Coalesce stream updates and composer-driven viewport resizes into one
    // paint-time write. This keeps the transcript pinned without forcing a
    // synchronous reflow while the textarea is growing.
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (isAutoScrolling.current) viewport.scrollTop = viewport.scrollHeight;
    });
  }, [getViewport]);

  const filteredMessages = useMemo(
    () => messages.filter((message) =>
      message.kind !== "tool_call" &&
      message.kind !== "tool_result" &&
      message.kind !== "system"
    ),
    [messages],
  );

  // Keep committed history and the mutable active tail as separate projections.
  // Only the tail signature participates in stream-driven scroll work.
  const committedMessages = useMemo(
    () => filteredMessages.slice(0, Math.max(0, filteredMessages.length - 1)),
    [filteredMessages],
  );
  const activeMessage = filteredMessages[filteredMessages.length - 1] as Message | undefined;
  const activeMessageSignature = useMemo(
    () => activeMessage ? buildMessageListStreamSignature(activeMessage) : "",
    [activeMessage],
  );

  // Collapse the middle of long committed histories by default. Expanding is a
  // one-way reveal per mount; a thread short enough to fit never collapses.
  const [showAllCommitted, setShowAllCommitted] = useState(false);
  const pendingScrubTargetRef = useRef<string | null>(null);
  const isWindowed = !showAllCommitted && committedMessages.length >= WINDOW_THRESHOLD;
  const revealScrubTarget = useCallback((messageId: string) => {
    pendingScrubTargetRef.current = messageId;
    setShowAllCommitted(true);
  }, []);
  const hiddenCount = isWindowed ? committedMessages.length - WINDOW_HEAD - WINDOW_TAIL : 0;
  const visibleCommitted = useMemo(
    () => isWindowed
      ? [...committedMessages.slice(0, WINDOW_HEAD), ...committedMessages.slice(-WINDOW_TAIL)]
      : committedMessages,
    [isWindowed, committedMessages],
  );

  useEffect(() => {
    const targetId = pendingScrubTargetRef.current;
    if (!targetId || isWindowed) return;
    pendingScrubTargetRef.current = null;

    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`chat-message-${targetId}`.replace(/[^a-zA-Z0-9_-]/g, "-"));
      if (!node) return;
      node.scrollIntoView({ behavior: "auto", block: "start" });
      node.classList.add("chat-scrub-target");
      window.setTimeout(() => node.classList.remove("chat-scrub-target"), 900);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isWindowed]);

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
    scheduleScrollToBottom();
  }, [activeMessageSignature, filteredMessages.length, scheduleScrollToBottom]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport || typeof ResizeObserver === "undefined") return;

    // The composer now participates in normal flow, so its auto-growing
    // height resizes this viewport. Preserve the user's pinned-to-bottom
    // intent without moving readers who are browsing older messages.
    const observer = new ResizeObserver(() => scheduleScrollToBottom());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [getViewport, scheduleScrollToBottom]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  return (
    <div className="chat-density-compact relative flex min-h-0 flex-1">
      <ChatTimelineScrubber
        messages={filteredMessages}
        scrollAreaRef={scrollRef}
        onMissingTarget={revealScrubTarget}
      />
      <ScrollArea ref={scrollRef} className="min-w-0 flex-1 bg-transparent">
      {filteredMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 pt-20 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-primary">
            <Bot className="h-6 w-6" />
          </div>
        </div>
      ) : (
        <div className="w-full [overflow-anchor:auto] pb-4">
          {visibleCommitted.map((message, index) => (
            <div key={message.id}>
              {isWindowed && index === WINDOW_HEAD && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => setShowAllCommitted(true)}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/70"
                  >
                    Show {hiddenCount} earlier messages
                  </button>
                </div>
              )}
              <div
                id={`chat-message-${message.id}`.replace(/[^a-zA-Z0-9_-]/g, "-")}
                className="scroll-mt-4"
              >
                <MemoizedMessageItem
                  // The tail is the only mutable record during a run; stable
                  // preceding rows remain memoized committed transcript.
                  message={message}
                  onOpenArtifact={onOpenArtifact}
                  onRetry={onRetry}
                  onOpenSettings={onOpenSettings}
                  onDismissError={onDismissError}
                  onRegenerate={onRegenerate}
                  onContinueResearch={onContinueResearch}
                  isChatStreaming={_isStreaming}
                  messages={message.kind === "deep_research" ? filteredMessages : undefined}
                  compact={compact}
                />
              </div>
            </div>
          ))}
          {activeMessage && (
            <div
              key={activeMessage.id}
              id={`chat-message-${activeMessage.id}`.replace(/[^a-zA-Z0-9_-]/g, "-")}
              className="scroll-mt-4"
            >
              <MemoizedMessageItem
                message={activeMessage}
                onOpenArtifact={onOpenArtifact}
                onRetry={onRetry}
                onOpenSettings={onOpenSettings}
                onDismissError={onDismissError}
                onRegenerate={onRegenerate}
                onContinueResearch={onContinueResearch}
                isChatStreaming={_isStreaming}
                messages={activeMessage.kind === "deep_research" ? filteredMessages : undefined}
                compact={compact}
              />
            </div>
          )}
        </div>
      )}
      </ScrollArea>
    </div>
  );
});
