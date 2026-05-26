import { useState, useEffect, useCallback } from "react";
import { Folder, File, ChevronRight, FolderOpen, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { workspaceApi } from "@/api";

interface FileNode {
  name: string;
  type: "dir" | "file";
  path: string;
  isOpen?: boolean;
  children?: FileNode[];
}

export function FileExplorer({ onFileClick }: { onFileClick: (path: string) => void }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFolder = useCallback(async (path: string = ""): Promise<FileNode[]> => {
    try {
      const data = await workspaceApi.browseFolder(path || null);
      if (!data.entries) return [];
      return data.entries.map((e) => ({
        name: e.name,
        type: e.type as "dir" | "file",
        path: e.path,
        isOpen: false,
        children: e.type === "dir" ? [] : undefined
      }));
    } catch (err) {
      console.error("Failed to fetch folder:", err);
      return [];
    }
  }, []);

  const refreshRoot = useCallback(async () => {
    setLoading(true);
    const nodes = await fetchFolder();
    setTree(nodes);
    setLoading(false);
  }, [fetchFolder]);

  useEffect(() => {
    refreshRoot();
  }, [refreshRoot]);

  const toggleFolder = async (node: FileNode) => {
    if (node.type !== "dir") {
      onFileClick(node.path);
      return;
    }

    const updateNode = async (nodes: FileNode[]): Promise<FileNode[]> => {
      return Promise.all(nodes.map(async (n) => {
        if (n.path === node.path) {
          const nextOpen = !n.isOpen;
          let children = n.children;
          if (nextOpen && (!children || children.length === 0)) {
            children = await fetchFolder(n.path);
          }
          return { ...n, isOpen: nextOpen, children };
        }
        if (n.children) {
          return { ...n, children: await updateNode(n.children) };
        }
        return n;
      }));
    };

    const newTree = await updateNode(tree);
    setTree(newTree);
  };

  return (
    <div className="h-full flex flex-col select-none">
      <div className="p-2 flex items-center justify-between border-b border-border/20 bg-muted/5">
        <span className="text-[10px] font-bold text-muted-foreground ml-2">WORKSPACE</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 text-muted-foreground hover:text-primary"
          onClick={refreshRoot}
          disabled={loading}
        >
          <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4 opacity-20 group">
              <Folder className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform text-muted-foreground" />
              <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
                No files found.<br/>
                Check Settings &gt; General to set Workspace Root
              </p>
            </div>
          ) : (
            tree.map((node, i) => (
              <TreeItem key={i} node={node} onToggle={toggleFolder} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TreeItem({ node, onToggle }: { node: FileNode; onToggle: (node: FileNode) => void }) {
  return (
    <div className="space-y-0.5">
      <div 
        className={cn(
          "flex items-center gap-1.5 py-1 px-1.5 rounded-md cursor-pointer transition-colors group",
          "hover:bg-primary/5 active:bg-primary/10",
          node.isOpen ? "bg-primary/[0.03]" : ""
        )}
        onClick={() => onToggle(node)}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          {node.type === "dir" && (
            <ChevronRight className={cn(
              "h-3 w-3 text-muted-foreground/60 transition-transform duration-200",
              node.isOpen && "rotate-90"
            )} />
          )}
        </div>
        
        {node.type === "dir" ? (
          node.isOpen ? <FolderOpen className="h-4 w-4 text-primary/70" /> : <Folder className="h-4 w-4 text-primary/70" />
        ) : (
          <File className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/40" />
        )}
        
        <span className={cn(
          "text-[12px] truncate",
          node.type === "dir" ? "font-medium" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {node.name}
        </span>
      </div>

      {node.type === "dir" && node.isOpen && node.children && (
        <div className="ml-3 border-l border-border/20 pl-1">
          {node.children.map((child, i) => (
            <TreeItem key={i} node={child} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
