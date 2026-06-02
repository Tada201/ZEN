/**
 * MarkdownBlockSplitter
 * 
 * Performance-critical utility to split streaming markdown into memoizable blocks.
 * Prevents full-thread re-parsing by identifying stable block boundaries.
 * Adapted from NEXUS v3.0 for ZEN's chat system.
 */

export interface MarkdownBlock {
  id: string;
  type: 'text' | 'code' | 'thought';
  content: string;
  language?: string;
  isComplete: boolean;
  index: number;
}

function isStructurallyComplete(type: MarkdownBlock['type'], content: string): boolean {
  const trimmed = content.trim();
  if (type === 'code') {
    const match = trimmed.match(/^(```+)[\s\S]*\1$/);
    return !!match;
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
  let codeFence = '';
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Detect Code Blocks
    const codeMatch = line.match(/^(```+)([^\s`]*)/);
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
      } else if (line.startsWith(codeFence)) {
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

    // 2. Detect Thought Blocks
    if (/<(?:thought|think)>/i.test(line) && !inCodeBlock) {
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

  // Handle the active (streaming) block
  if (currentBlock.length > 0) {
    let type: MarkdownBlock['type'] = 'text';
    if (inCodeBlock) {
      type = 'code';
      // If we have a language from an unclosed fence, attach it
      if (codeLanguage) {
        // Ensure the opening fence is in the content
        if (!currentBlock[0] || !currentBlock[0].startsWith('```')) {
          currentBlock.unshift('```' + codeLanguage);
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
  if (lookahead.startsWith('```')) return false;

  return /^<\/?[a-z][\w:-]*(\s|>|\/>)/i.test(lookahead)
    || /^<\/[a-z][\w:-]*>/i.test(lookahead);
}

function createBlock(
  type: MarkdownBlock['type'],
  content: string,
  isComplete: boolean,
  blockIndex: number,
  language?: string,
): MarkdownBlock {
  return {
    id: `${type}-${blockIndex}-${isComplete ? 'done' : 'streaming'}`,
    type,
    content,
    language,
    isComplete,
    index: blockIndex,
  };
}
