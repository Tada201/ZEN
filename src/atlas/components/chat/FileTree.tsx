import React, { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
  level: number;
}

/**
 * Parses the raw tree string into a hierarchical structure.
 * Handles both ASCII tree formats (├──, └──) and indentation-based trees.
 */
function parseTree(input: string): TreeNode[] {
  const lines = input.split("\n").filter(l => l.trim().length > 0);
  const root: TreeNode[] = [];
  const stack: { node: TreeNode; indent: number }[] = [];

  for (const line of lines) {
    // Calculate indentation level
    // We look for characters that indicate depth: │, ├, └, and spaces
    const indentMatch = line.match(/^([ │├└\s]*)/);
    const indentStr = indentMatch ? indentMatch[1] : "";
    
    // Depth is roughly indent length / constant, or based on specific symbols
    // A more robust way: count special characters + spaces
    const depth = indentStr.length;
    
    const name = line.replace(/^[ │├└─\s]*/, "").trim();
    if (!name) continue;

    const type = name.endsWith("/") || name.includes(".") === false || line.includes("📁") ? "dir" : "file";
    const cleanName = name.replace(/\/$/, "");

    const newNode: TreeNode = {
      name: cleanName,
      type: type as "file" | "dir",
      level: depth,
      children: type === "dir" ? [] : undefined
    };

    // Find parent in stack
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

  return root;
}

interface TreeItemProps {
  node: TreeNode;
}

const TreeItem = ({ node }: TreeItemProps) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-1 px-2 rounded-md hover:bg-primary/5 transition-colors cursor-pointer group",
          node.type === "dir" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => node.type === "dir" && setIsOpen(!isOpen)}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          {node.type === "dir" && (
            isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground/50" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
        
        {node.type === "dir" ? (
          isOpen ? <FolderOpen className="h-4 w-4 text-primary/70" /> : <Folder className="h-4 w-4 text-primary/70" />
        ) : (
          <File className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/40 transition-colors" />
        )}
        
        <span className="text-[13px]">{node.name}</span>
      </div>

      {node.type === "dir" && isOpen && node.children && (
        <div className="ml-4 border-l border-border/20 pl-2 mt-0.5">
          {node.children.map((child, i) => (
            <TreeItem key={i} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree = ({ content }: { content: string }) => {
  const nodes = React.useMemo(() => parseTree(content), [content]);

  return (
    <div className="my-6 rounded-xl border border-border/40 bg-card/30 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary/40 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Workspace Tree</span>
        </div>
      </div>
      <div className="p-3 font-mono">
        {nodes.length > 0 ? (
          nodes.map((node, i) => <TreeItem key={i} node={node} />)
        ) : (
          <div className="text-[12px] text-muted-foreground italic px-2 py-4">
            Invalid tree format
          </div>
        )}
      </div>
    </div>
  );
};
