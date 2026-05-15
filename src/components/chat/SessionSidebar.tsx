import { useState, useMemo, memo } from "react";
import { 
  Plus, Search, Pin, PinOff, Trash2, Edit2, Download, Settings2, Key, LayoutDashboard, 
  PanelLeftClose, Sparkles, MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/style";
import { Session } from "./types";

function getDateGroup(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

export const SessionSidebar = memo(function SessionSidebar({
  sessions, currentId, onSelect, onCreate, onDelete, onRename,
  search, onSearchChange, onPin, onExport, onClearAll, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onToggleSidebar,
}: {
  sessions: Session[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
  onClearAll: () => void;
  onDeleteAll?: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  setSettingsTab: (tab: any) => void;
  setShowSettingsModal: (open: boolean) => void;
  onToggleSidebar: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const groups = useMemo(() => {
    const filtered = sessions.filter((s) =>
      s.title.toLowerCase().includes(search.toLowerCase())
    );

    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    const groups: Record<string, Session[]> = {};
    sorted.forEach((s) => {
      const g = getDateGroup(s.updatedAt);
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    return groups;
  }, [sessions, search]);

  function relTime(ts: number) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-full w-full flex-col bg-sidebar overflow-hidden border-r border-border/10 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-0">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-bold tracking-tight">Zen Chat</span>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggleSidebar}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button 
          className="w-full justify-start gap-2 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/20 shadow-none" 
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          <span>New Investigation</span>
          <span className="ml-auto text-[10px] opacity-40 font-mono">⌘N</span>
        </Button>
      </div>

      <div className="px-3 pb-2 space-y-2">
        <div className="relative group">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search investigations..."
            className="h-8 pl-8 text-xs bg-muted/40 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/20"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          {sessions.length > 0 && (
            <div className="flex w-full gap-2">
              <Button 
                variant="ghost" 
                className="flex-1 h-7 text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-1.5"
                onClick={() => {
                  if (confirm("Are you sure you want to clear all messages?")) {
                    onClearAll();
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
                Clear Chat
              </Button>
              {onDeleteAll && (
                <Button 
                  variant="ghost" 
                  className="flex-1 h-7 text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-1.5"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete all investigations?")) {
                      onDeleteAll();
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete All
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 pl-2 pr-0">
        <div className="space-y-6 py-2">
          {GROUP_ORDER.map((g) => {
            const groupSessions = groups[g];
            if (!groupSessions?.length) return null;
            return (
              <div key={g} className="space-y-1">
                <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2 flex items-center gap-2">
                  <span>{g}</span>
                  <div className="h-px flex-1 bg-border/40" />
                </h3>
                {groupSessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-l-lg rounded-r-none px-2 py-2 text-sm transition-all cursor-pointer overflow-hidden w-full",
                      s.id === currentId 
                        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" 
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                    onClick={() => onSelect(s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === s.id ? (
                        <input
                          autoFocus
                          className="w-full bg-transparent outline-none"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onRename(s.id, editTitle);
                              setEditingId(null);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => {
                            onRename(s.id, editTitle);
                            setEditingId(null);
                          }}
                        />
                      ) : (
                        <div className="flex flex-col min-w-0 overflow-hidden">
                          <span className="truncate font-medium block w-full">{s.title}</span>
                          <span className="text-[10px] opacity-40">{relTime(s.updatedAt)}</span>
                        </div>
                      )}
                    </div>

                    <div className={cn(
                      "absolute right-0 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all animate-in fade-in slide-in-from-right-2 duration-300 pr-2 pl-10 rounded-r-lg",
                      s.id === currentId 
                        ? "bg-gradient-to-l from-primary/20 via-primary/20 to-transparent" 
                        : "bg-gradient-to-l from-muted/80 via-muted/80 to-transparent"
                    )}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 rounded-md hover:bg-primary/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPin(s.id, !!s.pinned);
                        }}
                      >
                        {s.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md hover:bg-primary/20">
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(s.id);
                            setEditTitle(s.title);
                          }}>
                            <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onExport(s.id);
                          }}>
                            <Download className="mr-2 h-3.5 w-3.5" /> Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(s.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="mt-auto border-t border-border/40 p-2 space-y-1 bg-muted/20">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 h-9 text-xs text-muted-foreground hover:text-foreground"
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Local Instance</span>
          <span className="ml-auto text-[10px] font-mono opacity-40">VN-HCMC-01</span>
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
          setSettingsTab("ai-config");
          setShowSettingsModal(true);
        }}>
          <Key className="h-4 w-4" />
          <span>API Keys</span>
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
          setSettingsTab("general");
          setShowSettingsModal(true);
        }}>
          <Settings2 className="h-4 w-4" />
          <span>Settings</span>
        </Button>
      </div>
    </div>
  );
});
