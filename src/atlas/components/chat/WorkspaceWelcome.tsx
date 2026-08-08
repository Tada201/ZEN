import { useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import appIconUrl from "../../../../src-tauri/icons/128x128.png";

interface WorkspaceWelcomeProps {
  recentWorkspaces: string[];
  selectedWorkspace: string | null;
  onSelectWorkspace: (path: string) => void;
  composer: ReactNode;
}

function workspaceName(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).at(-1) || path;
}

/** Turn technical filesystem paths into a compact breadcrumb for the UI. */
function workspaceLocation(path: string) {
  const normalized = path
    .replaceAll("\\", "/")
    .replace(/^\/\/\?\//, "")
    .replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  const withoutDrive = parts.filter((part) => !/^[A-Za-z]:$/.test(part));
  if (withoutDrive.length === 0) return workspaceName(path);
  return withoutDrive.slice(-2).join(" / ");
}

export function WorkspaceWelcome({
  recentWorkspaces,
  selectedWorkspace,
  onSelectWorkspace,
  composer,
}: WorkspaceWelcomeProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredWorkspaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recentWorkspaces;
    return recentWorkspaces.filter((path) => path.toLowerCase().includes(query));
  }, [recentWorkspaces, search]);

  const handleOpenFolder = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: false,
        title: "Choose a workspace folder",
      });
      const path = Array.isArray(result) ? result[0] : result;
      if (typeof path === "string" && path.trim()) {
        onSelectWorkspace(path);
        setPickerOpen(false);
        setSearch("");
      }
    } catch (error) {
      console.error("[WorkspaceWelcome] Failed to open folder picker:", error);
      toast.error("The folder picker could not be opened.");
    }
  };

  // Keyboard shortcut: Ctrl+O / Cmd+O opens folder dialog directly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void handleOpenFolder();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <main className="relative z-10 flex w-full max-w-[640px] flex-col items-center">
        <img
          src={appIconUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[-8rem] z-0 h-[clamp(22rem,45vw,30rem)] w-[clamp(22rem,45vw,30rem)] -translate-x-1/2 object-contain opacity-[0.07]"
        />

        <div className="relative z-10 mb-5 flex flex-col items-center">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">
              Start where your work begins.
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              Pick a workspace, then start a conversation.
            </p>
          </div>

          {/* Quick-select recent workspace chips */}
          {recentWorkspaces.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mr-1">Recent:</span>
              {recentWorkspaces.slice(0, 3).map((path) => {
                const isSelected = path === selectedWorkspace;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onSelectWorkspace(path)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors border ${
                      isSelected
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{workspaceName(path)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative z-10 flex w-full flex-col">
          {/* Top toolbar integrated directly above composer using theme tokens */}
          <div className="relative z-30 flex items-center gap-4 rounded-t-xl border-x border-t border-border bg-card px-3.5 h-[38px]">
            <Popover
              open={pickerOpen}
              onOpenChange={(nextOpen) => {
                setPickerOpen(nextOpen);
                if (!nextOpen) setSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group relative z-10 flex items-center gap-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none"
                  aria-label="Choose workspace"
                  aria-expanded={pickerOpen}
                  title={selectedWorkspace || "Choose a workspace folder"}
                >
                  <Folder className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                  <span className="font-medium text-foreground">
                    {selectedWorkspace ? workspaceName(selectedWorkspace) : "Select workspace"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground/70" aria-hidden="true" />
                </button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                className="z-[120] w-[min(306px,calc(100vw-1.5rem))] max-w-[306px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                <div className="border-b border-border px-2.5 py-1.5">
                  <div className="relative flex items-center gap-2 text-muted-foreground">
                    <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <input
                      autoFocus
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search workspaces"
                      className="h-7 w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                      aria-label="Search workspaces"
                    />
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto p-1">
                  {filteredWorkspaces.length === 0 ? (
                    <div className="py-8 text-center text-xs italic text-muted-foreground">
                      No workspaces found
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredWorkspaces.map((path) => {
                        const isSelected = path === selectedWorkspace;
                        return (
                          <button
                            key={path}
                            type="button"
                            onClick={() => {
                              onSelectWorkspace(path);
                              setPickerOpen(false);
                            }}
                            className={`group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                              isSelected
                                ? "bg-muted text-foreground font-medium"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="truncate">{workspaceName(path)}</span>
                            </span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-border p-1">
                  <button
                    type="button"
                    onClick={() => void handleOpenFolder()}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>Open folder</span>
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              disabled
              aria-label="Git branch selector"
              title="Git branch selector"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-not-allowed opacity-80"
            >
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium text-foreground">main</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/70" aria-hidden="true" />
            </button>
          </div>

          {/* Composer */}
          <div className="relative z-40 w-full">
            {composer}
          </div>
        </div>
      </main>
    </div>
  );
}
