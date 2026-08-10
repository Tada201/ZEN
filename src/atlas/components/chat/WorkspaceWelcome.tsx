import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderLock,
  GitBranch,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WelcomeBlackHoleBackground } from "./WelcomeBlackHoleBackground";
import { WelcomeBlackHoleSvg } from "./WelcomeBlackHoleSvg";
import { useWorkspaceTransitioning } from "./WorkspaceViewTransition";

interface WorkspaceWelcomeProps {
  recentWorkspaces: string[];
  selectedWorkspace: string | null;
  onSelectWorkspace: (path: string) => void;
  composer: ReactNode;
}

function workspaceName(path: string) {
  const normalized = formatWorkspacePath(path).replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).at(-1) || path;
}

function formatWorkspacePath(path: string) {
  const trimmed = path.trim();
  const extendedWindowsPrefix = "\\\\?\\";
  if (trimmed.startsWith(extendedWindowsPrefix)) {
    return trimmed.slice(extendedWindowsPrefix.length);
  }
  if (trimmed.startsWith("//?/")) {
    return trimmed.slice(4);
  }
  return trimmed;
}

export function WorkspaceWelcome({
  recentWorkspaces,
  selectedWorkspace,
  onSelectWorkspace,
  composer,
}: WorkspaceWelcomeProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const welcomePageQuality = useSettingsStore((state) => state.welcomePageQuality);
  const reducedMotion = useReducedMotion();
  const configuredWorkspacePath = useSettingsStore((state) => state.workspacePath);
  const workspaceTransitioning = useWorkspaceTransitioning();
  const workspaceStatus = selectedWorkspace
    ? configuredWorkspacePath && formatWorkspacePath(selectedWorkspace) === formatWorkspacePath(configuredWorkspacePath)
      ? "Default workspace"
      : "Workspace selected for this chat"
    : "Choose a workspace before sending";

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

  let welcomeBackground: ReactNode = null;
  if (welcomePageQuality === "low") {
    welcomeBackground = <WelcomeBlackHoleSvg paused={workspaceTransitioning} />;
  } else if (welcomePageQuality === "high") {
    welcomeBackground = <WelcomeBlackHoleBackground paused={workspaceTransitioning} />;
  } else if (welcomePageQuality === "image") {
    welcomeBackground = (
      <img
        src="/background.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center"
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground">
      {/* Welcome background
          non-interactive. The configured animated, still-image, or disabled
          mode is mounted at the root so it spans the full viewport. */}
      {welcomeBackground}

      <motion.main
        className="relative z-10 flex w-full max-w-[640px] flex-col items-center"
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : {
          duration: motionDurations.standard,
          ease: motionEasings.standard,
          delay: 0.08,
        }}
      >
        <motion.div
          className="relative z-10 mb-5 flex w-fit max-w-full flex-col items-center rounded-2xl border border-border/60 bg-background/80 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : {
            duration: motionDurations.standard,
            ease: motionEasings.standard,
            delay: 0.14,
          }}
        >
          <div className="text-center">
            <h1 className="text-lg font-semibold leading-tight text-foreground sm:text-xl">
              Start where your work begins.
            </h1>
            <div className="mt-2 flex max-w-full items-center gap-1.5 text-[11px] text-muted-foreground" title={selectedWorkspace ? formatWorkspacePath(selectedWorkspace) : "No workspace selected"}>
              <FolderLock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium text-foreground">{workspaceStatus}</span>
              {selectedWorkspace && <span className="truncate">· {formatWorkspacePath(selectedWorkspace)}</span>}
            </div>
          </div>

          {/* Quick-select recent workspace chips */}
          {recentWorkspaces.length > 0 && (
            <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-1.5">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">Recent:</span>
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
                        : "border-border bg-card/95 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{workspaceName(path)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          className="relative z-10 flex w-full flex-col"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : {
            duration: motionDurations.standard,
            ease: motionEasings.standard,
            delay: 0.2,
          }}
        >
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
                    {selectedWorkspace ? `Workspace: ${workspaceName(selectedWorkspace)}` : "Choose workspace"}
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
                              setSearch("");
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
              aria-label="Git branch selection unavailable"
              title="Git branch selection is not available yet"
              className="flex cursor-not-allowed items-center gap-1.5 text-[11px] text-muted-foreground opacity-80"
            >
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium text-muted-foreground">Branch unavailable</span>
            </button>
          </div>

          {/* Composer */}
          <div className="relative z-40 w-full">
            {composer}
          </div>
        </motion.div>
      </motion.main>
    </div>
  );
}
