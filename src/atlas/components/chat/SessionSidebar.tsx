import { useState, useMemo, memo, useDeferredValue, useRef } from "react";
import { type TabId } from "../SettingsModal";
import { 
  Plus, Search, Trash2, Settings2,
  PanelLeftClose, PanelLeftOpen, MessageSquare, History,
  FolderPlus, Folder, Archive, Edit2, MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Session, ChatFolder } from "./types";
import { SessionSidebarItem, type SearchResult } from "./SessionSidebarItem";
import { SIDEBAR_COLLAPSED_WIDTH } from "@/lib/constants/design";
import type { WorkspaceModeId } from "@/lib/features/frontendFeatures";

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
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  search: string;
  searchResults?: SearchResult[];
  onSearchChange: (val: string) => void;
  setSettingsTab: (tab: TabId) => void;
  setShowSettingsModal: (val: boolean) => void;
  onPreloadSettings?: () => void;
  onToggleSidebar: () => void;
  isCollapsed?: boolean;
  activeTab?: WorkspaceModeId;
  onTabChange?: (tab: WorkspaceModeId) => void;
  workspaceModes?: { id: WorkspaceModeId; label: string }[];
}

export const SessionSidebar = memo(({
  sessions, archivedSessions = [], folders, currentId, onSelect, onCreate, onDelete, onRename,
  onPin, onArchive, onUnarchive, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
  search, searchResults = [], onSearchChange, onExport, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onPreloadSettings, onToggleSidebar,
  isCollapsed = false, activeTab = "chat", onTabChange, workspaceModes = [{ id: "chat", label: "Chat" }]
}: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ChatFolder | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        onMoveToFolder={onMoveToFolder}
        onRequestCreateFolder={() => setFolderPromptOpen(true)}
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
          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={onToggleSidebar}
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeftOpen size={18} />
        </Button>

        <div className="w-8 h-px bg-muted/50 my-1" />

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={onCreate}
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={18} />
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={() => setShowArchived(!showArchived)} 
          aria-label={showArchived ? "Back to chats" : "Archive"}
          title={showArchived ? "Back to chats" : "Archive"}
        >
          {showArchived ? <History size={18} /> : <Archive size={18} />}
        </Button>

        <div className="flex-1" />

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          onClick={() => {
            setSettingsTab("providers");
            setShowSettingsModal(true);
          }}
          aria-label="Settings"
          title="Settings"
          onPointerEnter={onPreloadSettings}
          onFocus={onPreloadSettings}
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
          <span className="text-[11px] font-semibold text-muted-foreground font-sans tracking-tight">
            {showArchived ? "Archived Cases" : "Cases & Investigations"}
          </span>
          <div className="flex items-center gap-1">
             <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50", showArchived && "text-primary")}
              onClick={() => setShowArchived(!showArchived)}
              aria-label={showArchived ? "Hide archived" : "Show archived"}
              title={showArchived ? "Hide archived" : "Show archived"}
            >
              <Archive size={14} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              onClick={onToggleSidebar}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <PanelLeftClose size={15} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative group px-1">
          <Search size={11} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
          <input
            ref={searchInputRef}
            placeholder="Search chats..."
            aria-label="Search chats"
            className="w-full h-8 pl-8 pr-3 bg-muted/30 border border-border rounded text-[10px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/20 transition-all"
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
              className="group flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-all border border-transparent hover:border-border"
            >
              <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-border transition-all">
                <Plus size={14} />
              </div>
              <span className="text-xs font-medium text-foreground group-hover:text-foreground">New chat</span>
            </div>
          )}

          {/* Empty State Case Placeholder */}
          {displaySessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none font-sans">
              <History className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <span className="text-xs font-medium text-muted-foreground">No active cases</span>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
                Create a new session to start your investigation.
              </span>
            </div>
          )}

          {/* Empty State for active search with no matches */}
          {displaySessions.length > 0 && groupedSessions.length === 0 && deferredSearch.length > 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none font-sans">
              <Search className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <span className="text-xs font-medium text-muted-foreground">No matching cases</span>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
                Try a different keyword or clear the search.
              </span>
            </div>
          )}

          {/* Folders Section */}
          {!showArchived && deferredSearch.length === 0 && folders.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 pb-1">
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Folders</span>
              </div>
              {folders.map(folder => {
                const isExpanded = expandedFolders[folder.id];
                const folderChats = folderGroups[folder.id] || [];

                return (
                  <div key={folder.id} className="space-y-0.5">
                    <div
                      onClick={() => toggleFolder(folder.id)}
                      className="group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-all"
                    >
                      <Folder
                        size={14}
                        className={cn(
                          "transition-colors shrink-0",
                          isExpanded ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      <span className="text-xs flex-1 truncate text-muted-foreground group-hover:text-foreground">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 px-1">{folderChats.length}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-muted-foreground/70 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Open actions for folder ${folder.name}`}
                            title={`Folder actions`}
                          >
                            <MoreHorizontal size={12} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameFolderTarget({ id: folder.id, name: folder.name });
                            }}
                            className="text-xs"
                          >
                            <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-muted/50" />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteFolderTarget(folder);
                            }}
                            className="text-destructive text-xs focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {isExpanded && (
                      <div className="ml-4 pl-1 border-l border-border space-y-0.5 mt-0.5">
                        {folderChats.length === 0 ? (
                          <div className="px-3 py-1 text-[10px] text-muted-foreground/70 italic">Empty folder</div>
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
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{title}</span>
              </div>
              {items.map((it: Session | SearchResult) => renderSessionItem(it, title === "Search Results"))}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="mt-auto flex flex-col border-t border-border bg-card shrink-0 font-sans">
        <div className="h-10 flex items-center justify-between px-2">
          {/* Segmented Mode Controller */}
          {workspaceModes.length > 1 && (
            <div className="flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg border border-border ml-1">
              {workspaceModes.map((mode) => (
                <button
                  key={mode.id}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 select-none",
                    activeTab === mode.id
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => onTabChange?.(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <MessageSquare size={13} />
                  <span className="text-xs font-semibold text-muted-foreground">Cases</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem
                  onClick={() => searchInputRef.current?.focus()}
                  className="text-xs"
                >
                  <Search className="mr-2 h-3.5 w-3.5" /> Focus search
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFolderPromptOpen(true)}
                  className="text-xs"
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-muted/50" />
                <DropdownMenuItem 
                  onClick={() => setConfirmPurgeOpen(true)}
                  disabled={sessions.length === 0}
                  className="text-destructive text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Purge history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
 
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              onPointerEnter={onPreloadSettings}
              onFocus={onPreloadSettings}
              onClick={() => {
                setSettingsTab("providers");
                setShowSettingsModal(true);
              }}
            >
              <Settings2 size={13} />
              <span className="text-xs font-semibold text-muted-foreground">Config</span>
            </Button>
          </div>
        </div>
      </div>

      <PromptDialog
        open={folderPromptOpen}
        onOpenChange={setFolderPromptOpen}
        title="New folder"
        description="Organize related cases into a folder."
        label="Folder name"
        placeholder="e.g. Work research"
        confirmLabel="Create folder"
        onSubmit={(name) => onCreateFolder(name)}
      />

      <PromptDialog
        open={renameFolderTarget !== null}
        onOpenChange={(open) => { if (!open) setRenameFolderTarget(null); }}
        title="Rename folder"
        label="Folder name"
        initialValue={renameFolderTarget?.name ?? ''}
        confirmLabel="Save"
        onSubmit={(name) => {
          if (renameFolderTarget) onRenameFolder(renameFolderTarget.id, name);
          setRenameFolderTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteFolderTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteFolderTarget(null); }}
        title={`Delete "${deleteFolderTarget?.name ?? 'folder'}"?`}
        description="Cases inside this folder will be moved back to the main list. The cases themselves are not deleted."
        confirmLabel="Delete folder"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (deleteFolderTarget) onDeleteFolder(deleteFolderTarget.id);
          setDeleteFolderTarget(null);
        }}
      />

      <ConfirmDialog
        open={confirmPurgeOpen}
        onOpenChange={setConfirmPurgeOpen}
        title="Purge case history?"
        description={
          displaySessions.length === 0
            ? 'There are no active cases to remove.'
            : `This permanently deletes all ${displaySessions.length} non-archived case${displaySessions.length === 1 ? '' : 's'} and their messages. This cannot be undone.`
        }
        confirmLabel="Purge all"
        cancelLabel="Cancel"
        destructive
        onConfirm={onDeleteAll}
      />
    </div>
  );
});
