export interface TruncatedOutput {
  head: string[];
  middleCount: number;
  tail: string[];
}

/**
 * Split a line array into head + omitted count + tail so long output stays
 * bounded. When the total is below the cap, the whole array is returned in
 * `head` with zero omitted lines.
 */
export function truncateMiddle(
  lines: string[],
  headLines: number,
  tailLines: number,
): TruncatedOutput {
  if (lines.length <= headLines + tailLines) {
    return { head: lines, middleCount: 0, tail: [] };
  }
  return {
    head: lines.slice(0, headLines),
    middleCount: Math.max(0, lines.length - headLines - tailLines),
    tail: lines.slice(-tailLines),
  };
}
