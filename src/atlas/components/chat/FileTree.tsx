import React, { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_TREE_LINES, parseTree, type TreeNode } from "@/lib/tree";

interface TreeItemProps {
  node: TreeNode;
}

const TreeItem = ({ node }: TreeItemProps) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-1.5 py-0.5 px-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer group",
          node.type === "dir" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => node.type === "dir" && setIsOpen(!isOpen)}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          {node.type === "dir" && (
            isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        
        {node.type === "dir" ? (
          isOpen ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-primary" />
        ) : (
          <File className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        
        <span className="text-[13px]">{node.name}</span>
      </div>

      {node.type === "dir" && isOpen && node.children && (
        <div className="ml-3 border-l border-border pl-1.5 mt-0.5">
          {node.children.map((child) => (
            // Key by name, not index: a streamed delta that inserts a sibling
            // reorders the list and index keys shift open/close state onto
            // the wrong node.
            <TreeItem key={child.name} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree = ({ content }: { content: string }) => {
  const { nodes, truncated } = React.useMemo(() => parseTree(content), [content]);

  return (
    <div className="my-3 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Workspace Tree</span>
        </div>
      </div>
      <div className="p-2 font-mono">
        {nodes.length > 0 ? (
          nodes.map((node) => <TreeItem key={node.name} node={node} />)
        ) : (
          <div className="text-[12px] text-muted-foreground italic px-1.5 py-3">
            Invalid tree format
          </div>
        )}
      </div>
      {truncated && (
        <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
          Tree truncated — showing first {MAX_TREE_LINES} entries
        </div>
      )}
    </div>
  );
};
