import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Message } from "./types";
import { scrubberTicks, tickIndexAt, type ChatScrubberAccent, type ChatScrubberTick } from "./chatScrubberModel";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

const accentLabels: Record<ChatScrubberAccent, string> = {
  approval: "Approval",
  edit: "File change",
  agent: "Subagent",
};

function anchorId(id: string) {
  return `chat-message-${id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function messageNode(id: string) {
  return document.getElementById(anchorId(id));
}

export function ChatTimelineScrubber({
  messages,
  scrollAreaRef,
}: {
  messages: Message[];
  scrollAreaRef: RefObject<HTMLDivElement | null>;
}) {
  const ticks = useMemo(() => scrubberTicks(messages), [messages]);
  const reducedMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [cardY, setCardY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const pointerMovedRef = useRef(false);

  useEffect(() => {
    setFocusIndex((current) => ticks.length === 0 ? 0 : Math.min(current, ticks.length - 1));
  }, [ticks.length]);

  const getViewport = useCallback(
    () => scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null,
    [scrollAreaRef],
  );

  const placeCard = useCallback((index: number) => {
    const rail = railRef.current;
    const node = rail?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!rail || !node) return;
    setCardY(node.offsetTop - rail.scrollTop + node.offsetHeight / 2);
  }, []);

  const showPreview = useCallback((index: number | null) => {
    setHoverIndex(index);
    if (index !== null) placeCard(index);
  }, [placeCard]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport || ticks.length === 0 || typeof IntersectionObserver === "undefined") return undefined;

    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.scrubId;
        if (!id) continue;
        if (entry.isIntersecting) seen.add(id);
        else seen.delete(id);
      }
      setVisibleIds(new Set(seen));
    }, { root: viewport, threshold: 0 });

    for (const tick of ticks) {
      const node = messageNode(tick.id);
      if (!node) continue;
      node.dataset.scrubId = tick.id;
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [getViewport, ticks]);

  const jump = useCallback((index: number, smooth = true) => {
    const tick = ticks[index];
    const node = tick ? messageNode(tick.id) : null;
    if (!node) return;
    node.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    node.classList.add("chat-scrub-target");
    window.setTimeout(() => node.classList.remove("chat-scrub-target"), 900);
  }, [ticks]);

  const scrubTo = useCallback((clientY: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const box = rail.getBoundingClientRect();
    const ratio = (clientY - box.top + rail.scrollTop) / Math.max(1, rail.scrollHeight);
    const index = tickIndexAt(ticks, ratio);
    if (index < 0) return;
    setFocusIndex(index);
    showPreview(index);
    jump(index, false);
  }, [jump, showPreview, ticks]);

  if (ticks.length === 0) return null;
  const preview: ChatScrubberTick | null = hoverIndex === null ? null : ticks[hoverIndex] || null;

  return (
    <motion.nav
      initial={reducedMotion ? false : { opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.standard, ease: motionEasings.standard }}
      className={cn("relative z-10 mx-2 hidden w-7 shrink-0 self-center py-2 sm:mx-3 sm:flex", dragging && "cursor-grabbing")}
      aria-label={`Conversation minimap, ${ticks.length} message${ticks.length === 1 ? "" : "s"}`}
      onMouseLeave={() => { if (!dragging) showPreview(null); }}
    >
      <div
        ref={railRef}
        className="flex max-h-[min(52vh,420px)] flex-col gap-[3px] overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => { if (hoverIndex !== null) placeCard(hoverIndex); }}
        onKeyDown={(event) => {
          const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
          if (!delta) return;
          event.preventDefault();
          const next = Math.min(ticks.length - 1, Math.max(0, focusIndex + delta));
          setFocusIndex(next);
          showPreview(next);
          railRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerMovedRef.current = false;
          setDragging(true);
          scrubTo(event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          pointerMovedRef.current = true;
          scrubTo(event.clientY);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {ticks.map((tick, index) => (
          <button
            key={tick.id}
            type="button"
            data-index={index}
            className="group/tick flex min-h-1 shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            style={{ height: `${Math.max(4, tick.weight * 4)}px` }}
            tabIndex={index === focusIndex ? 0 : -1}
            aria-label={`Message ${index + 1} of ${ticks.length}: ${tick.label}`}
            aria-current={visibleIds.has(tick.id) ? "location" : undefined}
            onMouseEnter={() => showPreview(index)}
            onFocus={() => { setFocusIndex(index); showPreview(index); }}
            onClick={() => {
              if (pointerMovedRef.current) {
                pointerMovedRef.current = false;
                return;
              }
              pointerMovedRef.current = false;
              jump(index);
            }}
          >
            <span
              className={cn(
                "h-0.5 w-2.5 rounded-full bg-muted-foreground/40 transition-[width,background-color] duration-150",
                visibleIds.has(tick.id) && "w-4 bg-foreground/70",
                hoverIndex === index && "w-[17px] bg-foreground",
                tick.accent === "approval" && "bg-amber-400/80",
                tick.accent === "edit" && "bg-emerald-400/80",
                tick.accent === "agent" && "bg-orange-300/80",
              )}
            />
          </button>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {preview && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, x: -4, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, x: -4, scale: 0.98 }}
          transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
          className="pointer-events-none absolute left-full top-0 z-20 w-[min(300px,calc(100vw-48px))] -translate-y-1/2 rounded-lg border border-border bg-card px-2.5 py-2 shadow-2xl"
          style={{ top: cardY || "50%" }}
          role="tooltip"
        >
          <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>You</span>
            {preview.accent && <span className="rounded-full bg-muted px-1.5 py-0.5 text-foreground/80">{accentLabels[preview.accent]}</span>}
            <span className="ml-auto font-mono tabular-nums">{(hoverIndex ?? 0) + 1} / {ticks.length}</span>
          </div>
          <p className="mb-1 line-clamp-2 text-[11px] leading-relaxed text-foreground">{preview.label}</p>
          {preview.reply && <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground"><b className="mr-1 text-[9px] uppercase">Agent</b>{preview.reply}</p>}
        </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
