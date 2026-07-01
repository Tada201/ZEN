import { memo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Download,
  Edit2,
  Folder,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChatFolder, Session } from "./types";

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  messageContent: string;
  role: string;
  timestamp: string;
}

interface SessionSidebarItemProps {
  item: Session | SearchResult;
  isSearchResult?: boolean;
  currentId: string | null;
  editingId: string | null;
  editTitle: string;
  folders: ChatFolder[];
  showArchived: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onExport: (id: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  /** Open the app-level folder-name modal instead of using window.prompt. */
  onRequestCreateFolder: () => void;
  setEditingId: (id: string | null) => void;
  setEditTitle: (title: string) => void;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  "#39": "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&([^;]+);/g, (match, entity) => ENTITY_MAP[entity] ?? match);
}

function renderSearchSnippet(snippet: string) {
  const safeSnippet = snippet.replace(/<(?!\/?mark\b)[^>]*>/gi, "");
  const tokens = safeSnippet.split(/(<mark>|<\/mark>)/gi);
  let highlighted = false;

  return tokens.map((token, index) => {
    const lower = token.toLowerCase();
    if (lower === "<mark>") {
      highlighted = true;
      return null;
    }
    if (lower === "</mark>") {
      highlighted = false;
      return null;
    }

    const text = decodeEntities(token);
    return highlighted ? (
      <mark key={index} className="rounded bg-warning/20 px-0.5 text-amber-200">
        {text}
      </mark>
    ) : (
      <span key={index}>{text}</span>
    );
  });
}

export function SessionSidebarItemInner({
  item,
  isSearchResult = false,
  currentId,
  editingId,
  editTitle,
  folders,
  showArchived,
  onSelect,
  onDelete,
  onRename,
  onPin,
  onArchive,
  onUnarchive,
  onExport,
  onMoveToFolder,
  onRequestCreateFolder,
  setEditingId,
  setEditTitle,
}: SessionSidebarItemProps) {
  const id = isSearchResult ? (item as SearchResult).chatId : (item as Session).id;
  const displayTitle = isSearchResult ? (item as SearchResult).chatTitle : (item as Session).title;
  const isPinned = !isSearchResult && (item as Session).pinned;
  const updatedAt = isSearchResult ? undefined : (item as Session).updatedAt;
  const folderId = isSearchResult ? undefined : (item as Session).folderId;
  const folderName = folderId ? folders.find((f) => f.id === folderId)?.name : undefined;
  const relativeTime = updatedAt
    ? formatDistanceToNowStrict(updatedAt, { addSuffix: false })
    : null;
  const itemKey = isSearchResult
    ? `${(item as SearchResult).chatId}-${(item as SearchResult).messageId}`
    : (item as Session).id;

  return (
    <div
      key={itemKey}
      className={cn(
        "group relative flex flex-col gap-1 pl-3 pr-2 py-2 rounded-lg cursor-pointer transition-all",
        "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-primary/70 before:opacity-0 before:transition-opacity",
        id === currentId
          ? "bg-card/[0.07] before:opacity-100"
          : "hover:bg-muted/50",
      )}
      onClick={() => onSelect(id)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-0">
          {editingId === id ? (
            <input
              autoFocus
              className="w-full bg-transparent outline-none text-xs text-primary"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(id, editTitle);
                  setEditingId(null);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              onBlur={() => {
                onRename(id, editTitle);
                setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "truncate text-xs block flex-1 tracking-tight transition-colors",
                  id === currentId ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {displayTitle}
              </span>
              {isPinned && !showArchived && <Pin size={10} className="text-primary/60 shrink-0" />}
            </div>
          )}
        </div>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0 transition-all">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground/70 hover:text-foreground hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open actions for ${displayTitle}`}
                title={`Open actions for ${displayTitle}`}
              >
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-card border-border">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(id);
                  setEditTitle(displayTitle);
                }}
                className="text-xs"
              >
                <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>

              {!showArchived && !isSearchResult && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(id);
                  }}
                  className="text-xs"
                >
                  {(item as Session).pinned ? (
                    <>
                      <PinOff className="mr-2 h-3.5 w-3.5" /> Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-3.5 w-3.5" /> Pin
                    </>
                  )}
                </DropdownMenuItem>
              )}

              {!isSearchResult && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs" onClick={(e) => e.stopPropagation()}>
                    <Folder className="mr-2 h-3.5 w-3.5" /> Move to Folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-card border-border">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToFolder(id, null);
                      }}
                      className="text-xs"
                    >
                      None
                    </DropdownMenuItem>
                    {folders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveToFolder(id, folder.id);
                        }}
                        className="text-xs"
                      >
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-muted/50" />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestCreateFolder();
                      }}
                      className="text-xs"
                    >
                      <Folder className="mr-2 h-3.5 w-3.5" /> New folder
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(id);
                }}
                className="text-xs"
              >
                <Download className="mr-2 h-3.5 w-3.5" /> Export
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-muted/50" />

              {showArchived ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnarchive(id);
                  }}
                  className="text-xs"
                >
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(id);
                  }}
                  className="text-xs"
                >
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive text-xs"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isSearchResult && (item as SearchResult).messageContent && (
        <div className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
          {renderSearchSnippet((item as SearchResult).messageContent)}
        </div>
      )}

      {!isSearchResult && (folderName || relativeTime) && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 leading-none">
          {folderName ? (
            <span className="inline-flex items-center gap-1 max-w-[60%] truncate text-muted-foreground">
              <Folder size={9} className="shrink-0" />
              {folderName}
            </span>
          ) : null}
          {folderName && relativeTime ? <span className="text-foreground/80">·</span> : null}
          {relativeTime ? <span className="shrink-0">{relativeTime}</span> : null}
        </div>
      )}
    </div>
  );
}
export const SessionSidebarItem = memo(SessionSidebarItemInner);
