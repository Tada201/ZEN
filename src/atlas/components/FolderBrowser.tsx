import { useState, useEffect, useCallback } from "react";
import { Folder, FolderOpen, ChevronRight, ArrowUp, HardDrive, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { workspaceApi } from "@/api";
import {
  Dialog, DialogContent,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface FolderEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: FolderEntry[];
}

interface FolderBrowserProps {
  value: string;
  onChange: (path: string) => void;
}

export function FolderBrowser({ value, onChange }: FolderBrowserProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [selectedPath, setSelectedPath] = useState(value || "");
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceApi.browseFolder(dirPath) as BrowseResult;
      setBrowseData(data);
      if (data.current) {
        setSelectedPath(data.current);
      }
    } catch (e: any) {
      setError(e.message || "Failed to browse");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      browse(value || undefined);
    }
  }, [open, browse]);

  const handleConfirm = () => {
    onChange(selectedPath);
    setOpen(false);
  };

  const handleNavigate = (dirPath: string) => {
    browse(dirPath);
  };

  // Breadcrumb segments
  const pathSegments = browseData?.current
    ? browseData.current.replace(/\\/g, "/").split("/").filter(Boolean)
    : [];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div
          className={cn(
            "flex-1 flex items-center gap-2 px-3 h-9 rounded-lg border text-sm cursor-pointer transition-all",
            "bg-muted/20 border-border/60 hover:border-primary/40 hover:bg-muted/30",
            value ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={() => setOpen(true)}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span className="truncate">{value || "No workspace selected"}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-xs font-bold gap-1.5 border-border/60 hover:border-primary/40"
          onClick={() => setOpen(true)}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Browse
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-background border-border shadow-2xl">
          <DialogTitle className="sr-only">Select Workspace Folder</DialogTitle>
          <DialogDescription className="sr-only">Browse and select a workspace directory.</DialogDescription>
          
          {/* Header */}
          <div className="p-4 border-b border-border/40 bg-muted/5">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              Select Workspace Folder
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              All file operations will be scoped to this directory.
            </p>
          </div>

          {/* Breadcrumb */}
          {browseData?.current && (
            <div className="px-4 py-2 border-b border-border/20 flex items-center gap-1 flex-wrap bg-muted/10">
              {browseData.parent && (
                <button
                  onClick={() => browseData.parent && handleNavigate(browseData.parent)}
                  className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                  title="Go up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => browse(undefined)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <HardDrive className="h-3 w-3 inline mr-0.5" />
              </button>
              {pathSegments.map((segment, i) => {
                const segmentPath = pathSegments.slice(0, i + 1).join("/");
                const isWindows = browseData.current.includes("\\");
                const fullPath = isWindows 
                  ? segmentPath.replace(/\//g, "\\")
                  : "/" + segmentPath;
                return (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    <button
                      onClick={() => handleNavigate(fullPath)}
                      className={cn(
                        "text-[11px] px-1 py-0.5 rounded transition-colors",
                        i === pathSegments.length - 1
                          ? "text-primary font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Directory listing */}
          <ScrollArea className="h-[320px]">
            {loading ? (
              <div className="flex items-center justify-center h-full py-16">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full py-16">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : (browseData?.directories?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                <Folder className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">No subdirectories found</p>
              </div>
            ) : (
              <div className="p-1">
                {browseData?.directories.map((dir) => (
                  <button
                    key={dir.path}
                    onDoubleClick={() => handleNavigate(dir.path)}
                    onClick={() => setSelectedPath(dir.path)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm group",
                      selectedPath === dir.path
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/40 text-foreground"
                    )}
                  >
                    <Folder className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      selectedPath === dir.path ? "text-primary" : "text-muted-foreground/60 group-hover:text-primary/50"
                    )} />
                    <span className="truncate flex-1">{dir.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Selected path + actions */}
          <div className="p-3 border-t border-border/40 bg-muted/5 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder="Paste or type a path..."
                className="h-8 text-xs bg-background border-border/60 font-mono"
              />
            </div>
            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Clear workspace
              </button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-3" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-[11px] px-4 font-bold gap-1" onClick={handleConfirm}>
                  <Check className="h-3 w-3" />
                  Select
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
