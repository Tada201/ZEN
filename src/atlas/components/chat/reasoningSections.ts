export interface ReasoningSection {
  id: string;
  title: string;
  content: string;
}

function cleanTitle(value: string): string {
  return value
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function inferTitle(content: string, index: number): string {
  const firstLine = content.split("\n").find((line) => line.trim())?.trim() || "";
  const normalized = cleanTitle(firstLine).replace(/[.!?:]+$/, "");
  if (/\b(inspect|read|review|understand|context|constraint|existing)\b/i.test(normalized)) return "Context";
  if (/\b(plan|approach|compare|choose|decid|strategy)\b/i.test(normalized)) return "Approach";
  if (/\b(edit|implement|write|change|build|apply)\b/i.test(normalized)) return "Implementation";
  if (/\b(test|verify|validat|check|confirm)\b/i.test(normalized)) return "Validation";
  if (/\b(result|conclu|finish|summar)\b/i.test(normalized)) return "Result";
  return `Reasoning ${index + 1}`;
}

function createSection(content: string, index: number, title?: string): ReasoningSection | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return {
    id: `reasoning-section-${index}`,
    title: cleanTitle(title || "") || inferTitle(trimmed, index),
    content: trimmed,
  };
}

/**
 * Split one reasoning payload into readable sections. Explicit Markdown
 * headings win; otherwise each interleaved payload becomes a titled section
 * using a small set of user-facing reasoning categories.
 */
export function splitReasoningSections(content: string, startIndex = 0): ReasoningSection[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const headingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^ {0,3}#{1,6}\s+\S/.test(line));

  if (headingIndexes.length === 0) {
    const section = createSection(content, startIndex);
    return section ? [section] : [];
  }

  const sections: ReasoningSection[] = [];
  const firstHeadingIndex = headingIndexes[0].index;
  const prefix = createSection(lines.slice(0, firstHeadingIndex).join("\n"), startIndex);
  if (prefix) sections.push(prefix);

  headingIndexes.forEach(({ line, index }, headingPosition) => {
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1] || "";
    const nextIndex = headingIndexes[headingPosition + 1]?.index ?? lines.length;
    const section = createSection(lines.slice(index + 1, nextIndex).join("\n"), startIndex + sections.length, heading);
    if (section) sections.push(section);
  });

  return sections;
}
