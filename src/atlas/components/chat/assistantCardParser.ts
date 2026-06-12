export interface ParsedCard {
  type: string;
  data: unknown;
}

function findCardCloseIndex(text: string, fromIndex: number): number {
  let inString = false;
  let escaped = false;

  for (let i = fromIndex; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && text.slice(i, i + 7).toLowerCase() === "</card>") {
      return i;
    }
  }

  return -1;
}

export function parseCardTags(text: string): { cards: ParsedCard[]; cleanText: string } {
  const cards: ParsedCard[] = [];

  if (!text || typeof text !== "string") {
    return { cards, cleanText: text || "" };
  }

  // Also detect OpenUI inside markdown code fences: ```openui\n{...}\n```
  const codeFenceRegex = /```(?:openui|genui)\s*\n([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = codeFenceRegex.exec(text)) !== null) {
    const jsonContent = fenceMatch[1].trim();
    try {
      const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        cards.push({
          type: typeof parsed.type === "string" ? parsed.type : typeof parsed.card === "string" ? parsed.card : "unknown",
          data: parsed.data || parsed,
        });
      }
    } catch {
      // Not valid JSON — skip
    }
  }
  // Strip code fence OpenUI blocks from text
  text = text.replace(/```(?:openui|genui)\s*\n[\s\S]*?```/gi, "");

  // Strip inline tool call XML blocks that failed to execute
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");

  const startTagRegex = /<card(?:\s[^>]*)?>/gi;
  let match: RegExpExecArray | null;
  const replacements: { start: number; end: number }[] = [];
  const placeholders: Array<{ start: number; end: number; text: string }> = [];

  while ((match = startTagRegex.exec(text)) !== null) {
    const start = match.index;
    const contentStart = start + match[0].length;
    const closeIndex = findCardCloseIndex(text, contentStart);
    if (closeIndex === -1) break;

    const end = closeIndex + "</card>".length;
    const jsonContent = text.slice(contentStart, closeIndex);
    let replacementText = "";

    try {
      const parsed = JSON.parse(jsonContent.trim()) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        cards.push({
          type: typeof parsed.type === "string" ? parsed.type : typeof parsed.card === "string" ? parsed.card : "unknown",
          data: parsed.data || parsed,
        });
      }
    } catch {
      replacementText = "> **Unable to render generated card.** The generated content was malformed.";
    }
    replacements.push({ start, end });
    if (replacementText) {
      placeholders.push({ start, end, text: replacementText });
    }
    startTagRegex.lastIndex = end;
  }

  let cleanText: string;
  if (replacements.length > 0) {
    const parts: string[] = [];
    let lastEnd = 0;
    for (const { start, end } of replacements) {
      parts.push(text.slice(lastEnd, start));
      const placeholder = placeholders.find((item) => item.start === start && item.end === end);
      if (placeholder) parts.push(`\n\n${placeholder.text}\n\n`);
      lastEnd = end;
    }
    parts.push(text.slice(lastEnd));
    cleanText = parts.join("").trim();
  } else {
    cleanText = text;
  }

  const partialCardMatch = /<card(?:\s[^>]*)?>/i.exec(cleanText);
  if (partialCardMatch) {
    const idx = partialCardMatch.index;
    const afterCard = cleanText.substring(idx + partialCardMatch[0].length).trimStart();
    if (afterCard.startsWith("{") || afterCard.startsWith("[")) {
      cleanText = `${cleanText.substring(0, idx).trim()}\n\n_Generating card..._`.trim();
    } else {
      cleanText = cleanText.replace(/<card(?:\s[^>]*)?>/i, "");
    }
  }
  cleanText = cleanText.replace(/<\/card>/gi, "").trim();

  return { cards, cleanText };
}
