import { useState, useMemo, memo, useDeferredValue } from "react";
import { type TabId } from "../SettingsModal";
import { 
  Plus, Search, Trash2, Settings2,
  PanelLeftClose, PanelLeftOpen, MessageSquare, History,
  FolderPlus, Folder, Archive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Session, ChatFolder } from "./types";
import { SessionSidebarItem, type SearchResult } from "./SessionSidebarItem";
import { SIDEBAR_COLLAPSED_WIDTH } from "@/lib/constants/design";

interface SessionSidebarProps {
  sessions: Session[];
  archivedSessions?: Session[];
  folders: ChatFolder[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onExport: (id: string) => void;
  onDeleteAll: () => void;
  onCreateFolder: (name: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  search: string;
  searchResults?: SearchResult[];
  onSearchChange: (val: string) => void;
  setSettingsTab: (tab: TabId) => void;
  setShowSettingsModal: (val: boolean) => void;
  onToggleSidebar: () => void;
  isCollapsed?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export const SessionSidebar = memo(({
  sessions, archivedSessions = [], folders, currentId, onSelect, onCreate, onDelete, onRename,
  onPin, onArchive, onUnarchive, onCreateFolder, onMoveToFolder,
  search, searchResults = [], onSearchChange, onExport, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onToggleSidebar,
  isCollapsed = false, activeTab = "chat", onTabChange
}: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const deferredSearch = useDeferredValue(search);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const displaySessions = showArchived ? archivedSessions : sessions;

  const renderSessionItem = (it: Session | SearchResult, isSearchResult = false) => {
    return (
      <SessionSidebarItem
        key={isSearchResult ? `${(it as SearchResult).chatId}-${(it as SearchResult).messageId}` : (it as Session).id}
        item={it}
        isSearchResult={isSearchResult}
        currentId={currentId}
        editingId={editingId}
        editTitle={editTitle}
        folders={folders}
        showArchived={showArchived}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onPin={onPin}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onExport={onExport}
        onCreateFolder={onCreateFolder}
        onMoveToFolder={onMoveToFolder}
        setEditingId={setEditingId}
        setEditTitle={setEditTitle}
      />
    );
  };

  const groupedSessions: [string, (Session | SearchResult)[]][] = useMemo(() => {
    // If we have backend search results and search query is long enough, use them
    if (deferredSearch.length >= 2 && searchResults.length > 0) {
      return [["Search Results", searchResults]];
    }

    // Filter sessions by search
    const filteredSessions = displaySessions.filter(s => 
      s.title.toLowerCase().includes(deferredSearch.toLowerCase())
    );

    // Grouping logic
    const groups: Record<string, Session[]> = {
      Pinned: [],
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: []
    };

    const today = new Date().setHours(0, 0, 0, 0);
    const yesterday = today - 86400000;
    const sevenDaysAgo = today - 86400000 * 7;

    filteredSessions.forEach(s => {
      // If searching, ignore folder grouping for visibility
      const ignoreFolders = deferredSearch.length > 0;
      
      // Skip if in a folder and not searching
      if (!ignoreFolders && s.folderId && !showArchived) return;

      if (s.pinned && !showArchived) {
        groups.Pinned.push(s);
        return;
      }

      const d = new Date(s.updatedAt).getTime();
      if (d >= today) groups.Today.push(s);
      else if (d >= yesterday) groups.Yesterday.push(s);
      else if (d >= sevenDaysAgo) groups["This Week"].push(s);
      else groups.Older.push(s);
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [displaySessions, deferredSearch, showArchived, searchResults]);

  // Chats by folder
  const folderGroups = useMemo(() => {
    if (showArchived || deferredSearch.length > 0) return {};
    const groups: Record<string, Session[]> = {};
    sessions.forEach(s => {
      if (s.folderId) {
        if (!groups[s.folderId]) groups[s.folderId] = [];
        groups[s.folderId].push(s);
      }
    });
    return groups;
  }, [sessions, showArchived, deferredSearch]);

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full py-3 items-center gap-4 shrink-0 overflow-hidden" style={{ width: `${SIDEBAR_COLLAPSED_WIDTH}px` }}>
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
          onClick={() => setShowArchived(!showArchived)} 
          title={showArchived ? "Back to chats" : "Archive"}
        >
          {showArchived ? <History size={18} /> : <Archive size={18} />}
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
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-zinc-400 font-sans tracking-tight">
            {showArchived ? "Archived Cases" : "Cases & Investigations"}
          </span>
          <div className="flex items-center gap-1">
             <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-7 w-7 text-zinc-500 hover:text-white hover:bg-white/5", showArchived && "text-primary")}
              onClick={() => setShowArchived(!showArchived)}
              title={showArchived ? "Hide archived" : "Show archived"}
            >
              <Archive size={14} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-white/5"
              onClick={onToggleSidebar}
            >
              <PanelLeftClose size={15} />
            </Button>
          </div>
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
          {!showArchived && (
            <div 
              onClick={() => onCreate()}
              className="group flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all border border-transparent hover:border-white/5"
            >
              <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-white/20 transition-all">
                <Plus size={14} />
              </div>
              <span className="text-xs font-medium text-zinc-300 group-hover:text-white">New chat</span>
            </div>
          )}

          {/* Empty State Case Placeholder */}
          {displaySessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none font-sans">
              <History className="w-8 h-8 text-zinc-500 mb-2 opacity-40" />
              <span className="text-xs font-medium text-zinc-400">No active cases</span>
              <span className="text-[10px] text-zinc-500 mt-1 max-w-[180px] leading-relaxed">
                Create a new session to start your investigation.
              </span>
            </div>
          )}

          {/* Folders Section */}
          {!showArchived && deferredSearch.length === 0 && folders.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 pb-1">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Folders</span>
              </div>
              {folders.map(folder => {
                const isExpanded = expandedFolders[folder.id];
                const folderChats = folderGroups[folder.id] || [];
                
                return (
                  <div key={folder.id} className="space-y-0.5">
                    <div 
                      onClick={() => toggleFolder(folder.id)}
                      className="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 transition-all"
                    >
                      <Folder 
                        size={14} 
                        className={cn(
                          "transition-colors",
                          isExpanded ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                        )} 
                      />
                      <span className="text-xs flex-1 truncate text-zinc-400 group-hover:text-zinc-200">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-zinc-600 px-1">{folderChats.length}</span>
                    </div>
                    
                    {isExpanded && (
                      <div className="ml-4 pl-1 border-l border-white/5 space-y-0.5 mt-0.5">
                        {folderChats.length === 0 ? (
                          <div className="px-3 py-1 text-[10px] text-zinc-600 italic">Empty folder</div>
                        ) : (
                          folderChats.map(s => renderSessionItem(s))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {groupedSessions.map(([title, items]) => (
            <div key={title} className="space-y-0.5">
              <div className="px-2 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{title}</span>
              </div>
              {items.map((it: Session | SearchResult) => renderSessionItem(it, title === "Search Results"))}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="mt-auto flex flex-col border-t border-white/5 bg-zinc-950 shrink-0 font-sans">
        <div className="h-10 flex items-center justify-between px-2">
          {/* Segmented Mode Controller */}
          <div className="flex items-center gap-0.5 bg-white/5 p-0.5 rounded-lg border border-white/5 ml-1">
            <button
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 select-none",
                activeTab === "chat" 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
              onClick={() => onTabChange?.("chat")}
            >
              Chat
            </button>
            <button
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 select-none",
                activeTab === "openui" 
                  ? "bg-white/10 text-primary shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
              onClick={() => onTabChange?.("openui")}
            >
              Canvas
            </button>
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
                  <span className="text-xs font-semibold text-zinc-400">Chats</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-950 border-white/10">
                <DropdownMenuItem onClick={() => {}} className="text-xs">
                  <Search className="mr-2 h-3.5 w-3.5" /> Search all chats
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} className="text-xs">
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> New Folder
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
              <span className="text-xs font-semibold text-zinc-400">Config</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
