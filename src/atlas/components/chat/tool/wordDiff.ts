export interface WordSegment {
  text: string;
  changed: boolean;
}

/** Split into words + whitespace + punctuation runs so intra-line edits align. */
function tokenize(s: string): string[] {
  return s.match(/(\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_])/g) ?? [];
}

/**
 * Character/word-level diff between two single lines using an LCS over tokens.
 * Returns per-side segments marking which spans changed. Applied ONLY to paired
 * single-line replacements so multi-line block edits stay accurate — the
 * accuracy failure that forced Cursor to pull word-diff in v2.0.60.
 */
export function wordDiff(
  oldLine: string,
  newLine: string,
): { old: WordSegment[]; new: WordSegment[] } {
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const oldSeg: WordSegment[] = [];
  const newSeg: WordSegment[] = [];
  const push = (arr: WordSegment[], text: string, changed: boolean) => {
    const last = arr[arr.length - 1];
    if (last && last.changed === changed) last.text += text;
    else arr.push({ text, changed });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(oldSeg, a[i], false);
      push(newSeg, b[j], false);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(oldSeg, a[i], true);
      i++;
    } else {
      push(newSeg, b[j], true);
      j++;
    }
  }
  while (i < n) push(oldSeg, a[i++], true);
  while (j < m) push(newSeg, b[j++], true);

  return { old: oldSeg, new: newSeg };
}

// ponytail: token-level LCS is O(n*m); fine for single lines. → skipped: char-level Myers, add when very long lines regress.

// Runnable self-check (no framework). Enable with WORDDIFF_SELFCHECK=1.
if (typeof process !== "undefined" && process.env?.WORDDIFF_SELFCHECK) {
  const r = wordDiff("const x = 1;", "const x = 2;");
  console.assert(r.old.map((s) => s.text).join("") === "const x = 1;", "old reconstructs");
  console.assert(r.new.map((s) => s.text).join("") === "const x = 2;", "new reconstructs");
  console.assert(r.old.some((s) => s.changed && s.text === "1"), "1 marked changed");
  console.assert(r.new.some((s) => s.changed && s.text === "2"), "2 marked changed");
  console.assert(!r.old.find((s) => s.text === "const")?.changed, "const unchanged");
}
