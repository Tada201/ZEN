import { useState } from "react";
import { ArrowLeft, ArrowRight, FolderLock, MessageCirclePlus, MoreHorizontal, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import type { Message, Session } from "./types";
import { SecurityBoundarySummary } from "./SecurityBoundarySummary";
import { WorkspaceExecutionIndicator } from "./WorkspaceExecutionIndicator";
import { WorkbenchHeaderCore } from "@/components/workbench/WorkbenchHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PromptDialog } from "@/components/ui/PromptDialog";

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
  onExportSession: (id: string) => void;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
  onOpenCapabilities: () => void;
  onToggleWorkbench: () => void;
}

function workspaceLabel(workspaceRoot: string | null | undefined) {
  if (!workspaceRoot) return "Global workspace";
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
  onExportSession,
  onOpenApprovals,
  onOpenAgents,
  onOpenCapabilities,
  onToggleWorkbench,
}: WorkspaceContextHeaderProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const scope = workspaceLabel(session?.workspaceRoot);

  return (
    <header className="workspace-context-bar flex h-full min-w-0 flex-1 items-center text-[var(--codex-text)]">
      <WorkbenchHeaderCore>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex items-center gap-0.5" aria-label="Chat navigation">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNavigateBack} disabled={!canNavigateBack} aria-label="Go back" title="Go back">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNavigateForward} disabled={!canNavigateForward} aria-label="Go forward" title="Go forward">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <span className="max-w-[min(34vw,20rem)] truncate text-[13px] font-semibold tracking-tight text-foreground font-sans">
            {session?.title || "New Chat"}
          </span>

          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onNewChat} aria-label="Start a new chat" title="New chat">
            <MessageCirclePlus className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* The workspace root is fixed when the chat is initialized. Do not
              reintroduce an in-chat folder picker here. */}
          <span
            className="flex h-7 max-w-[12rem] items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground"
            title={session?.workspaceRoot || "This chat uses the global workspace root"}
          >
            <FolderLock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate font-medium text-foreground">{scope}</span>
          </span>

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
              <DropdownMenuItem onClick={() => session && onArchiveSession(session.id)}>Archive chat</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => session && onExportSession(session.id)}>Export transcript</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const path = session?.workspaceRoot;
                  if (!path) {
                    toast.error("This chat has no session workspace root.");
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
