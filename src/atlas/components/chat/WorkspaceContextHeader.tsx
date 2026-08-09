import { useState } from "react";
import { ArchiveRestore, ArrowLeft, ArrowRight, FolderLock, MessageCirclePlus, MoreHorizontal, PanelRightOpen } from "lucide-react";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { toast } from "sonner";
import type { Message, Session } from "./types";
import { SecurityBoundarySummary } from "./SecurityBoundarySummary";
import { WorkspaceExecutionIndicator } from "./WorkspaceExecutionIndicator";
import { WorkbenchHeaderCore } from "@/components/workbench/WorkbenchHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { RunStatusPopover } from "./RunStatusPopover";

interface WorkspaceContextHeaderProps {
  session: Session | null;
  messages: Message[];
  isStreaming: boolean;
  onNewChat: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onRenameSession: (id: string, title: string) => void;
  onPinSession: (id: string) => void;
  onArchiveSession: (id: string) => void;
  onUnarchiveSession: (id: string) => void;
  onExportSession: (id: string) => void;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
  onOpenCapabilities: () => void;
  onToggleWorkbench: () => void;
}

function workspaceLabel(workspaceRoot: string | null | undefined) {
  if (!workspaceRoot?.trim()) return "Workspace not configured";
  const normalized = workspaceRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).at(-1) || workspaceRoot;
}

/**
 * The window title bar's chat context. It carries only what identifies and
 * navigates the active session — title, history, session actions, the locked
 * workspace scope, live run state, and the security boundary. Model, provider,
 * and execution-mode selection belong to the composer where the message that
 * uses them is written; duplicating them here creates a second source of truth.
 */
export function WorkspaceContextHeader({
  session,
  messages,
  isStreaming,
  onNewChat,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onUnarchiveSession,
  onExportSession,
  onOpenApprovals,
  onOpenAgents,
  onOpenCapabilities,
  onToggleWorkbench,
}: WorkspaceContextHeaderProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const configuredWorkspacePath = useSettingsStore((state) => state.workspacePath);
  const capturedWorkspacePath = session?.workspaceRoot?.trim() || null;
  const effectiveWorkspacePath = capturedWorkspacePath || configuredWorkspacePath || null;
  const scope = workspaceLabel(effectiveWorkspacePath);
  const workspaceStatus = capturedWorkspacePath
    ? "Locked for this chat"
    : effectiveWorkspacePath
      ? session
        ? "Legacy/imported chat · follows default workspace"
        : "Default workspace"
      : "Workspace not configured";

  return (
    <header className="workspace-context-bar flex h-full min-w-0 flex-1 items-center text-[var(--codex-text)]">
      <WorkbenchHeaderCore>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {(canNavigateBack || canNavigateForward) && (
            <div className="flex items-center gap-0.5" aria-label="Chat navigation">
              {canNavigateBack && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNavigateBack} aria-label="Go back" title="Go back">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
              {canNavigateForward && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNavigateForward} aria-label="Go forward" title="Go forward">
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          )}

          <span
            data-tauri-drag-region="deep"
            className="max-w-[min(34vw,20rem)] cursor-default truncate text-[13px] font-semibold tracking-tight text-foreground font-sans"
            title={session?.title || "New Chat"}
          >
            {session?.title || "New Chat"}
          </span>
          {session?.archived && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title="This chat is archived">
              <ArchiveRestore className="h-3 w-3" aria-hidden="true" /> Archived
            </span>
          )}

          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onNewChat} aria-label="Start a new chat" title="New chat">
            <MessageCirclePlus className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* A session's captured root is immutable. Workspace selection stays
              on the welcome screen so a running chat cannot silently change its boundary. */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-7 max-w-[15rem] items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Workspace: ${scope}`}
                title={effectiveWorkspacePath || "No default workspace is configured"}
              >
                <FolderLock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="hidden font-medium text-muted-foreground sm:inline">Workspace:</span>
                <span className="truncate font-medium text-foreground">{scope}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="bottom" className="w-[min(22rem,calc(100vw-2rem))] border-border bg-card p-3">
              <div className="flex items-start gap-2.5">
                <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Workspace scope</h2>
                  <p className="mt-1 text-[11px] font-medium text-primary">{workspaceStatus}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Path</p>
                  <code className="mt-0.5 block break-all rounded bg-muted/60 px-2 py-1.5 text-[11px] text-foreground">
                    {effectiveWorkspacePath || "No default workspace is configured"}
                  </code>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {capturedWorkspacePath
                      ? "This path is locked for the chat. Start a new chat to choose a different workspace."
                      : session
                        ? "This older or imported chat follows the current default workspace until a local root is assigned."
                        : "Choose a workspace before sending the first message. New chats capture it when they are created."}
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Chat actions" title="Chat actions" disabled={!session}>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>Rename chat</DropdownMenuItem>
              <DropdownMenuItem onClick={() => session && onPinSession(session.id)}>
                {session?.pinned ? "Unpin chat" : "Pin chat"}
              </DropdownMenuItem>
              {session?.archived ? (
                <DropdownMenuItem onClick={() => session && onUnarchiveSession(session.id)}>
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive chat
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => session && onArchiveSession(session.id)}>Archive chat</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => session && onExportSession(session.id)}>Export transcript</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const path = effectiveWorkspacePath;
                  if (!path) {
                    toast.error("No workspace path is configured.");
                    return;
                  }
                  void navigator.clipboard.writeText(path)
                    .then(() => toast.success("Workspace path copied"))
                    .catch(() => toast.error("Could not copy the workspace path"));
                }}
              >
                Copy workspace path
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Empty title-bar space stays a drag surface (the bar is
              data-tauri-drag-region="deep"), so no filler element is needed. */}
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
          <WorkspaceExecutionIndicator
            messages={messages}
            isStreaming={isStreaming}
            hideWhenIdle
            onOpenApprovals={onOpenApprovals}
            onOpenAgents={onOpenAgents}
          />

          <SecurityBoundarySummary
            workspaceRoot={session?.workspaceRoot}
            onOpenSettings={onOpenCapabilities}
          />

          <button
            type="button"
            onClick={onToggleWorkbench}
            className="codex-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--codex-border)] bg-[var(--codex-surface)] transition-colors hover:bg-[var(--codex-surface-muted)]"
            title="Toggle workbench"
            aria-label="Toggle workbench panel"
          >
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>

          {/* Keep the status trigger at the outer edge of the app header. */}
          <RunStatusPopover />
        </div>
      </WorkbenchHeaderCore>

      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename chat"
        label="Chat title"
        initialValue={session?.title ?? ""}
        confirmLabel="Save"
        onSubmit={(title) => {
          if (session) onRenameSession(session.id, title);
        }}
      />
    </header>
  );
}
