/**
 * Canonical file-tree configuration shared by every rich-content surface that
 * renders ` ```tree ` blocks. Mirrors `src/lib/mermaid.ts`: one owner for the
 * parser and the size guard so tree renderers cannot drift apart.
 */

export interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
  level: number;
}

/**
 * Hard cap on parsed tree lines. A model dump of an entire repository can be
 * thousands of lines; parsing and rendering all of them would jank the layout.
 * Beyond this cap the tree is truncated and the UI surfaces a notice.
 */
export const MAX_TREE_LINES = 1000;

export interface TreeParseResult {
  nodes: TreeNode[];
  /** True when the input exceeded `MAX_TREE_LINES` and was truncated. */
  truncated: boolean;
}

/**
 * Parses a raw tree string into a hierarchical structure. Handles both ASCII
 * tree formats (│, ├──, └──) and indentation-based trees. When the input
 * exceeds `maxLines`, only the first chunk is parsed and `truncated` is set.
 */
export function parseTree(input: string, maxLines = MAX_TREE_LINES): TreeParseResult {
  const lines = input.split("\n").filter((line) => line.trim().length > 0);
  const truncated = lines.length > maxLines;
  const limited = truncated ? lines.slice(0, maxLines) : lines;

  const root: TreeNode[] = [];
  const stack: { node: TreeNode; indent: number }[] = [];

  for (const line of limited) {
    // Indentation depth from the leading box-drawing / space characters.
    const indentMatch = line.match(/^([ │├└\s]*)/);
    const indentStr = indentMatch ? indentMatch[1] : "";
    const depth = indentStr.length;

    const name = line.replace(/^[ │├└─\s]*/, "").trim();
    if (!name) continue;

    const type = name.endsWith("/") || !name.includes(".") || line.includes("📁") ? "dir" : "file";
    const cleanName = name.replace(/\/$/, "");

    const newNode: TreeNode = {
      name: cleanName,
      type: type as "file" | "dir",
      level: depth,
      children: type === "dir" ? [] : undefined,
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(newNode);
    } else {
      stack[stack.length - 1].node.children?.push(newNode);
    }

    if (type === "dir") {
      stack.push({ node: newNode, indent: depth });
    }
  }

  return { nodes: root, truncated };
}
