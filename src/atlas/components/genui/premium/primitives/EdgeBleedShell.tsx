import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EdgeBleedShellProps {
  children: ReactNode;
  /**
   * Bleed axis. `both` (default) breaks out top and bottom; `top` only
   * breaks the top boundary (useful when content continues below); `bottom`
   * is useful when you've already broken the top with a different element
   * and want the bottom to align to the card edge.
   */
  axis?: "both" | "top" | "bottom";
  /**
   * Render a dark-to-transparent gloss at the bottom edge so overlaid
   * metadata (titles, captions) stays legible over bright hero images.
   * Default true when children is not provided and `bottom`/`both` is
   * selected; caller's children can include their own overlay.
   */
  gloss?: boolean;
  /**
   * Aspect ratio constraint for the bleed area. When set, wraps the
   * children in a div with the corresponding aspect-ratio so cards stay
   * vertically consistent across different data sets (e.g., all book cards
   * are 16:10). Accepts "16/10", "4/3", "1/1", "21/9", etc., or a number
   * (height/width).
   */
  aspect?: string | number;
  className?: string;
}

/**
 * Bleeds content past `<CardShell>`'s default p-5 padding so media (movie
 * posters, album covers, book covers, map tiles) can extend edge-to-edge
 * inside the card while the rest of the card's metadata still respects the
 * 20-px padding. The bleed margin is exactly p-5 (1.25 rem ≈ 20 px), so use
 * `<CardShell>` as the outer container.
 *
 * Place this component as the first and/or last child of `<CardShell>`. The
 * bleed margin only goes in one direction per instance, so to bleed BOTH
 * edges (the typical case for a hero image with a metadata footer) wrap the
 * top media in `<EdgeBleedShell axis="top">` and the bottom metadata in
 * `<EdgeBleedShell axis="bottom" gloss>`.
 *
 * @example
 * ```tsx
 * <CardShell>
 *   <EdgeBleedShell axis="top">
 *     <img className="w-full h-40 object-cover" src={movie.poster} />
 *   </EdgeBleedShell>
 *   <div className="mt-4">…metadata…</div>
 * </CardShell>
 * ```
 */
export function EdgeBleedShell({
  children,
  axis = "both",
  gloss = axis !== "top",
  aspect,
  className,
}: EdgeBleedShellProps) {
  // p-5 is the CardShell default. We use ml-5 mr-5 (horizontal) only when
  // not bleeding; the vertical margins break out symmetrically.
  // We deliberately don't bleed horizontally — the chat column already
  // gives the card its full width, and bleeding the sides would clip into
  // the message wrapper.
  const marginClass =
    axis === "top"
      ? "-mt-5"
      : axis === "bottom"
        ? "-mb-5"
        : "-my-5";

  const aspectClass =
    aspect != null
      ? typeof aspect === "number"
        ? `[aspect-ratio:${aspect}]`
        : `aspect-[${aspect.replace("/", "_")}]`
      : null;

  return (
    <div
      className={cn(
        marginClass,
        "relative isolate overflow-hidden",
        className,
      )}
      // The negative margin pulls the wrapper flush to CardShell's
      // rounded border edge. CardShell's `overflow-hidden rounded-2xl`
      // clips anything outside the inner padding box, so the bleed lands
      // exactly on the rounded corners with no extra gaps.
    >
      {aspectClass ? (
        <div className={cn("w-full", aspectClass)}>{children}</div>
      ) : (
        children
      )}
      {gloss && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
        />
      )}
    </div>
  );
}
