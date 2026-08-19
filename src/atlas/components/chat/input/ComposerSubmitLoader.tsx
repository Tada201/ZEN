import type { CSSProperties } from "react";

/**
 * 3×3 matrix loader shown inside the composer submit button while a run is
 * active. Squares pulse in clockwise order (top-mid → top-right → … → top-left),
 * center skipped. Colour is inherited (`currentColor`) so it flips with the
 * button's text token; radius rides the shared `--radius` ramp. Pulse timing
 * and the motion-off freeze live in `index.css` (.composer-matrix*).
 */

// Grid cells 0-8 (row-major). Value = clockwise animation rank; "center" is skipped.
const MATRIX: (number | "center")[] = [7, 0, 1, 6, "center", 2, 5, 4, 3];

export function ComposerSubmitLoader() {
  return (
    <span className="composer-matrix" aria-hidden="true">
      {MATRIX.map((rank, i) => (
        <span
          key={i}
          className="composer-matrix-cell"
          data-center={rank === "center" || undefined}
          style={rank === "center" ? undefined : ({ "--matrix-rank": rank } as CSSProperties)}
        />
      ))}
    </span>
  );
}

export default ComposerSubmitLoader;
