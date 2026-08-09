import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Inline fold-out wrapper for data-heavy cards in the assistant transcript.
 *
 * Defaults to a thin header (chevron + summary line), so a long WeatherCard
 * or DiffCard no longer eats an entire viewport when the user only needs
 * the headline values. Click — or Enter / Space — to reveal the full body.
 *
 * Implementer notes:
 * - Built on Radix Collapsible so keyboard focus, aria-expanded and the
 *   trigger → content wiring are handled correctly.
 * - Uses the modern `grid-template-rows: 0fr ↔ 1fr` transition trick to
 *   animate auto height without measuring. The keyframe approach was
 *   rejected here because it requires extra CSS registration and the
 *   grid-rows trick survives arbitrary inner content.
 * - Honors the app motion preference by snapping the open/close state
 *   instantly and not animating the chevron transform.
 *
 * The wrapper accepts any single-line `summary` content; the consumer is
 * responsible for projecting the card's data into a one-line preview. See
 * `getFoldOutSummary` in `AssistantMessage.tsx`.
 */
const FoldOutCard = CollapsiblePrimitive.Root;

const FoldOutCardTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const shouldReduceMotion = useReducedMotion();
  return (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={cn(
        "group/foldout w-full flex items-center gap-2 px-4 py-2.5 text-left",
        "text-[11px] font-medium text-muted-foreground hover:text-foreground",
        "hover:bg-muted transition-colors",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
        "data-[state=closed]:rounded-2xl data-[state=open]:rounded-t-2xl",
        className,
      )}
      {...props}
    >
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-muted-foreground",
          shouldReduceMotion
            ? "transition-none"
            : "transition-transform duration-200 ease-out group-data-[state=open]/foldout:rotate-90",
        )}
        aria-hidden="true"
      />
      <span className="truncate flex-1 font-mono tracking-tight">{children}</span>
    </CollapsiblePrimitive.Trigger>
  );
});
FoldOutCardTrigger.displayName = "FoldOutCardTrigger";

const FoldOutCardContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const shouldReduceMotion = useReducedMotion();
  return (
    <CollapsiblePrimitive.Content
      ref={ref}
      forceMount={shouldReduceMotion ? true : undefined}
      className={cn(
        "grid",
        shouldReduceMotion
          ? "data-[state=open]:grid-rows-[1fr] data-[state=closed]:hidden"
          : "transition-[grid-template-rows] duration-200 ease-out data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr]",
        className,
      )}
      style={{
        // Defensive override — Tailwind data-state utilities above are the
        // source of truth, but inline style guard for downstream CSS resets.
        ...style,
      }}
      {...props}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden",
          shouldReduceMotion ? "" : "transition-opacity duration-200",
          // While collapsed, the inner content sits behind the closed
          // 0fr row — opacity doesn't matter visually but lets any focusable
          // children inside the content (links, buttons) become inert until
          // the section is opened.
          !shouldReduceMotion ? "data-[state=closed]:opacity-0 data-[state=open]:opacity-100" : "",
        )}
      >
        <div className="border-t border-border data-[state=closed]:rounded-b-2xl data-[state=open]:rounded-b-2xl">
          {children}
        </div>
      </div>
    </CollapsiblePrimitive.Content>
  );
});
FoldOutCardContent.displayName = "FoldOutCardContent";

export {
  FoldOutCard,
  FoldOutCardTrigger,
  FoldOutCardContent,
};
