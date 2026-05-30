import { 
  Bot, Menu, Wrench, MoreHorizontal, Download, Trash2, Pin, PinOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Session } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";

export function ChatHeader({
  session,
  isSidebarOpen,
  onToggleSidebar,
  onPin,
  onDelete,
  onExport,
  onOpenSettings,
}: {
  session: Session | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onOpenSettings: (tab: SettingsTabId) => void;
}) {
  if (!session) return null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/40 bg-background/50 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3 overflow-hidden">
        {!isSidebarOpen && (
          <Button size="icon" variant="ghost" type="button" className="h-9 w-9 lg:hidden" onClick={onToggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold tracking-tight text-foreground">{session.title}</h1>
            {session.pinned && <Pin className="h-3 w-3 text-primary fill-primary/20" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {session.model}
            </span>
            <div className="h-1 w-1 rounded-full bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {session.generativeUI ? "Generative UI" : "Standard"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          type="button"
          className="h-8 gap-2 rounded-lg border-primary/10 bg-primary/5 text-primary hover:bg-primary/10"
          onClick={() => onOpenSettings("ai-config")}
        >
          <Bot className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Model</span>
        </Button>
        
        <Button 
          size="sm" 
          variant="outline" 
          type="button"
          className="h-8 gap-2 rounded-lg bg-muted/30 border-border/40 text-muted-foreground"
          onClick={() => onOpenSettings("capabilities")}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tools</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" type="button" className="h-8 w-8 rounded-lg text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onPin(session.id, !!session.pinned)}>
              {session.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
              {session.pinned ? "Unpin Thread" : "Pin Thread"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport(session.id)}>
              <Download className="mr-2 h-4 w-4" />
              Export Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={() => onDelete(session.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Thread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
