export interface ParsedCard {
  type: string;
  data: unknown;
}

export interface OrderedCard {
  /** 0-based index in the `cards` array. */
  index: number;
  /** Character offset in `cleanText` where the matching `%%CARD_N%%` marker lives. */
  position: number;
  card: ParsedCard;
}

/**
 * Matches the placeholder token left in `cleanText` where a card span was
 * stripped. The capture group is the card's 0-based index in the `cards` /
 * `orderedCards` arrays. Use this regex (or `splitOnCardTokens` below) on the
 * renderer side to interleave card components back into the prose at the
 * exact positions the LLM emitted them.
 */
export const CARD_TOKEN_REGEX = /%%CARD_(\d+)%%/g;

export const CARD_TOKEN_PREFIX = "%%CARD_";
export const CARD_TOKEN_SUFFIX = "%%";

/**
 * Splits `cleanText` into an ordered list of segments — either a text
 * fragment to feed into the markdown renderer or a card reference that
 * should be replaced with the corresponding `<RenderPremiumCard>`.
 * Whitespace-only fragments are dropped so we don't render empty paragraphs.
 */
export function splitOnCardTokens(
  cleanText: string,
  cards: ParsedCard[],
): Array<{ type: "text"; content: string } | { type: "card"; card: ParsedCard }> {
  if (!cleanText) return [];
  const segments: Array<
    { type: "text"; content: string } | { type: "card"; card: ParsedCard }
  > = [];
  const tokenRegex = new RegExp(CARD_TOKEN_REGEX.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(cleanText)) !== null) {
    if (match.index > cursor) {
      const slice = cleanText.slice(cursor, match.index);
      if (slice.trim()) segments.push({ type: "text", content: slice });
    }
    const cardIdx = Number(match[1]);
    const card = cards[cardIdx];
    if (card) segments.push({ type: "card", card });
    cursor = match.index + match[0].length;
  }
  if (cursor < cleanText.length) {
    const tail = cleanText.slice(cursor);
    if (tail.trim()) segments.push({ type: "text", content: tail });
  }
  return segments;
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

/**
 * Parses LLM-emitted text, extracting every `<card>…</card>` JSON payload and
 * every ```openui / ```genui code-fenced block. Returns:
 * - `cards`: the extracted payloads in the order they were encountered.
 * - `orderedCards`: each entry carries the card's index into `cards` and the
 *   character offset in `cleanText` where the matching `%%CARD_N%%` marker
 *   was placed. This preserves the original inline position so the renderer
 *   can interleave the card components rather than hoisting them all above
 *   the prose.
 * - `cleanText`: the prose with `%%CARD_N%%` markers at the original card
 *   positions. Token order in the string matches the order entries were
 *   pushed onto `orderedCards`, so the renderer uses `splitOnCardTokens`.
 *
 * Malformed card spans become a visible fallback note rather than placeholders
 * so the user knows the LLM emitted something invalid. Partial / streaming
 * card spans (no close tag yet) become an ellipsis note at the position the
 * opening tag was located — when the next chunk arrives the marker is replaced
 * with a real one and the partial note disappears.
 */
export function parseCardTags(text: string): {
  cards: ParsedCard[];
  cleanText: string;
  orderedCards: OrderedCard[];
} {
  const cards: ParsedCard[] = [];
  const orderedCards: OrderedCard[] = [];

  if (!text || typeof text !== "string") {
    return { cards, cleanText: text || "", orderedCards };
  }

  // Strip inline tool call XML blocks that failed to execute
  let workingSource = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");

  // Extract ```openui``` / ```genui``` code-fenced cards and replace each with
  // a token so their position is preserved through the rest of the pipeline.
  const codeFenceRegex = /```(?:openui|genui)\s*\n([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = codeFenceRegex.exec(workingSource)) !== null) {
    const jsonContent = fenceMatch[1].trim();
    try {
      const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        const card: ParsedCard = {
          type:
            typeof parsed.type === "string"
              ? parsed.type
              : typeof parsed.card === "string"
              ? parsed.card
              : "unknown",
          data: parsed.data || parsed,
        };
        const idx = cards.length;
        cards.push(card);
        const token = `${CARD_TOKEN_PREFIX}${idx}${CARD_TOKEN_SUFFIX}`;
        orderedCards.push({ index: idx, position: -1, card });
        workingSource =
          workingSource.slice(0, fenceMatch.index) +
          token +
          workingSource.slice(fenceMatch.index + fenceMatch[0].length);
        // account for the splice — keep the regex cursor aligned with the
        // post-splice string we just built.
        codeFenceRegex.lastIndex =
          fenceMatch.index + token.length;
      }
    } catch {
      // Skip malformed code-fenced cards — the raw markdown fence stays in
      // cleanText and is rendered as code by MarkdownContent.
    }
  }

  // Extract `<card>…</card>` JSON spans and replace each with a token.
  const startTagRegex = /<card(?:\s[^>]*)?>/gi;
  const malformedFallback =
    "\n\n> **Unable to render generated card.** The generated content was malformed.\n\n";

  // We accumulate parts and resolve positions against the joined final string
  // so tokens are recorded in the order they appear in `cleanText` exactly
  // once per card (the simpler in-place splice approach lost alignment when
  // code-fence tokens interleaved with `<card>` tokens).
  const parts: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = startTagRegex.exec(workingSource)) !== null) {
    const start = match.index;
    const contentStart = start + match[0].length;
    const closeIndex = findCardCloseIndex(workingSource, contentStart);
    if (closeIndex === -1) break;

    const end = closeIndex + "</card>".length;
    const jsonContent = workingSource.slice(contentStart, closeIndex).trim();

    parts.push(workingSource.slice(lastEnd, start));

    if (jsonContent === "") {
      // Empty card body — preserve legacy behavior: drop the tag from text
      // entirely without leaving an empty token (orderedCards stays empty for
      // this entry, which mirrors the pre-Fix-B parser).
      lastEnd = end;
      startTagRegex.lastIndex = end;
      continue;
    }

    let replacement = "";
    try {
      const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        const card: ParsedCard = {
          type:
            typeof parsed.type === "string"
              ? parsed.type
              : typeof parsed.card === "string"
              ? parsed.card
              : "unknown",
          data: parsed.data || parsed,
        };
        const idx = cards.length;
        cards.push(card);
        const token = `${CARD_TOKEN_PREFIX}${idx}${CARD_TOKEN_SUFFIX}`;
        orderedCards.push({ index: idx, position: -1, card });
        replacement = token;
      }
    } catch {
      replacement = malformedFallback;
    }

    parts.push(replacement);
    lastEnd = end;
    startTagRegex.lastIndex = end;
  }

  parts.push(workingSource.slice(lastEnd));

  let cleanText = parts.join("");

  // Resolve `position` on each orderedCards entry against the joined cleanText.
  // IMPORTANT: the source order of the cards in `cleanText` is not always the
  // same as their push order in `cards` / `orderedCards`. The code-fence
  // extraction runs first and pushes all code-fence cards, then the
  // <card>-tag extraction runs and pushes those. So a source like
  // ```openui``` <card>…</card> ```openui``` ends up pushing [idx0, idx1, idx2]
  // for the two fences and the card respectively, but the tokens appear in
  // cleanText as `%%CARD_0%% … %%CARD_2%% … %%CARD_1%%`. The token name
  // (captured group) carries the correct index, so we use it to look up the
  // matching orderedCards entry directly — never assume the i-th match
  // belongs to orderedCards[i].
  const tokenResolutionRegex = new RegExp(CARD_TOKEN_REGEX.source, "g");
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenResolutionRegex.exec(cleanText)) !== null) {
    const idx = Number(tokenMatch[1]);
    if (Number.isInteger(idx) && orderedCards[idx]) {
      orderedCards[idx].position = tokenMatch.index;
    }
  }

  // Handle unmatched / still-streaming card openings (original behavior):
  // leave a "Generating card..." note so the user knows the LLM hasn't closed
  // the span yet. We do NOT emit an orderedCards entry for partial spans.
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

  return { cards, cleanText, orderedCards };
}
