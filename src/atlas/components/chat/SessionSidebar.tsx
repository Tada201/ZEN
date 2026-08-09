import { useState, useMemo, memo, useDeferredValue, useEffect } from "react";
import { type TabId } from "../SettingsModal";import {
  Plus, Search, Trash2, Settings2, Edit2, Folder,
  MessageSquare, History,
  FolderPlus, Archive, ArchiveRestore, ChevronDown, ChevronRight, FolderOpen, Clock3, GripVertical,
  MessageCirclePlus, CalendarClock, Wand2, ListFilter,
  type LucideIcon,
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChatGroupDialog } from "./ChatGroupDialog";
import { cn } from "@/lib/utils";
import { Session, ChatFolder } from "./types";
import { SessionSidebarItem, type SearchResult } from "./SessionSidebarItem";
import type { WorkspaceModeId } from "@/lib/features/frontendFeatures";
import type { DragEvent } from "react";

const CHAT_DRAG_TYPE = "application/x-zen-chat-id";
const WORKSPACE_DRAG_TYPE = "application/x-zen-workspace-chat-ids";
const WORKSPACE_ORDER_DRAG_TYPE = "application/x-zen-workspace-order";
const WORKSPACE_ORDER_STORAGE_KEY = "zen-sidebar-workspace-order";
const DISPLAY_MODE_STORAGE_KEY = "zen-sidebar-display-mode";
const SORT_MODE_STORAGE_KEY = "zen-sidebar-sort-mode";
const MAX_WORKSPACE_DISPLAY_LENGTH = 28;

type SessionDisplayMode = "workspace" | "timeline";
type SessionSortMode = "updated" | "created";
type WorkspaceDropPosition = "before" | "after";

function readSidebarPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

function readWorkspaceOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_ORDER_STORAGE_KEY) || "null");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function workspaceRootKey(session: Session): string {
  return session.workspaceRoot?.trim() || "__global__";
}

function workspaceFolderName(root: string): string {
  if (root === "__global__") return "Default workspace";
  return root.replaceAll("\\", "/").replace(/\/+$/, "").split("/").filter(Boolean).at(-1) || root;
}

function workspaceDisplayName(root: string): string {
  const name = workspaceFolderName(root);
  return name.length > MAX_WORKSPACE_DISPLAY_LENGTH
    ? `${name.slice(0, MAX_WORKSPACE_DISPLAY_LENGTH - 1)}…`
    : name;
}

function SidebarMenuButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  placeholder = false,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  placeholder?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-disabled={placeholder || undefined}
      title={placeholder ? `${label} — coming soon` : label}
      className="group flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {shortcut && <span className="ml-auto text-[11px] text-muted-foreground/70">{shortcut}</span>}
    </button>
  );
}

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
  onCreateInWorkspace?: (workspaceRoot: string | null) => void;
  onOpenSearch?: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onExport: (id: string) => void;
  onDeleteAll: () => void;
  onCreateFolder: (name: string, color?: string) => void;
  onRenameFolder: (folderId: string, name: string, color?: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  search: string;
  searchResults?: SearchResult[];
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
  onCreateInWorkspace, onOpenSearch, search, searchResults = [], onExport, onDeleteAll,
  setSettingsTab, setShowSettingsModal, onPreloadSettings,
  activeTab = "chat", onTabChange, workspaceModes = [{ id: "chat", label: "Chat" }]
}: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [displayMode, setDisplayMode] = useState<SessionDisplayMode>(() => readSidebarPreference(DISPLAY_MODE_STORAGE_KEY, ["workspace", "timeline"], "workspace"));
  const [sortMode, setSortMode] = useState<SessionSortMode>(() => readSidebarPreference(SORT_MODE_STORAGE_KEY, ["updated", "created"], "updated"));
  const [workspaceOrder, setWorkspaceOrder] = useState<string[]>(readWorkspaceOrder);
  const [draggingWorkspaceRoot, setDraggingWorkspaceRoot] = useState<string | null>(null);
  const [dragOverWorkspaceRoot, setDragOverWorkspaceRoot] = useState<string | null>(null);
  const [dragOverWorkspacePosition, setDragOverWorkspacePosition] = useState<WorkspaceDropPosition>("before");
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [casesMenuOpen, setCasesMenuOpen] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [groupEditTarget, setGroupEditTarget] = useState<ChatFolder | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ChatFolder | null>(null);
  const [archiveWorkspaceTarget, setArchiveWorkspaceTarget] = useState<{ label: string; chatIds: string[] } | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<{ id: string; title: string } | null>(null);

  // Force re-renders every 60s so relative timestamps (e.g. \"5m ago\")
  // update dynamically on inactive items.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_ORDER_STORAGE_KEY, JSON.stringify(workspaceOrder));
      window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
      window.localStorage.setItem(SORT_MODE_STORAGE_KEY, sortMode);
    } catch {
      // Sidebar ordering is a convenience; the chat workspace boundary is persisted separately.
    }
  }, [displayMode, sortMode, workspaceOrder]);

  const deferredSearch = useDeferredValue(search);

  // Keep the view defensive against stale caches or an older backend response:
  // archive state is a strict boundary, not merely a display hint.
  const activeSessionIds = new Set(
    sessions.filter((session) => session.archived !== true).map((session) => session.id),
  );
  const displaySessions = showArchived
    ? archivedSessions.filter(
        (session) => session.archived === true && !activeSessionIds.has(session.id),
      )
    : sessions.filter((session) => session.archived !== true);
  const visibleSearchResults = useMemo(() => {
    const visibleIds = new Set(displaySessions.map((session) => session.id));
    return searchResults.filter((result) => visibleIds.has(result.chatId));
  }, [displaySessions, searchResults]);

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

  const handleWorkspaceDragStart = (event: DragEvent<HTMLElement>, root: string, chatIds: string[]) => {
    event.dataTransfer.effectAllowed = "move";
    // Keep the existing workspace-to-folder gesture while also supporting
    // manual ordering of the workspace groups in the sidebar.
    event.dataTransfer.setData(WORKSPACE_DRAG_TYPE, JSON.stringify(chatIds));
    // Keep a plain-text fallback for WebView implementations that do not expose
    // custom MIME types during drop.
    event.dataTransfer.setData(WORKSPACE_ORDER_DRAG_TYPE, root);
    event.dataTransfer.setData("text/plain", root);
    setDraggingWorkspaceRoot(root);
    setDragOverWorkspaceRoot(null);
    setDragOverWorkspacePosition("before");
  };

  const getWorkspaceDropPosition = (event: DragEvent<HTMLElement>): WorkspaceDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  const reorderWorkspace = (
    sourceRoot: string,
    targetRoot: string,
    position: WorkspaceDropPosition = "before",
  ) => {
    if (sourceRoot === targetRoot) return;
    setWorkspaceOrder((current) => {
      const visibleRoots = orderedWorkspaceGroups.map((group) => group.root);
      const next = [...current.filter((root) => visibleRoots.includes(root))];
      for (const root of visibleRoots) {
        if (!next.includes(root)) next.push(root);
      }
      const sourceIndex = next.indexOf(sourceRoot);
      const targetIndex = next.indexOf(targetRoot);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      next.splice(sourceIndex, 1);
      const nextTargetIndex = next.indexOf(targetRoot);
      const insertIndex = position === "after" ? nextTargetIndex + 1 : nextTargetIndex;
      next.splice(insertIndex, 0, sourceRoot);
      return next;
    });
  };

  const handleWorkspaceDrop = (event: DragEvent<HTMLElement>, targetRoot: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceRoot = event.dataTransfer.getData(WORKSPACE_ORDER_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    if (sourceRoot) reorderWorkspace(sourceRoot, targetRoot, getWorkspaceDropPosition(event));
    setDraggingWorkspaceRoot(null);
    setDragOverWorkspaceRoot(null);
    setDragOverWorkspacePosition("before");
  };

  const requestDeleteSession = (id: string) => {
    const session = [...sessions, ...archivedSessions].find((item) => item.id === id);
    const result = searchResults.find((item) => item.chatId === id);
    setDeleteSessionTarget({ id, title: session?.title || result?.chatTitle || "this chat" });
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
        onDelete={requestDeleteSession}
        onRename={onRename}
        onPin={onPin}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onExport={onExport}
        onMoveToFolder={onMoveToFolder}
        onRequestCreateFolder={() => {
          setFolderDialogOpen(true);
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
    () => filteredSessions.filter((session) => session.pinned).sort((a, b) => {
      const aTime = sortMode === "created" ? a.createdAt : a.updatedAt;
      const bTime = sortMode === "created" ? b.createdAt : b.updatedAt;
      return bTime - aTime;
    }),
    [filteredSessions, sortMode],
  );

  const folderSessions = useMemo(
    () => new Map(folders.map((folder) => [
      folder.id,
      filteredSessions
        .filter((session) => session.folderId === folder.id)
        .sort((a, b) => {
          const aTime = sortMode === "created" ? a.createdAt : a.updatedAt;
          const bTime = sortMode === "created" ? b.createdAt : b.updatedAt;
          return bTime - aTime;
        }),
    ])),
    [folders, filteredSessions, sortMode],
  );

  const visibleFolders = useMemo(
    () => folders.filter((folder) => (folderSessions.get(folder.id)?.length ?? 0) > 0),
    [folders, folderSessions],
  );

  const compareSessions = useMemo(() => {
    return (a: Session, b: Session) => {
      const aTime = sortMode === "created" ? a.createdAt : a.updatedAt;
      const bTime = sortMode === "created" ? b.createdAt : b.updatedAt;
      return bTime - aTime;
    };
  }, [sortMode]);

  const timelineSessions = useMemo(
    () => filteredSessions.filter((session) => !session.folderId).sort(compareSessions),
    [filteredSessions, compareSessions],
  );

  const workspaceGroups = useMemo(() => {
    const groups = new Map<string, { label: string; sessions: Session[] }>();
    for (const session of filteredSessions) {
      if (deferredSearch.length === 0 && session.pinned) continue;
      const root = workspaceRootKey(session);
      const label = workspaceDisplayName(root);
      const group = groups.get(root) ?? { label, sessions: [] };
      group.sessions.push(session);
      groups.set(root, group);
    }

    return Array.from(groups.entries())
      .sort(([, groupA], [, groupB]) => groupA.label.localeCompare(groupB.label))
      .map(([root, group]) => ({
        root,
        label: group.label,
        sessions: group.sessions.sort(compareSessions),
      }));
  }, [filteredSessions, deferredSearch, compareSessions]);

  const orderedWorkspaceGroups = useMemo(() => {
    const defaultOrder = workspaceGroups.map((group) => group.root);
    const order = [...workspaceOrder, ...defaultOrder.filter((root) => !workspaceOrder.includes(root))];
    const positions = new Map(order.map((root, index) => [root, index]));
    return [...workspaceGroups].sort((a, b) => (positions.get(a.root) ?? 0) - (positions.get(b.root) ?? 0));
  }, [workspaceGroups, workspaceOrder]);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Reference-style utility navigation. Search, Automations, and Skills
          are intentionally presentational placeholders until their surfaces are ready. */}
      <nav aria-label="Sidebar utilities" className="flex flex-col gap-0 px-3 pb-2 pt-3">
        <SidebarMenuButton icon={MessageCirclePlus} label="New task" shortcut="Ctrl+N" onClick={onCreate} />
        <SidebarMenuButton icon={Search} label="Search" shortcut="Ctrl+K" onClick={onOpenSearch} />
        <SidebarMenuButton icon={CalendarClock} label="Automations" placeholder onClick={() => {}} />
        <SidebarMenuButton icon={Wand2} label="Skills" placeholder onClick={() => {}} />
      </nav>

      {/* Session controls are intentionally split into dedicated rows. Keeping the
          mode switcher and utility actions separate prevents clipping at the fixed
          256px sidebar width. */}
      <div className="border-t border-border/70 px-2 pb-2 pt-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex w-fit max-w-full min-w-0 rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="Chat display mode">
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === "workspace"}
              onClick={() => setDisplayMode("workspace")}
              className={cn("flex h-6 shrink-0 items-center justify-center gap-0.5 rounded px-1.5 text-[10px] font-medium transition-colors", displayMode === "workspace" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <FolderOpen size={10} aria-hidden="true" />
              Workspace
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === "timeline"}
              onClick={() => setDisplayMode("timeline")}
              className={cn("flex h-6 shrink-0 items-center justify-center gap-0.5 rounded px-1.5 text-[10px] font-medium transition-colors", displayMode === "timeline" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Clock3 size={10} aria-hidden="true" />
              Timeline
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {!showArchived && displayMode === "timeline" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent"
                onClick={() => setFolderDialogOpen(true)}
                aria-label="Create chat group"
                title="Create chat group"
              >
                <FolderPlus size={12} aria-hidden="true" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent data-[state=open]:bg-transparent" aria-label={`Filter and sort chats: ${sortMode} first`} title={`Filter and sort chats: ${sortMode} first`}>
                  <ListFilter size={13} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 bg-card border-border">
                <DropdownMenuItem onClick={() => setSortMode("updated")} className="text-xs">
                  {sortMode === "updated" ? "✓ " : ""}Updated first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortMode("created")} className="text-xs">
                  {sortMode === "created" ? "✓ " : ""}Created first
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent", showArchived && "text-primary")}
              onClick={() => setShowArchived(!showArchived)}
              aria-label={showArchived ? "Show active chats" : "Open archived chats"}
              title={showArchived ? "Active chats" : "Archived chats"}
            >
              <Archive size={13} aria-hidden="true" />
            </Button>
          </div>
        </div>

      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1.5 space-y-2.5">
          {/* Empty State Case Placeholder */}
          {displaySessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 px-3 text-center select-none font-sans">
              <History className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <span className="text-xs font-medium text-muted-foreground">{showArchived ? "No archived chats" : "No active chats"}</span>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
                {showArchived ? "Archived chats will appear here until they are restored." : "Create a new chat to start your investigation."}
              </span>
            </div>
          )}

          {/* Empty State for active search with no matches */}
          {displaySessions.length > 0 && filteredSessions.length === 0 && deferredSearch.length > 0 && (
            <div className="flex flex-col items-center justify-center py-8 px-3 text-center select-none font-sans">
              <Search className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <span className="text-xs font-medium text-muted-foreground">No matching chats</span>
              <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] leading-relaxed">
                Try a different title or message keyword.
              </span>
            </div>
          )}

          {displayMode === "timeline" && deferredSearch.length === 0 && timelineSessions.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-1.5 pb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Latest activity</span>
                <span className="text-[10px] text-muted-foreground/70">{sortMode === "updated" ? "Updated" : "Created"}</span>
              </div>
              {timelineSessions.map((session) => renderSessionItem(session))}
            </div>
          )}

          {displayMode === "workspace" && deferredSearch.length === 0 && pinnedSessions.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pinned</div>
              {pinnedSessions.map((session) => renderSessionItem(session))}
            </div>
          )}

          {deferredSearch.length > 0 && visibleSearchResults.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Search results</div>
              {visibleSearchResults.map((result) => renderSessionItem(result, true))}
            </div>
          )}

          {displayMode === "timeline" && deferredSearch.length === 0 && visibleFolders.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Chat groups</div>
              {visibleFolders.map((folder) => {
                const folderChats = folderSessions.get(folder.id) ?? [];
                const isExpanded = expandedFolders[folder.id] ?? folderChats.some((session) => session.id === currentId);
                return (
                  <section key={folder.id} className="space-y-0.5">
                    <div
                      className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleFolderDrop(event, folder.id)}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFolders((current) => ({ ...current, [folder.id]: !isExpanded }))}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        aria-expanded={isExpanded}
                        title={`${folder.name} folder`}
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <FolderOpen size={14} className="shrink-0" style={{ color: folder.color || "hsl(var(--primary))" }} aria-hidden="true" />
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: folder.color || "hsl(var(--primary))" }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{folder.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{folderChats.length}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Manage ${folder.name} group`}
                            title={`Manage ${folder.name} group`}
                          >
                            <Settings2 size={12} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 bg-card border-border">
                          <DropdownMenuItem onClick={() => setGroupEditTarget(folder)} className="text-xs">
                            <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit group
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

          {displayMode === "workspace" && orderedWorkspaceGroups.map(({ root, label, sessions: workspaceSessions }) => {
            const workspaceChatIds = workspaceSessions.map((session) => session.id);
            const allWorkspaceChatIds = workspaceSessions
              .filter((session) => session.archived !== true)
              .map((session) => session.id);
            const archivedWorkspaceChatIds = archivedSessions
              .filter((session) => session.archived === true && !activeSessionIds.has(session.id) && workspaceRootKey(session) === root)
              .map((session) => session.id);
            const isExpanded = expandedWorkspaces[root] ?? (
              root === "__global__" || workspaceSessions.some((session) => session.id === currentId)
            );
            const moveWorkspaceToFolder = (folderId: string | null) => moveChatsToFolder(workspaceChatIds, folderId);
            return (
              <ContextMenu key={root}>
                <ContextMenuTrigger asChild>
                  <section
                    className={cn("space-y-0.5", draggingWorkspaceRoot === root && "opacity-60")}
                  >
                    <div
                      className={cn(
                        "group relative flex w-full items-center gap-1.5 rounded-md border-t-2 border-transparent px-1.5 py-1 text-left transition-colors hover:bg-muted",
                        dragOverWorkspaceRoot === root && draggingWorkspaceRoot !== root && "border-primary bg-primary/5",
                      )}
                      onDragEnter={(event) => {
                        if (event.dataTransfer.types.includes(WORKSPACE_ORDER_DRAG_TYPE) || draggingWorkspaceRoot !== null) {
                          event.preventDefault();
                          setDragOverWorkspaceRoot(root);
                          setDragOverWorkspacePosition(getWorkspaceDropPosition(event));
                        }
                      }}
                      onDragOver={(event) => {
                        if (event.dataTransfer.types.includes(WORKSPACE_ORDER_DRAG_TYPE) || draggingWorkspaceRoot !== null) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverWorkspaceRoot(root);
                          setDragOverWorkspacePosition(getWorkspaceDropPosition(event));
                        }
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setDragOverWorkspaceRoot(null);
                          setDragOverWorkspacePosition("before");
                        }
                      }}
                      onDrop={(event) => handleWorkspaceDrop(event, root)}
                    >
                      <span
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={`Reorder ${label}`}
                        aria-roledescription="sortable workspace"
                        title="Drag to reorder workspace"
                        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          handleWorkspaceDragStart(event, root, workspaceChatIds);
                        }}
                        onDragEnd={() => {
                          setDraggingWorkspaceRoot(null);
                          setDragOverWorkspaceRoot(null);
                          setDragOverWorkspacePosition("before");
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          const index = orderedWorkspaceGroups.findIndex((group) => group.root === root);
                          const target = orderedWorkspaceGroups[index + (event.key === "ArrowUp" ? -1 : 1)];
                          if (target) reorderWorkspace(root, target.root, event.key === "ArrowUp" ? "before" : "after");
                        }}
                      >
                        <GripVertical size={12} aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedWorkspaces((current) => ({ ...current, [root]: !isExpanded }))}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        aria-expanded={isExpanded}
                        title={root === "__global__" ? "Chats using the configured default workspace" : root}
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
                        <span
                          className="min-w-0 flex-1 overflow-hidden text-xs font-medium text-foreground"
                          title={root === "__global__" ? "Default workspace" : workspaceFolderName(root)}
                          style={workspaceFolderName(root).length > MAX_WORKSPACE_DISPLAY_LENGTH ? {
                            maskImage: "linear-gradient(to right, black calc(100% - 1.25rem), transparent 100%)",
                            WebkitMaskImage: "linear-gradient(to right, black calc(100% - 1.25rem), transparent 100%)",
                          } : undefined}
                        >
                          {label}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{workspaceSessions.length}</span>
                      </button>
                      {dragOverWorkspaceRoot === root && draggingWorkspaceRoot !== root && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary",
                            dragOverWorkspacePosition === "after" ? "bottom-0" : "top-0",
                          )}
                        />
                      )}
                    </div>
                    {isExpanded && (
                      <div className="ml-3 space-y-0.5 border-l border-border pl-1">
                        {workspaceSessions.map((session) => renderSessionItem(session))}
                      </div>
                    )}
                  </section>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-card border-border">
                  {onCreateInWorkspace && (
                    <ContextMenuItem onSelect={() => onCreateInWorkspace(root === "__global__" ? null : root)} className="text-xs">
                      <Plus className="mr-2 h-3.5 w-3.5" /> New chat in workspace
                    </ContextMenuItem>
                  )}
                  {!showArchived && allWorkspaceChatIds.length > 0 && (
                    <ContextMenuItem
                      onSelect={() => setArchiveWorkspaceTarget({ label, chatIds: allWorkspaceChatIds })}
                      className="text-xs"
                    >
                      <Archive className="mr-2 h-3.5 w-3.5" /> Archive workspace
                    </ContextMenuItem>
                  )}
                  {showArchived && archivedWorkspaceChatIds.length > 0 && (
                    <ContextMenuItem
                      onSelect={() => {
                        archivedWorkspaceChatIds.forEach((chatId) => onUnarchive(chatId));
                      }}
                      className="text-xs"
                    >
                      <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive workspace
                    </ContextMenuItem>
                  )}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs">Move to group</ContextMenuSubTrigger>
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
        <div className="h-8 flex items-center justify-between px-1.5">
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
                  className="h-7 px-1.5 gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <MessageSquare size={12} />
                  <span className="text-xs font-medium text-muted-foreground">Organize</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem
                  onClick={() => {
                    setCasesMenuOpen(false);
                    setFolderDialogOpen(true);
                  }}
                  className="text-xs"
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> New group
                </DropdownMenuItem>
                {/* Chat groups are shown in Timeline mode as a secondary organization
                    layer; Workspace mode remains reserved for workspace boundaries. */}
                {folders.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs">
                      <Folder className="mr-2 h-3.5 w-3.5" /> Manage groups
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-card border-border">
                      {folders.map((folder) => (
                        <DropdownMenuSub key={folder.id}>
                          <DropdownMenuSubTrigger className="text-xs">
                            <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: folder.color || "hsl(var(--primary))" }} aria-hidden="true" />
                            {folder.name}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-card border-border">
                            <DropdownMenuItem
                              onClick={() => {
                                setCasesMenuOpen(false);
                                setGroupEditTarget(folder);
                              }}
                              className="text-xs"
                            >
                              <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit group
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
              className="h-7 px-1.5 gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              onPointerEnter={onPreloadSettings}
              onFocus={onPreloadSettings}
              onClick={() => {
                setSettingsTab("providers");
                setShowSettingsModal(true);
              }}
            >
              <Settings2 size={12} />
              <span className="text-xs font-medium text-muted-foreground">Config</span>
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={archiveWorkspaceTarget !== null}
        onOpenChange={(open) => { if (!open) setArchiveWorkspaceTarget(null); }}
        title={`Archive ${archiveWorkspaceTarget?.label ?? "workspace"}?`}
        description={`This moves ${archiveWorkspaceTarget?.chatIds.length ?? 0} chat${archiveWorkspaceTarget?.chatIds.length === 1 ? "" : "s"} from this workspace into Archived chats. The workspace and chat data are not deleted.`}
        confirmLabel="Archive workspace"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (archiveWorkspaceTarget) {
            archiveWorkspaceTarget.chatIds.forEach((chatId) => onArchive(chatId));
          }
          setArchiveWorkspaceTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteSessionTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteSessionTarget(null); }}
        title={`Delete "${deleteSessionTarget?.title ?? "chat"}"?`}
        description="This permanently deletes the chat and its messages. This action cannot be undone."
        confirmLabel="Delete chat"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (deleteSessionTarget) onDelete(deleteSessionTarget.id);
          setDeleteSessionTarget(null);
        }}
      />

      <ChatGroupDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        title="New chat group"
        description="Create a named, color-coded group for related chats."
        confirmLabel="Create group"
        onSubmit={(name, color) => onCreateFolder(name, color)}
      />

      <ChatGroupDialog
        open={groupEditTarget !== null}
        onOpenChange={(open) => { if (!open) setGroupEditTarget(null); }}
        initialName={groupEditTarget?.name ?? ""}
        initialColor={groupEditTarget?.color}
        title="Edit chat group"
        description="Update the group name or color without changing its chats."
        confirmLabel="Save group"
        onSubmit={(name, color) => {
          if (groupEditTarget) onRenameFolder(groupEditTarget.id, name, color);
          setGroupEditTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteFolderTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteFolderTarget(null); }}
        title={`Delete "${deleteFolderTarget?.name ?? 'folder'}"?`}
        description="Chats inside this group will be moved back to the main list. The chats themselves are not deleted."
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
