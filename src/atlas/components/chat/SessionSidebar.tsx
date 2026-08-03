import { useState, useMemo, memo, useDeferredValue, useRef, useEffect } from "react";
import { type TabId } from "../SettingsModal";
import { 
  Plus, Search, Trash2, Settings2, Edit2, Folder,
  MessageSquare, History,
  FolderPlus, Archive, ChevronDown, ChevronRight, FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Session, ChatFolder } from "./types";
import { SessionSidebarItem, type SearchResult } from "./SessionSidebarItem";
import type { WorkspaceModeId } from "@/lib/features/frontendFeatures";
import type { DragEvent } from "react";

const CHAT_DRAG_TYPE = "application/x-zen-chat-id";
const WORKSPACE_DRAG_TYPE = "application/x-zen-workspace-chat-ids";

function readDragIds(event: DragEvent<HTMLElement>): string[] {
  const raw = event.dataTransfer.getData(CHAT_DRAG_TYPE) || event.dataTransfer.getData(WORKSPACE_DRAG_TYPE);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [String(value)];
  } catch {
    return raw ? [raw] : [];
  }
}

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
  activeTab?: WorkspaceModeId;
  onTabChange?: (tab: WorkspaceModeId) => void;
  workspaceModes?: { id: WorkspaceModeId; label: string }[];
}

export const SessionSidebar = memo(({
  sessions, archivedSessions = [], folders, currentId, onSelect, onCreate, onDelete, onRename,
  onPin, onArchive, onUnarchive, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
  search, searchResults = [], onSearchChange, onExport, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onPreloadSettings,
  activeTab = "chat", onTabChange, workspaceModes = [{ id: "chat", label: "Chat" }]
}: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);
  const [casesMenuOpen, setCasesMenuOpen] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ChatFolder | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Force re-renders every 60s so relative timestamps (e.g. \"5m ago\")
  // update dynamically on inactive items.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const deferredSearch = useDeferredValue(search);

  const displaySessions = showArchived ? archivedSessions : sessions;

  const moveChatsToFolder = (chatIds: string[], folderId: string | null) => {
    Array.from(new Set(chatIds)).forEach((chatId) => onMoveToFolder(chatId, folderId));
  };

  const handleChatDragStart = (event: DragEvent<HTMLDivElement>, chatId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(CHAT_DRAG_TYPE, chatId);
  };

  const handleFolderDrop = (event: DragEvent<HTMLElement>, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    moveChatsToFolder(readDragIds(event), folderId);
  };

  const handleWorkspaceDragStart = (event: DragEvent<HTMLElement>, chatIds: string[]) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(WORKSPACE_DRAG_TYPE, JSON.stringify(chatIds));
  };

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
        onRequestCreateFolder={() => {
          setFolderPromptOpen(true);
          setCasesMenuOpen(false);
        }}
        onDragStart={handleChatDragStart}
        setEditingId={setEditingId}
        setEditTitle={setEditTitle}
      />
    );
  };

  const filteredSessions = useMemo(
    () => displaySessions.filter((session) =>
      session.title.toLowerCase().includes(deferredSearch.toLowerCase()),
    ),
    [displaySessions, deferredSearch],
  );

  const pinnedSessions = useMemo(
    () => filteredSessions.filter((session) => session.pinned),
    [filteredSessions],
  );

  const folderSessions = useMemo(
    () => new Map(folders.map((folder) => [
      folder.id,
      filteredSessions.filter((session) => session.folderId === folder.id && (!session.pinned || deferredSearch.length > 0)),
    ])),
    [folders, filteredSessions],
  );

  const unfiledSessions = useMemo(
    () => filteredSessions.filter((session) => !session.folderId),
    [filteredSessions],
  );

  const workspaceGroups = useMemo(() => {
    const groups = new Map<string, { label: string; sessions: Session[] }>();
    for (const session of unfiledSessions) {
      if (!showArchived && deferredSearch.length === 0 && session.pinned) continue;
      const root = session.workspaceRoot?.trim() || "__global__";
      const label = root === "__global__"
        ? "Global workspace"
        : root.replaceAll("\\", "/").replace(/\/+$/, "").split("/").filter(Boolean).at(-1) || root;
      const group = groups.get(root) ?? { label, sessions: [] };
      group.sessions.push(session);
      groups.set(root, group);
    }

    return Array.from(groups.entries())
      .sort(([rootA, groupA], [rootB, groupB]) => {
        if (rootA === "__global__") return -1;
        if (rootB === "__global__") return 1;
        return groupA.label.localeCompare(groupB.label);
      })
      .map(([root, group]) => ({
        root,
        label: group.label,
        sessions: group.sessions.sort((a, b) => b.updatedAt - a.updatedAt),
      }));
  }, [unfiledSessions, showArchived, deferredSearch]);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-muted-foreground font-sans tracking-tight">
            {showArchived ? "Archived chats" : "Projects"}
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
          {displaySessions.length > 0 && filteredSessions.length === 0 && deferredSearch.length > 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none font-sans">
              <Search className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <span className="text-xs font-medium text-muted-foreground">No matching chats</span>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
                Try a different title or message keyword.
              </span>
            </div>
          )}

          {deferredSearch.length === 0 && pinnedSessions.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pinned</div>
              {pinnedSessions.map((session) => renderSessionItem(session))}
            </div>
          )}

          {deferredSearch.length > 0 && searchResults.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Search results</div>
              {searchResults.map((result) => renderSessionItem(result, true))}
            </div>
          )}

          {deferredSearch.length === 0 && folders.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Folders</div>
              {folders.map((folder) => {
                const folderChats = folderSessions.get(folder.id) ?? [];
                const isExpanded = expandedFolders[folder.id] ?? folderChats.some((session) => session.id === currentId);
                return (
                  <section key={folder.id} className="space-y-0.5">
                    <div
                      className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleFolderDrop(event, folder.id)}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFolders((current) => ({ ...current, [folder.id]: !isExpanded }))}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-expanded={isExpanded}
                        title={`${folder.name} folder`}
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{folder.name}</span>
                        <span className="text-[10px] text-muted-foreground">{folderChats.length}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Manage ${folder.name} folder`}
                            title={`Manage ${folder.name} folder`}
                          >
                            <Settings2 size={12} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 bg-card border-border">
                          <DropdownMenuItem onClick={() => setRenameFolderTarget({ id: folder.id, name: folder.name })} className="text-xs">
                            <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteFolderTarget(folder)} className="text-destructive focus:bg-destructive/10 focus:text-destructive text-xs">
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {isExpanded && folderChats.length > 0 && (
                      <div className="ml-3 space-y-0.5 border-l border-border pl-1">
                        {folderChats.map((session) => renderSessionItem(session))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {workspaceGroups.map(({ root, label, sessions: workspaceSessions }) => {
            const workspaceChatIds = workspaceSessions.map((session) => session.id);
            const isExpanded = expandedWorkspaces[root] ?? (
              root === "__global__" || workspaceSessions.some((session) => session.id === currentId)
            );
            const moveWorkspaceToFolder = (folderId: string | null) => moveChatsToFolder(workspaceChatIds, folderId);
            return (
              <ContextMenu key={root}>
                <ContextMenuTrigger asChild>
                  <section
                    className="space-y-0.5"
                    draggable
                      onDragStart={(event) => {
                        event.stopPropagation();
                        handleWorkspaceDragStart(event, workspaceChatIds);
                      }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedWorkspaces((current) => ({ ...current, [root]: !isExpanded }))}
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      aria-expanded={isExpanded}
                      title={root === "__global__" ? "Chats using the global workspace" : label}
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{workspaceSessions.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 space-y-0.5 border-l border-border pl-1">
                        {workspaceSessions.map((session) => renderSessionItem(session))}
                      </div>
                    )}
                  </section>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-card border-border">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs">Move to Folder</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-card border-border">
                      <ContextMenuItem onSelect={() => moveWorkspaceToFolder(null)} className="text-xs">None</ContextMenuItem>
                      {folders.map((folder) => (
                        <ContextMenuItem key={folder.id} onSelect={() => moveWorkspaceToFolder(folder.id)} className="text-xs">
                          {folder.name}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
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
            <DropdownMenu open={casesMenuOpen} onOpenChange={setCasesMenuOpen}>
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
                  onClick={() => {
                    setCasesMenuOpen(false);
                    setFolderPromptOpen(true);
                  }}
                  className="text-xs"
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> New folder
                </DropdownMenuItem>
                {/* Folders are a secondary tag inside the workspace grouping, so
                    their rename/delete actions live here rather than as a second
                    tree in the list. */}
                {folders.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs">
                      <Folder className="mr-2 h-3.5 w-3.5" /> Manage folders
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-card border-border">
                      {folders.map((folder) => (
                        <DropdownMenuSub key={folder.id}>
                          <DropdownMenuSubTrigger className="text-xs">
                            {folder.name}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-card border-border">
                            <DropdownMenuItem
                              onClick={() => {
                                setCasesMenuOpen(false);
                                setRenameFolderTarget({ id: folder.id, name: folder.name });
                              }}
                              className="text-xs"
                            >
                              <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setCasesMenuOpen(false);
                                setDeleteFolderTarget(folder);
                              }}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive text-xs"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator className="bg-muted/50" />
                <DropdownMenuItem 
                  onClick={() => {
                    setCasesMenuOpen(false);
                    setConfirmPurgeOpen(true);
                  }}
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
        onSubmit={(name) => {
          onCreateFolder(name);
          setFolderPromptOpen(false);
        }}
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
