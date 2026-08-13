export interface MarkdownFootnote {
  key: string;
  number: number;
  content: string;
  noteId: string;
  referenceIds: string[];
}

export interface PreparedMarkdownFootnotes {
  content: string;
  footnotes: MarkdownFootnote[];
}

interface FootnoteDefinition {
  key: string;
  content: string;
  order: number;
}

const FOOTNOTE_DEFINITION = /^ {0,3}\[\^([^\]]+)\]:[ \t]?(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(?:[^`~]*)$/;

function isClosingFence(line: string, openingFence: string): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === openingFence[0] && match[1].length >= openingFence.length);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function safeScope(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "markdown";
}

function indentContinuation(content: string): string {
  return content
    .split("\n")
    .map((line, index) => index === 0 ? line : `    ${line}`)
    .join("\n");
}

function collectDefinitions(content: string): { body: string; definitions: Map<string, FootnoteDefinition> } {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const body: string[] = [];
  const definitions = new Map<string, FootnoteDefinition>();
  let inFence = false;
  let fenceCharacter = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(FENCE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceCharacter = fence[1][0];
      } else if (fence[1][0] === fenceCharacter) {
        inFence = false;
        fenceCharacter = "";
      }
      body.push(line);
      continue;
    }

    if (inFence) {
      body.push(line);
      continue;
    }

    const definition = line.match(FOOTNOTE_DEFINITION);
    if (!definition) {
      body.push(line);
      continue;
    }

    const key = normalizeKey(definition[1]);
    const definitionLines = [definition[2]];
    let nextIndex = index + 1;
    let sawContinuation = false;

    while (nextIndex < lines.length) {
      const continuation = lines[nextIndex];
      if (/^(?: {4}|\t)/.test(continuation)) {
        definitionLines.push(continuation.replace(/^(?: {4}|\t)/, ""));
        sawContinuation = true;
        nextIndex += 1;
        continue;
      }
      if (!continuation.trim() && lines[nextIndex + 1] && /^(?: {4}|\t)/.test(lines[nextIndex + 1])) {
        definitionLines.push("");
        sawContinuation = true;
        nextIndex += 1;
        continue;
      }
      break;
    }

    if (!definitions.has(key)) {
      definitions.set(key, {
        key,
        content: definitionLines.join("\n").trim(),
        order: definitions.size,
      });
    } else if (sawContinuation && definitionLines.join("\n").trim()) {
      const existing = definitions.get(key)!;
      existing.content = `${existing.content}\n${definitionLines.join("\n").trim()}`.trim();
    }

    index = nextIndex - 1;
  }

  return { body: body.join("\n"), definitions };
}

/**
 * Convert CommonMark-style footnotes into ordinary Markdown links and a
 * compact footnote list. The renderer owns the actual anchors, so no raw HTML
 * or model-generated attributes are injected into the document.
 */
export function prepareMarkdownFootnotes(content: string, scope: string): PreparedMarkdownFootnotes {
  const { body, definitions } = collectDefinitions(content);
  if (definitions.size === 0) return { content, footnotes: [] };

  const referencedKeys: string[] = [];
  const seenKeys = new Set<string>();
  const referenceCounts = new Map<string, number>();
  const referenceIdsByKey = new Map<string, string[]>();
  const normalizedScope = safeScope(scope);

  const rewriteReference = (_match: string, rawKey: string): string => {
    const key = normalizeKey(rawKey);
    if (!definitions.has(key)) return _match;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      referencedKeys.push(key);
    }
    const number = referencedKeys.indexOf(key) + 1;
    const occurrence = referenceCounts.get(key) || 0;
    referenceCounts.set(key, occurrence + 1);
    const referenceId = `${normalizedScope}-fn-ref-${number}-${occurrence}`;
    const noteId = `${normalizedScope}-fn-note-${number}`;
    const referenceIds = referenceIdsByKey.get(key) || [];
    referenceIds.push(referenceId);
    referenceIdsByKey.set(key, referenceIds);
    return `[${number}](#${noteId} "footnote-ref:${referenceId}")`;
  };

  // References inside fenced or inline code are literal code, not footnotes.
  // Keep the rewrite line-aware so a model can explain the syntax without
  // accidentally creating anchors in its example.
  let inFence = false;
  let openingFence = "";
  const rewrittenBody = body.replace(/[^\n]*(?:\n|$)/g, (line) => {
    const lineText = line.endsWith("\n") ? line.slice(0, -1) : line;
    const fence = lineText.match(FENCE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        openingFence = fence[1];
      } else if (isClosingFence(lineText, openingFence)) {
        inFence = false;
        openingFence = "";
      }
      return line;
    }
    if (inFence) return line;

    let inInlineCode = false;
    let inlineCodeFence = "";
    let output = "";
    let cursor = 0;
    const codeOrReference = /(`+)|\\?\[\^([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = codeOrReference.exec(lineText))) {
      output += lineText.slice(cursor, match.index);
      if (match[1]) {
        const marker = match[1];
        if (!inInlineCode) {
          inInlineCode = true;
          inlineCodeFence = marker;
        } else if (marker === inlineCodeFence) {
          inInlineCode = false;
          inlineCodeFence = "";
        }
        output += marker;
      } else if (inInlineCode || match[0].startsWith("\\")) {
        output += match[0];
      } else {
        output += rewriteReference(match[0], match[2]);
      }
      cursor = match.index + match[0].length;
    }
    return output + lineText.slice(cursor) + (line.endsWith("\n") ? "\n" : "");
  });

  const orderedDefinitions = [
    ...referencedKeys.map((key) => definitions.get(key)!).filter(Boolean),
    ...Array.from(definitions.values()).filter((definition) => !seenKeys.has(definition.key)),
  ];
  const footnotes = orderedDefinitions.map((definition, index) => {
    const number = index + 1;
    const noteId = `${normalizedScope}-fn-note-${number}`;
    const referenceIds = referenceIdsByKey.get(definition.key) || [];
    return {
      key: definition.key,
      number,
      content: definition.content,
      noteId,
      referenceIds,
    };
  });

  const footnoteMarkdown = footnotes.length > 0
    ? `\n\n### Footnotes\n\n${footnotes.map((footnote) => {
      const target = `[\u200b](#${footnote.noteId} "footnote-target")`;
      const backlinks = footnote.referenceIds
        .map((referenceId, index) => `[↩${footnote.referenceIds.length > 1 ? ` ${index + 1}` : ""}](#${referenceId} "footnote-backlink")`)
        .join(" ");
      return `${footnote.number}. ${target} ${backlinks} ${indentContinuation(footnote.content)}`.trimEnd();
    }).join("\n")}`
    : "";

  return {
    content: `${rewrittenBody}${footnoteMarkdown}`,
    footnotes,
  };
}
