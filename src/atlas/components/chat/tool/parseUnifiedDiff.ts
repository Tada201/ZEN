import { wordDiff, type WordSegment } from "./wordDiff";

export interface ParsedDiffLine {
  type: "add" | "remove" | "context";
  content: string;
  /** 1-based line number in the old file (remove/context). */
  oldLine?: number;
  /** 1-based line number in the new file (add/context). */
  newLine?: number;
  /** Word-level segments when this line is part of a 1:1 replacement pair. */
  segments?: WordSegment[];
}

export interface ParsedDiffHunk {
  lines: ParsedDiffLine[];
}

export interface ParsedUnifiedDiff {
  hunks: ParsedDiffHunk[];
  additions: number;
  deletions: number;
}

const HUNK_HEADER = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parse a unified-diff string into hunks shaped for {@link DiffCard}.
 * Recovers old/new line numbers from `@@ -o,c +n,c @@` headers and computes
 * word-level segments for paired single-line replacements (a `-` line directly
 * followed by one `+` line). File headers (`---`, `+++`, `diff --git`, `index`)
 * are skipped. Malformed or empty input yields zero hunks so callers can fall
 * back to a raw code block.
 */
export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  const hunks: ParsedDiffHunk[] = [];
  let additions = 0;
  let deletions = 0;

  if (!diff || typeof diff !== "string") {
    return { hunks, additions, deletions };
  }

  let current: ParsedDiffHunk | undefined;
  let oldNo = 0;
  let newNo = 0;
  const lines = diff.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    const header = line.match(HUNK_HEADER);
    if (header) {
      current = { lines: [] };
      hunks.push(current);
      oldNo = parseInt(header[1], 10);
      newNo = parseInt(header[2], 10);
      continue;
    }

    // Skip file-level headers that are not part of any hunk body.
    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity ") ||
      line.startsWith("rename ")
    ) {
      continue;
    }

    if (!current) {
      // Diff body without a hunk header (e.g. a bare +/- block). Start one.
      current = { lines: [] };
      hunks.push(current);
    }

    if (line.startsWith("+")) {
      current.lines.push({ type: "add", content: line.slice(1), newLine: newNo++ });
      additions += 1;
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "remove", content: line.slice(1), oldLine: oldNo++ });
      deletions += 1;
    } else if (line.startsWith(" ")) {
      current.lines.push({ type: "context", content: line.slice(1), oldLine: oldNo++, newLine: newNo++ });
    } else if (line.length > 0) {
      // Unprefixed content line — treat as context so nothing is dropped.
      current.lines.push({ type: "context", content: line, oldLine: oldNo++, newLine: newNo++ });
    }
  }

  // Drop hunks that ended up empty (e.g. trailing header-only sections).
  const nonEmpty = hunks.filter((hunk) => hunk.lines.length > 0);
  for (const hunk of nonEmpty) annotateWordDiffs(hunk.lines);

  return { hunks: nonEmpty, additions, deletions };
}

/**
 * Attach word-level segments to isolated 1:1 replacements: exactly one `remove`
 * immediately followed by exactly one `add`. Bounded to this case so multi-line
 * block edits are never mis-aligned (the accuracy failure that forced Cursor to
 * pull word-diff in v2.0.60).
 */
function annotateWordDiffs(lines: ParsedDiffLine[]): void {
  for (let i = 0; i < lines.length - 1; i++) {
    const rem = lines[i];
    const add = lines[i + 1];
    const prevAdjacent = i > 0 && lines[i - 1].type === "remove";
    const nextAdjacent = i + 2 < lines.length && lines[i + 2].type === "add";
    if (rem.type === "remove" && add.type === "add" && !prevAdjacent && !nextAdjacent) {
      const seg = wordDiff(rem.content, add.content);
      rem.segments = seg.old;
      add.segments = seg.new;
      i++; // consume the pair
    }
  }
}
