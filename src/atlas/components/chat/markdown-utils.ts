/**
 * MarkdownBlockSplitter
 * 
 * Performance-critical utility to split streaming markdown into memoizable blocks.
 * Prevents full-thread re-parsing by identifying stable block boundaries.
 * Adapted from NEXUS v3.0 for ZEN's chat system.
 */

export interface MarkdownBlock {
  id: string;
  type: 'text' | 'code' | 'thought' | 'details';
  content: string;
  language?: string;
  summary?: string;
  initiallyOpen?: boolean;
  isComplete: boolean;
  index: number;
}

const DETAILS_OPEN = /^ {0,3}<details(?:[ \t]+open)?[ \t]*>[ \t]*$/i;
const DETAILS_CLOSE = /^ {0,3}<\/details>[ \t]*$/i;
const DETAILS_SUMMARY = /^ {0,3}<summary>([\s\S]*?)<\/summary>[ \t]*$/i;

function sanitizeDetailsSummary(value: string): string {
  const plain = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 160) || "More details";
}

function isStructurallyComplete(type: MarkdownBlock['type'], content: string): boolean {
  const trimmed = content.trim();
  if (type === 'code') {
    const opening = trimmed.match(/^(`{3,}|~{3,})/);
    const lines = trimmed.split('\n');
    return Boolean(opening && isClosingFence(lines[lines.length - 1], opening[1]));
  }
  if (type === 'thought') {
    return /^<(?:thought|think)>/i.test(trimmed) && /<\/(?:thought|think)>$/i.test(trimmed);
  }
  return true;
}

export function splitMarkdownIntoBlocks(content: string, isStreaming: boolean): MarkdownBlock[] {
  if (!content) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = content.split('\n');

  let currentBlock: string[] = [];
  let inCodeBlock = false;
  let inThoughtBlock = false;
  let inDetailsBlock = false;
  let detailsDepth = 0;
  let detailsSummary = "More details";
  let detailsSummarySeen = false;
  let detailsInitiallyOpen = false;
  let detailsContent: string[] = [];
  let detailsCodeFence = '';
  let codeFence = '';
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Details own their body until the matching close tag. Track nested code
    // fences here so a literal </details> in a code example cannot terminate
    // the disclosure early.
    if (inDetailsBlock) {
      const detailCodeMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (detailsCodeFence) {
        detailsContent.push(line);
        if (isClosingFence(line, detailsCodeFence)) detailsCodeFence = '';
        continue;
      }
      if (detailCodeMatch) {
        detailsCodeFence = detailCodeMatch[1];
        detailsContent.push(line);
        continue;
      }
      if (DETAILS_OPEN.test(line)) {
        detailsDepth += 1;
        detailsContent.push(line);
        continue;
      }
      if (DETAILS_CLOSE.test(line)) {
        detailsDepth -= 1;
        if (detailsDepth > 0) {
          detailsContent.push(line);
          continue;
        }
        blocks.push(createBlock(
          'details',
          detailsContent.join('\n').trim(),
          true,
          blocks.length,
          undefined,
          detailsSummary,
          detailsInitiallyOpen,
        ));
        inDetailsBlock = false;
        detailsDepth = 0;
        detailsCodeFence = '';
        detailsContent = [];
        continue;
      }
      if (!detailsSummarySeen) {
        const summaryMatch = line.match(DETAILS_SUMMARY);
        if (summaryMatch) {
          detailsSummary = sanitizeDetailsSummary(summaryMatch[1]);
          detailsSummarySeen = true;
          continue;
        }
        if (line.trim()) detailsSummarySeen = true;
      }
      detailsContent.push(line);
      continue;
    }

    // 1. Detect fenced code blocks. GFM accepts both backtick and tilde
    // fences, with up to three spaces of indentation.
    const codeMatch = line.match(/^ {0,3}(`{3,}|~{3,})([^\s`~]*)[ \t]*$/);
    if (codeMatch && !inThoughtBlock) {
      if (!inCodeBlock) {
        // Close current text block
        if (currentBlock.length > 0) {
          blocks.push(createBlock('text', currentBlock.join('\n'), true, blocks.length));
          currentBlock = [];
        }
        inCodeBlock = true;
        codeFence = codeMatch[1];
        codeLanguage = codeMatch[2];
        currentBlock.push(line);
        continue;
      }

      if (isClosingFence(line, codeFence)) {
        if (isStreaming && shouldDeferStreamingFenceClose(codeLanguage, currentBlock, lines, i)) {
          currentBlock.push(line);
          continue;
        }

        // Closing code block
        currentBlock.push(line);
        blocks.push(createBlock('code', currentBlock.join('\n'), true, blocks.length, codeLanguage));
        currentBlock = [];
        inCodeBlock = false;
        codeFence = '';
        codeLanguage = '';
        continue;
      }
    }

    // 2. Detect the constrained details extension outside code. We accept only
    // <details>, optional `open`, a plain <summary>, and </details>; all other
    // attributes/tags stay ordinary text and are never rendered as HTML.
    const detailsOpenMatch = line.match(DETAILS_OPEN);
    if (detailsOpenMatch && !inCodeBlock && !inThoughtBlock) {
      if (inDetailsBlock) {
        detailsDepth += 1;
        detailsContent.push(line);
        continue;
      }
      if (currentBlock.length > 0) {
        blocks.push(createBlock('text', currentBlock.join('\n'), true, blocks.length));
        currentBlock = [];
      }
      inDetailsBlock = true;
      detailsDepth = 1;
      detailsInitiallyOpen = /<details[ \t]+open/i.test(line);
      detailsSummary = "More details";
      detailsSummarySeen = false;
      detailsContent = [];
      continue;
    }

    // 3. Detect Thought Blocks
    if (/<(?:thought|think)>/i.test(line) && !inCodeBlock && !inDetailsBlock) {
      if (currentBlock.length > 0) {
        blocks.push(createBlock('text', currentBlock.join('\n'), true, blocks.length));
        currentBlock = [];
      }
      inThoughtBlock = true;
    }

    if (/<\/(?:thought|think)>/i.test(line) && inThoughtBlock) {
      currentBlock.push(line);
      blocks.push(createBlock('thought', currentBlock.join('\n'), true, blocks.length));
      currentBlock = [];
      inThoughtBlock = false;
      continue;
    }

    currentBlock.push(line);
  }

  // Handle the active (streaming) block. An unfinished disclosure still
  // renders safely as an open-ended details block while tokens arrive.
  if (inDetailsBlock) {
    blocks.push(createBlock(
      'details',
      detailsContent.join('\n').trim(),
      false,
      blocks.length,
      undefined,
      detailsSummary,
      detailsInitiallyOpen,
    ));
    return blocks;
  }

  if (currentBlock.length > 0) {
    let type: MarkdownBlock['type'] = 'text';
    if (inCodeBlock) {
      type = 'code';
      // If we have a language from an unclosed fence, attach it
      if (codeLanguage) {
        // Ensure the opening fence is in the content
        if (!currentBlock[0] || !/^ {0,3}[`~]{3,}/.test(currentBlock[0])) {
          currentBlock.unshift(codeFence + codeLanguage);
        }
      }
    }
    if (inThoughtBlock) type = 'thought';
    // For streaming code blocks, auto-close the fence for parser stability.
    // Skip OpenUI blocks — their parser handles incomplete streaming code natively
    // and auto-closing injects corrupting ``` characters into the DSL.
    let blockContent = currentBlock.join('\n');
    if (inCodeBlock && isStreaming && codeLanguage !== 'openui') {
      blockContent += '\n' + codeFence;
    }
    // For streaming thought blocks, auto-close for parser stability
    if (inThoughtBlock && isStreaming) {
      blockContent += '\n</think>';
    }

    const isComplete = !isStreaming && isStructurallyComplete(type, blockContent);

    blocks.push(createBlock(type, blockContent, isComplete, blocks.length, codeLanguage));
  }

  return blocks;
}

function isClosingFence(line: string, openingFence: string): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  if (!match) return false;
  return match[1][0] === openingFence[0] && match[1].length >= openingFence.length;
}

function shouldDeferStreamingFenceClose(
  language: string,
  currentBlock: string[],
  lines: string[],
  fenceLineIndex: number,
): boolean {
  const lang = language.toLowerCase();
  if (!['svg', 'xml', 'html'].includes(lang)) return false;

  const body = currentBlock.slice(1).join('\n');
  if (lang === 'svg' && !hasClosedTag(body, 'svg')) {
    return true;
  }
  if (lang === 'html' && hasLikelyUnclosedHtmlTag(body)) {
    return true;
  }
  if (lang === 'xml' && hasDanglingXmlTail(lines, fenceLineIndex)) {
    return true;
  }

  return hasDanglingXmlTail(lines, fenceLineIndex);
}

function hasClosedTag(content: string, tagName: string): boolean {
  return new RegExp(`</${tagName}\\s*>`, 'i').test(content);
}

function hasLikelyUnclosedHtmlTag(content: string): boolean {
  const lastOpen = Math.max(
    content.toLowerCase().lastIndexOf('<div'),
    content.toLowerCase().lastIndexOf('<section'),
    content.toLowerCase().lastIndexOf('<main'),
    content.toLowerCase().lastIndexOf('<article'),
  );
  if (lastOpen === -1) return false;
  const tail = content.slice(lastOpen).toLowerCase();
  return !/(<\/div>|<\/section>|<\/main>|<\/article>)/.test(tail);
}

function hasDanglingXmlTail(lines: string[], fenceLineIndex: number): boolean {
  const lookahead = lines
    .slice(fenceLineIndex + 1, Math.min(lines.length, fenceLineIndex + 8))
    .join('\n')
    .trim();

  if (!lookahead) return false;
  if (/^[`~]{3,}/.test(lookahead)) return false;

  return /^<\/?[a-z][\w:-]*(\s|>|\/>)/i.test(lookahead)
    || /^<\/[a-z][\w:-]*>/i.test(lookahead);
}

function createBlock(
  type: MarkdownBlock['type'],
  content: string,
  isComplete: boolean,
  blockIndex: number,
  language?: string,
  summary?: string,
  initiallyOpen?: boolean,
): MarkdownBlock {
  return {
    id: `${type}-${blockIndex}`,
    type,
    content,
    language,
    summary,
    initiallyOpen,
    isComplete,
    index: blockIndex,
  };
}
