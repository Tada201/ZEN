export interface ParsedDiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

export interface ParsedDiffHunk {
  lines: ParsedDiffLine[];
}

export interface ParsedUnifiedDiff {
  hunks: ParsedDiffHunk[];
  additions: number;
  deletions: number;
}

/**
 * Parse a unified-diff string into hunks shaped for {@link DiffCard}.
 * Handles standard `@@ ... @@` hunk headers and `+`/`-`/` ` line prefixes.
 * File headers (`---`, `+++`, `diff --git`, `index`) are skipped. Malformed or
 * empty input yields zero hunks so callers can fall back to a raw code block.
 */
export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  const hunks: ParsedDiffHunk[] = [];
  let additions = 0;
  let deletions = 0;

  if (!diff || typeof diff !== "string") {
    return { hunks, additions, deletions };
  }

  let current: ParsedDiffHunk | undefined;
  const lines = diff.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    if (line.startsWith("@@")) {
      current = { lines: [] };
      hunks.push(current);
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
      current.lines.push({ type: "add", content: line.slice(1) });
      additions += 1;
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "remove", content: line.slice(1) });
      deletions += 1;
    } else if (line.startsWith(" ")) {
      current.lines.push({ type: "context", content: line.slice(1) });
    } else if (line.length > 0) {
      // Unprefixed content line — treat as context so nothing is dropped.
      current.lines.push({ type: "context", content: line });
    }
  }

  // Drop hunks that ended up empty (e.g. trailing header-only sections).
  const nonEmpty = hunks.filter((hunk) => hunk.lines.length > 0);

  return { hunks: nonEmpty, additions, deletions };
}
