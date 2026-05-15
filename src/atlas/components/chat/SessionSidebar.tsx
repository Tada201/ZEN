import { useState, useMemo, memo } from "react";
import { 
  Plus, Search, Trash2, Edit2, Download, Settings2, 
  PanelLeftClose, PanelLeftOpen, MoreHorizontal, MessageSquare, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Session } from "./types";
import { SIDEBAR_COLLAPSED_WIDTH } from "@/lib/constants/design";

interface SessionSidebarProps {
  sessions: Session[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string) => void;
  onDeleteAll: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  setSettingsTab: (tab: string) => void;
  setShowSettingsModal: (val: boolean) => void;
  onToggleSidebar: () => void;
  isCollapsed?: boolean;
}

export const SessionSidebar = memo(({
  sessions, currentId, onSelect, onCreate, onDelete, onRename,
  search, onSearchChange, onExport, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onToggleSidebar,
  isCollapsed = false
}: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const groupedSessions = useMemo(() => {
    const items = [...sessions]
      .filter(s => s.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt);
      
    const today = new Date().setHours(0, 0, 0, 0);
    const yesterday = today - 86400000;
    const sevenDaysAgo = today - 86400000 * 7;

    const groups: Record<string, typeof sessions> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: []
    };

    items.forEach(s => {
      const d = new Date(s.updatedAt).getTime();
      if (d >= today) groups.Today.push(s);
      else if (d >= yesterday) groups.Yesterday.push(s);
      else if (d >= sevenDaysAgo) groups["This Week"].push(s);
      else groups.Older.push(s);
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [sessions, search]);

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full bg-[#050506] py-3 items-center gap-4 shrink-0 overflow-hidden" style={{ width: `${SIDEBAR_COLLAPSED_WIDTH}px` }}>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-zinc-500 hover:text-white hover:bg-white/5"
          onClick={onToggleSidebar}
        >
          <PanelLeftOpen size={18} />
        </Button>

        <div className="w-8 h-px bg-white/5 my-1" />

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-white/5"
          onClick={onCreate}
          title="New chat"
        >
          <Plus size={18} />
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-zinc-500 hover:text-white hover:bg-white/5"
          onClick={() => {}} 
          title="Search"
        >
          <Search size={18} />
        </Button>

        <div className="flex-1" />

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-zinc-500 hover:text-white hover:bg-white/5"
          onClick={() => {
            setSettingsTab("ai-config");
            setShowSettingsModal(true);
          }}
          title="Settings"
        >
          <Settings2 size={18} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#050506] select-none border-r border-white/5">
      {/* Header */}
      <div className="p-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase">
            Terminal Console
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-white/5"
            onClick={onToggleSidebar}
          >
            <PanelLeftClose size={15} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative group px-1">
          <Search size={11} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary transition-colors" />
          <input
            placeholder="Search chats..."
            className="w-full h-8 pl-8 pr-3 bg-zinc-900/20 border border-white/5 rounded text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-primary/20 transition-all"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-4">
          {/* New Chat Action */}
          <div 
            onClick={onCreate}
            className="group flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all border border-transparent hover:border-white/5"
          >
            <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-white/20 transition-all">
              <Plus size={14} />
            </div>
            <span className="text-xs font-medium text-zinc-300 group-hover:text-white">New chat</span>
          </div>

          {groupedSessions.map(([title, items]) => (
            <div key={title} className="space-y-0.5">
              <div className="px-2 pb-1">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{title}</span>
              </div>
              {items.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group relative flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all border border-transparent",
                    s.id === currentId 
                      ? "bg-white/5 border-white/5" 
                      : "hover:bg-white/[0.03]"
                  )}
                  onClick={() => onSelect(s.id)}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-0">
                    {editingId === s.id ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent outline-none text-xs text-primary"
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
                      <span className={cn(
                        "truncate text-xs block w-full tracking-tight transition-colors",
                        s.id === currentId ? "text-white font-medium" : "text-zinc-400 group-hover:text-zinc-200"
                      )}>
                        {s.title}
                      </span>
                    )}
                  </div>

                  <div className="absolute right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-0 transition-all">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 text-zinc-600 hover:text-white hover:bg-white/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-zinc-950 border-white/10">
                        <DropdownMenuItem onClick={() => {
                          setEditingId(s.id);
                          setEditTitle(s.title);
                        }} className="text-xs">
                          <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExport(s.id)} className="text-xs">
                          <Download className="mr-2 h-3.5 w-3.5" /> Export
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/5" />
                        <DropdownMenuItem 
                          onClick={() => onDelete(s.id)}
                          className="text-red-400 focus:bg-red-500/10 focus:text-red-400 text-xs"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="mt-auto flex flex-col border-t border-white/5 bg-zinc-950 shrink-0">
        <div className="h-10 flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5 px-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500/60" />
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">READY</span>
          </div>
          
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 gap-1.5 text-zinc-500 hover:text-white hover:bg-white/5"
                >
                  <MessageSquare size={13} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">CHATS</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border-white/10">
                <DropdownMenuItem onClick={() => {}} className="text-xs">
                  <Search className="mr-2 h-3.5 w-3.5" /> Search all chats
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} className="text-xs">
                  <History className="mr-2 h-3.5 w-3.5" /> Archive all
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem 
                  onClick={onDeleteAll}
                  className="text-red-400 text-xs"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Purge history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 gap-1.5 text-zinc-500 hover:text-white hover:bg-white/5"
              onClick={() => {
                setSettingsTab("ai-config");
                setShowSettingsModal(true);
              }}
            >
              <Settings2 size={13} />
              <span className="text-[10px] font-bold uppercase tracking-widest">CONFIG</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
