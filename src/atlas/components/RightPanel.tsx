import React, { Suspense } from "react";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Map as MapIcon, Zap, PanelRightClose, PenLine, Sigma, Plus, Terminal
} from 'lucide-react';
import { getDefaultWorkbenchView, getVisibleWorkbenchViews, getWorkbenchView, isWorkbenchViewVisible } from "@/lib/features/workbenchRegistry";
import type { RightPanelTabId } from "@/lib/features/frontendFeatures";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motionDurations, motionEasings } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { WorkbenchHeaderCore } from "@/components/workbench/WorkbenchHeader";
import { WorkbenchTabButton } from "@/components/Zen/WorkbenchTabButton";
import { useChatStore } from "@/lib/stores/useChatStore";
import { countPendingApprovals } from "@/atlas/components/chat/right-panel/approvalCenterModel";
import { workbenchApi, type BackendWorkbenchTab } from "@/api/workbenchApi";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
// Lazy load heavy components to prevent main thread blocking and high INP
const SystemDiagnostics = React.lazy(() => import("@/components/shared/SystemDiagnostics").then(m => ({ default: m.SystemDiagnostics })));
const RunInspector = React.lazy(() => import("./right-panel/RunInspector").then(m => ({ default: m.RunInspector })));
const XTermPanel = React.lazy(() => import("@/components/Zen/XTermPanel").then(m => ({ default: m.XTermPanel })));
const CesiumCanvas = React.lazy(() => import("@/components/workbench/MapContainer").then(m => ({ default: m.CesiumCanvas })));
const ArtifactPanel = React.lazy(() => import("@/components/shared/ArtifactPanel").then(m => ({ default: m.ArtifactPanel })));
const OrchestratorPanel = React.lazy(() => import("./right-panel/OrchestratorPanel").then(m => ({ default: m.OrchestratorPanel })));
const ApprovalCenter = React.lazy(() => import("./chat/right-panel/ApprovalCenter").then(m => ({ default: m.ApprovalCenter })));
const InteractiveDrawingCanvas = React.lazy(() => import("@/components/widgets/workbench/InteractiveDrawingCanvas"));
const BrowserPreview = React.lazy(() => import("./workspace/BrowserPreview").then(m => ({ default: m.BrowserPreview })));

const LoadingFallback = () => {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
      className="flex h-full flex-col items-center justify-center py-32 text-muted-foreground italic opacity-60"
    >
      <div className="relative mb-4 flex h-10 w-10 items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 100 100" className="text-primary animate-spin">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="80 100" />
        </svg>
      </div>
      <p className="text-[11px] uppercase tracking-widest font-black text-muted-foreground">
        Initializing Module...
      </p>
    </motion.div>
  );
};

const MathGraphPlaceholder = () => (
  <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
      <Sigma size={24} />
    </div>
    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
      Math Graph TODO
    </h3>
    <p className="mt-3 max-w-[360px] text-[12px] leading-relaxed text-muted-foreground">
      The Desmos-backed graph renderer is disabled. This space is reserved for a future local graphing engine that works offline and renders graph_session tool output without third-party script loading.
    </p>
  </div>
);

/**
 * RightPanel - The primary system utility panel.
 */
export function RightPanel() {
  const { activeRightTab, setActiveRightTab, setRightPanelOpen, operationalParams, rightPanelCanvasMode, setRightPanelCanvasMode, activeChatId } = useUIStore();
  const browserPreviewUrl = useUIStore((state) => activeChatId ? state.browserPreviewUrlByChat[activeChatId] : undefined);
  const pendingApprovalCount = useChatStore((state) => countPendingApprovals(state.sessionMessages));
  const workbenchViews = React.useMemo(() => getVisibleWorkbenchViews(), []);
  const [orderedTabIds, setOrderedTabIds] = React.useState<string[]>([]);
  const [layoutInitialized, setLayoutInitialized] = React.useState(false);
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null);
  // Backend rows loaded on first listTabs. Used to preserve per-tab metadata
  // (stateJson, createdAt) instead of stamping fresh values on every reorder.
  const savedTabsRef = React.useRef<BackendWorkbenchTab[]>([]);

  const getBaseViewId = React.useCallback((tabId: string) => tabId.split(":")[0] as RightPanelTabId, []);
  const getViewForTab = React.useCallback((tabId: string) => workbenchViews.find((view) => view.id === getBaseViewId(tabId)), [getBaseViewId, workbenchViews]);

  React.useEffect(() => {
    let active = true;
    if (!activeChatId) {
      setOrderedTabIds([]);
      setLayoutInitialized(false);
      return () => { active = false; };
    }

    void workbenchApi.listTabs(activeChatId).then((saved) => {
      if (!active) return;
      const savedTabs = saved.sort((a, b) => a.position - b.position).filter((tab) => tab.viewId !== "__layout__");
      const savedIds = savedTabs.map((tab) => tab.id);
      const knownIds = new Set<string>(workbenchViews.map((view) => view.id));
      const isLegacyDefaultLayout = savedTabs.length === workbenchViews.length
        && savedTabs.every((tab) => tab.id === `${activeChatId}:workbench:${tab.viewId}`);
      const nextIds: string[] = savedTabs
        .filter((tab, index) => !isLegacyDefaultLayout && knownIds.has(tab.viewId) && savedIds.indexOf(tab.id) === index)
        .map((tab) => tab.id);
      savedTabsRef.current = savedTabs;
      setOrderedTabIds(nextIds);
      setLayoutInitialized(true);

      const now = new Date().toISOString();
      if (saved.length === 0 || isLegacyDefaultLayout) void Promise.all([
        ...savedTabs.map((tab) => workbenchApi.deleteTab(activeChatId, tab.id).catch(() => undefined)),
        ...nextIds.map((tabId, position) => {
        const view = getViewForTab(tabId);
        if (!view) return Promise.resolve();
        const existing = saved.find((tab) => tab.id === tabId);
        const tab: BackendWorkbenchTab = {
          id: tabId,
          chatId: activeChatId,
          viewId: view.id,
          label: view.label,
          position,
          stateJson: existing?.stateJson || null,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        return workbenchApi.upsertTab(tab).catch(() => undefined);
      }),
        workbenchApi.upsertTab({ id: `${activeChatId}:workbench:__layout__`, chatId: activeChatId, viewId: "__layout__", label: "", position: 0, stateJson: null, createdAt: now, updatedAt: now }),
      ]);
    }).catch(() => {
      if (active) {
        setOrderedTabIds([]);
        setLayoutInitialized(true);
      }
    });

    return () => { active = false; };
  }, [activeChatId, getViewForTab, workbenchViews]);

  const orderedTabList = (layoutInitialized ? orderedTabIds : [])
    .map((id) => ({ id, view: getViewForTab(id) }))
    .filter((tab): tab is { id: string; view: (typeof workbenchViews)[number] } => Boolean(tab.view));

  const persistOrder = (nextIds: string[]) => {
    if (!activeChatId) return;
    const now = new Date().toISOString();
    const savedById = new Map(savedTabsRef.current.map((tab) => [tab.id, tab]));
    const writes = nextIds.map((tabId, position) => {
      const view = getViewForTab(tabId);
      if (!view) return Promise.resolve();
      const existing = savedById.get(tabId);
      const tab: BackendWorkbenchTab = {
        id: tabId,
        chatId: activeChatId,
        viewId: view.id,
        label: view.label,
        position,
        // Preserve per-tab state instead of overwriting with the active flag.
        stateJson: existing?.stateJson ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return workbenchApi.upsertTab(tab).catch(() => undefined);
    });
    if (nextIds.length === 0) {
      writes.push(workbenchApi.upsertTab({
        id: `${activeChatId}:workbench:__layout__`, chatId: activeChatId, viewId: "__layout__", label: "", position: 0, stateJson: null, createdAt: now, updatedAt: now,
      }));
    }
    void Promise.all(writes);
  };

  const moveTab = (tabId: string) => {
    if (!draggedTabId || draggedTabId === tabId) return;
    const current = orderedTabList.map((tab) => tab.id);
    const from = current.indexOf(draggedTabId);
    const to = current.indexOf(tabId);
    if (from < 0 || to < 0) return;
    current.splice(from, 1);
    current.splice(to, 0, draggedTabId);
    setOrderedTabIds(current);
    persistOrder(current);
    setDraggedTabId(null);
  };

  const closeTab = (tabId: string) => {
    const current = orderedTabList.map((tab) => tab.id);
    const index = current.indexOf(tabId);
    if (index < 0) return;
    const next = current.filter((id) => id !== tabId);
    setOrderedTabIds(next);
    if (activeRightTab === tabId) {
      const nextActive = next[Math.max(0, Math.min(index - 1, next.length - 1))];
      // Closing the final tab leaves the workbench in its explicit empty
      // layout state. Do not silently select System Metrics as a replacement;
      // otherwise the metrics view appears impossible to close and reopening
      // the panel resurrects it as the active tab.
      setActiveRightTab(nextActive ? getBaseViewId(nextActive) === "terminal" ? nextActive : getBaseViewId(nextActive) : "");
    }
    if (activeChatId) void workbenchApi.deleteTab(activeChatId, tabId).catch(() => undefined);
    persistOrder(next);
    // Terminal PTY cleanup is handled by XTermPanel's unmount effect.
  };

  const addTab = (viewId: RightPanelTabId) => {
    const current = orderedTabList.map((tab) => tab.id);
    const existing = current.find((id) => getBaseViewId(id) === viewId);
    const tabId = viewId === "terminal" ? `${viewId}:${crypto.randomUUID()}` : existing || viewId;
    if (existing && viewId !== "terminal") {
      setActiveRightTab(existing);
      return;
    }
    const next = [...current, tabId];
    setOrderedTabIds(next);
    setLayoutInitialized(true);
    setActiveRightTab(tabId);
    persistOrder(next);
    // Terminal PTY lifecycle (spawn on mount, kill on unmount) is owned by
    // XTermPanel; the workbench tab id doubles as its session key.
  };
  // Navigation from compact surfaces (status, cards, shortcuts) must survive
  // custom tab ordering. A focused view may not exist in the saved layout yet;
  // restore it into the layout before rendering the chooser, otherwise the
  // navigation action appears to do nothing.
  React.useEffect(() => {
    if (!layoutInitialized) return;
    const baseViewId = getBaseViewId(activeRightTab);
    if (baseViewId === "terminal" || !isWorkbenchViewVisible(baseViewId)) return;
    if (orderedTabIds.some((tabId) => getBaseViewId(tabId) === baseViewId)) return;
    const next = [...orderedTabIds, baseViewId];
    setOrderedTabIds(next);
    persistOrder(next);
  }, [activeRightTab, getBaseViewId, isWorkbenchViewVisible, layoutInitialized, orderedTabIds, persistOrder]);

  const { mapMode, setMapMode } = useGTSMStore();
  const reducedMotion = useReducedMotion();
  const [mapActivated, setMapActivated] = React.useState(false);
  const [mapClosing, setMapClosing] = React.useState(false);

  const activeViewId = getBaseViewId(activeRightTab);
  const visibleActiveRightTab = activeRightTab === ""
    ? ""
    : isWorkbenchViewVisible(activeViewId)
      ? activeViewId
      : getDefaultWorkbenchView().id;

  const activeWorkbenchView = visibleActiveRightTab ? getWorkbenchView(visibleActiveRightTab) : undefined;

  React.useEffect(() => {
    // An empty active tab is intentional after the user closes the final tab;
    // keep the chooser visible instead of normalizing back to System Metrics.
    if (!activeRightTab) return;
    if (activeViewId !== visibleActiveRightTab) {
      setActiveRightTab(visibleActiveRightTab);
    }
  }, [activeRightTab, activeViewId, setActiveRightTab, visibleActiveRightTab]);

  // Terminal panels stay mounted even when another workbench view is active.
  // Each workbench tab maps 1:1 to a PTY; unmounting on view switch would kill
  // the shell. We render them in a persistent layer and only show the focused
  // tab's panel.
  const terminalTabs = orderedTabList.filter((t) => getBaseViewId(t.id) === 'terminal');
  const renderTerminalPanels = () => (
    // This layer sits inside an `absolute inset-0` overlay; give it an
    // explicit full size (the overlay's parent is not a flex container, so
    // flex-grow/flex-1 would collapse the terminal to zero height).
    <div className="relative h-full w-full overflow-hidden bg-background">
      {terminalTabs.map((tab) => (
        <div key={tab.id} className={tab.id === activeRightTab ? 'absolute inset-0 block' : 'absolute inset-0 hidden'}>
          <XTermPanel chatId={activeChatId ?? ''} sessionId={tab.id} active={tab.id === activeRightTab} />
        </div>
      ))}
    </div>
  );
  const renderTerminalEmptyState = () => (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Terminal size={22} className="mb-4 text-muted-foreground" />
      <h2 className="text-sm font-medium text-foreground">No terminal tabs open</h2>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Open a terminal to run commands in the active workspace.</p>
      <button
        type="button"
        onClick={() => addTab('terminal')}
        className="mt-5 inline-flex items-center gap-1.5 border border-success px-3 py-2 text-xs font-medium text-success hover:bg-success hover:text-success-foreground"
      >
        <Plus size={13} /> New terminal
      </button>
    </div>
  );

  const renderContent = () => {
    if (!isWorkbenchViewVisible(visibleActiveRightTab)) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-32 text-muted-foreground italic opacity-40">
          <Zap size={40} className="mb-4 text-primary/30" />
          <p className="text-[11px] uppercase tracking-widest font-black">
            Module Hidden
          </p>
          <p className="text-[12px] mt-2 text-center max-w-[220px] leading-relaxed">
            This panel is gated until the feature is mature enough for the primary UI.
          </p>
        </div>
      );
    }

    switch (visibleActiveRightTab) {
      case 'metrics':
        return (
          <div className="space-y-6">
            <SystemDiagnostics />
          </div>
        );
      case 'inspector':
        return <RunInspector />;
      case 'approvals':
        return <ApprovalCenter />;
      case 'artifacts':
        return <ArtifactPanel isEmbedded={true} />;
      case 'terminal':
        if (!activeChatId) return <div className="p-4 text-sm text-muted-foreground">Select a chat before opening a terminal.</div>;
        return terminalTabs.length === 0 ? renderTerminalEmptyState() : null;
      case 'agents':
        return <OrchestratorPanel />;
      case 'drawing':
        return (
          <div className="flex-grow flex flex-col relative w-full h-full overflow-hidden">
            <div className="flex-grow overflow-hidden relative w-full h-full flex flex-col">
              {rightPanelCanvasMode === 'draw' ? <InteractiveDrawingCanvas /> : <MathGraphPlaceholder />}
            </div>
          </div>
        );
      case 'browser':
        return (
          <BrowserPreview
            initialUrl={browserPreviewUrl}
            onUrlChange={(url) => {
              if (activeChatId) useUIStore.getState().setBrowserPreviewUrl(activeChatId, url);
            }}
          />
        );
      case 'map':
        return null;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full py-32 text-muted-foreground italic opacity-40">
            <Zap size={40} className="mb-4 text-primary/30" />
          <p className="text-[11px] uppercase tracking-widest font-black">
              Module "{visibleActiveRightTab}" Locked
            </p>
            <p className="text-[12px] mt-2 text-center max-w-[220px] leading-relaxed">
              This feature is currently under high-priority initialization.
            </p>
          </div>
        );
    }
  };

  const hasActiveTab = orderedTabList.some((tab) => tab.id === activeRightTab)
    || (activeRightTab === "inspector" && layoutInitialized);
  const showTabChooser = orderedTabList.length === 0 || !hasActiveTab;

  return (
    <div id="zen-workbench-panel" aria-label="Workbench panel" className="flex flex-col h-full bg-background border-l border-border">
      <header className="workbench-header border-b border-border flex flex-col px-2 bg-card shrink-0">
        <WorkbenchHeaderCore className={visibleActiveRightTab === "drawing" || (visibleActiveRightTab === "map" && mapActivated) ? undefined : "hidden"}>
          <div className="min-w-0 px-2">
            <p className="truncate text-xs font-semibold text-foreground">{activeWorkbenchView?.label}</p>
            {activeWorkbenchView?.description && (
              <p className="truncate text-[10px] text-muted-foreground">{activeWorkbenchView.description}</p>
            )}
          </div>
          {visibleActiveRightTab === 'drawing' && (
            <div className="ml-2 flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${rightPanelCanvasMode === 'draw' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                onClick={() => setRightPanelCanvasMode('draw')}
                title="Switch to free drawing canvas"
              >
                <PenLine size={13} />
                Draw
              </button>
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${rightPanelCanvasMode === 'mathplot' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                onClick={() => setRightPanelCanvasMode('mathplot')}
                title="Switch to math graph mode"
              >
                <Sigma size={13} />
                Graph
              </button>
            </div>
          )}
          {visibleActiveRightTab === 'map' && mapActivated && (
            <div className="flex items-center gap-2 ml-4">
              <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  className={`inline-flex h-7 items-center rounded-md px-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${mapMode === '2D' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  onClick={() => setMapMode('2D')}
                  title="Switch to 2D Map"
                >
                  2D Map
                </button>
                <button
                  type="button"
                  className={`inline-flex h-7 items-center rounded-md px-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${mapMode === '3D' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  onClick={() => setMapMode('3D')}
                  title="Switch to 3D Globe"
                >
                  3D Globe
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMapClosing(true)}
                disabled={mapClosing}
                className="px-2 py-0.5 text-[11px] font-bold font-mono tracking-widest cursor-pointer border border-destructive/30 rounded transition-all text-destructive hover:bg-destructive/15 hover:border-destructive/50 disabled:opacity-50 disabled:pointer-events-none"
                title="Close map and free GPU resources"
              >
                {mapClosing ? 'CLOSING…' : 'CLOSE_MAP'}
              </button>
            </div>
          )}
        </WorkbenchHeaderCore>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1.5" aria-label="Workbench views">
          {orderedTabList.map(({ id, view }, tabIndex) => (
            <div
              key={id}
              draggable
              onDragStart={() => setDraggedTabId(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveTab(id)}
              className="shrink-0"
            >
              <WorkbenchTabButton
                view={view}
                label={view.id === "terminal" ? `Terminal ${orderedTabList.slice(0, tabIndex + 1).filter((tab) => tab.view.id === "terminal").length}` : undefined}
                selected={activeRightTab === id}
                badge={view.id === "approvals" ? pendingApprovalCount : 0}
                compact
                onClick={() => setActiveRightTab(id)}
                onClose={() => closeTab(id)}
              />
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="codex-focus ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Add workbench tab"
                title="Add workbench tab"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Open workbench view
              </div>
              {workbenchViews.map((view) => {
                const Icon = view.icon || Activity;
                const alreadyOpen = orderedTabList.some((tab) => tab.view.id === view.id);
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onSelect={() => addTab(view.id)}
                    className="gap-2 text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>{view.label}</span>
                    {alreadyOpen && view.id !== "terminal" && <span className="ml-auto text-muted-foreground">Open</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setRightPanelOpen(false)}
            aria-label="Close workbench panel"
            title="Close workbench panel"
            className="codex-focus ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelRightClose size={16} />
          </button>
        </nav>
        </header>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showTabChooser ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10 text-center">
            <h2 className="text-xl font-semibold text-foreground">Open tab</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose a tab to open in the side pane.</p>
            <div className="mt-8 grid w-full max-w-[680px] grid-cols-2 gap-3 sm:grid-cols-3">
              {workbenchViews.map((view) => {
                const Icon = view.icon || Activity;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => addTab(view.id)}
                    className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <span>{view.id === "terminal" ? "Terminal" : view.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : visibleActiveRightTab === 'map' ? (
          <div className="flex-1 flex flex-col relative overflow-hidden bg-background select-none">
            <div className="flex-1 relative w-full h-full flex flex-col">
              {mapActivated ? (
                <motion.div
                  className="flex-1 flex flex-col w-full h-full"
                  initial={false}
                  animate={{ opacity: mapClosing ? 0 : 1, scale: mapClosing ? 0.96 : 1 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.surface, ease: motionEasings.standard }}
                  onAnimationComplete={() => {
                    if (mapClosing) {
                      setMapActivated(false);
                      setMapClosing(false);
                    }
                  }}
                >
                  <Suspense fallback={<LoadingFallback />}>
                    <CesiumCanvas />
                  </Suspense>
                </motion.div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center p-6 text-center bg-background">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 animate-pulse">
                    <MapIcon size={24} />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                    Operational Map
                  </h3>
                  <p className="text-[12px] text-muted-foreground max-w-[260px] mt-2 leading-relaxed">
                    Initializing this viewer loads heavy WebGL and Cesium 3D asset engines. Click below to confirm and activate the canvas.
                  </p>
                  <button
                    onClick={() => setMapActivated(true)}
                    className="mt-6 px-4 py-2 bg-primary/10 hover:bg-primary/25 border border-primary/25 hover:border-primary/50 text-[11px] font-bold uppercase tracking-widest text-primary rounded-xl transition-all duration-200 shadow-sm shadow-primary/5 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Activate Viewer
                  </button>
                </div>
              )}
            </div>
            <div className="px-4 py-2.5 bg-card/40 border-t border-border text-[11px] text-muted-foreground font-mono flex items-center justify-between shrink-0">
              <span>Coordinates System: WGS 84</span>
              <span className="truncate max-w-[180px]">Target: {operationalParams?.label || "Active Search"}</span>
            </div>
          </div>
        ) : visibleActiveRightTab === 'drawing' || visibleActiveRightTab === 'approvals' || visibleActiveRightTab === 'agents' || visibleActiveRightTab === 'terminal' || visibleActiveRightTab === 'artifacts' || visibleActiveRightTab === 'browser' ? (
          <div className="flex-grow flex-1 relative overflow-hidden bg-background flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={visibleActiveRightTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.standard, ease: motionEasings.standard }}
                className="flex-grow flex flex-col overflow-hidden relative w-full h-full"
              >
                <Suspense fallback={<LoadingFallback />}>
                  {renderContent()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <ScrollArea className="flex-1 p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={visibleActiveRightTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.standard, ease: motionEasings.standard }}
                className="pb-8"
              >
                <Suspense fallback={<LoadingFallback />}>
                  {renderContent()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </ScrollArea>
        )}
        {/* Terminal panels live in their own layer so their PTY sessions
            survive view switches. Same subtree always mounted; CSS toggles
            visibility. renderContent() returns null for the terminal view,
            so this layer is the single render site for terminal panels. */}
        {activeChatId && terminalTabs.length > 0 ? (
          <div className={cn("absolute inset-0", visibleActiveRightTab === 'terminal' ? 'block' : 'hidden')} aria-hidden={visibleActiveRightTab !== 'terminal'}>
            {renderTerminalPanels()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
