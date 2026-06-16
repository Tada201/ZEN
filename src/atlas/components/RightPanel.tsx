import React, { Suspense } from "react";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Cpu, Box, Terminal as TerminalIcon, Map as MapIcon, Zap, X, Paintbrush, PenLine, Sigma
} from 'lucide-react';
import { getDefaultRightPanelTab, getRightPanelFeature, isRightPanelFeatureVisible } from "@/lib/features/frontendFeatures";
// Lazy load heavy components to prevent main thread blocking and high INP
const SystemDiagnostics = React.lazy(() => import("@/components/shared/SystemDiagnostics").then(m => ({ default: m.SystemDiagnostics })));
const XTermPanel = React.lazy(() => import("@/components/Zen/XTermPanel").then(m => ({ default: m.XTermPanel })));
const CesiumCanvas = React.lazy(() => import("@/components/workbench/MapContainer").then(m => ({ default: m.CesiumCanvas })));
const ArtifactPanel = React.lazy(() => import("@/components/shared/ArtifactPanel").then(m => ({ default: m.ArtifactPanel })));
const AgentOrchestratorPanel = React.lazy(() => import("@/components/widgets/orchestrator/AgentOrchestratorPanel").then(m => ({ default: m.AgentOrchestratorPanel })));
const InteractiveDrawingCanvas = React.lazy(() => import("@/components/widgets/workbench/InteractiveDrawingCanvas"));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center h-full py-32 text-zinc-500 italic opacity-60">
    <div className="relative w-10 h-10 mb-4 flex items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 100 100" className="text-primary motion-safe:animate-spin">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="80 100" />
      </svg>
    </div>
    <p className="text-[11px] uppercase tracking-widest font-black text-zinc-400">
      Initializing Module...
    </p>
  </div>
);

const MathGraphPlaceholder = () => (
  <div className="flex h-full flex-col items-center justify-center bg-black p-8 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
      <Sigma size={24} />
    </div>
    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">
      Math Graph TODO
    </h3>
    <p className="mt-3 max-w-[360px] text-[12px] leading-relaxed text-zinc-500">
      The Desmos-backed graph renderer is disabled. This space is reserved for a future local graphing engine that works offline and renders graph_session tool output without third-party script loading.
    </p>
  </div>
);

/**
 * RightPanel - The primary system utility panel.
 */
export function RightPanel() {
  const { activeRightTab, setActiveRightTab, setRightPanelOpen, operationalParams, rightPanelCanvasMode, setRightPanelCanvasMode } = useUIStore();
  const [mapActivated, setMapActivated] = React.useState(false);
  const [mapClosing, setMapClosing] = React.useState(false);

  const viewMode = useGTSMStore(state => state.viewMode);
  const setViewMode = useGTSMStore(state => state.setViewMode);
  const visibleActiveRightTab = isRightPanelFeatureVisible(activeRightTab)
    ? activeRightTab
    : getDefaultRightPanelTab();

  React.useEffect(() => {
    if (visibleActiveRightTab !== activeRightTab) {
      setActiveRightTab(visibleActiveRightTab);
    }
  }, [activeRightTab, setActiveRightTab, visibleActiveRightTab]);

  const renderContent = () => {
    if (!isRightPanelFeatureVisible(visibleActiveRightTab)) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-32 text-slate-500 italic opacity-40">
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
      case 'artifacts':
        return <ArtifactPanel isEmbedded={true} />;
      case 'terminal':
        return <XTermPanel />;
      case 'agents':
        return <AgentOrchestratorPanel />;
      case 'drawing':
        return (
          <div className="flex-grow flex flex-col relative w-full h-full overflow-hidden">
            <div className="flex-grow overflow-hidden relative w-full h-full flex flex-col">
              {rightPanelCanvasMode === 'draw' ? <InteractiveDrawingCanvas /> : <MathGraphPlaceholder />}
            </div>
          </div>
        );
      case 'map':
        return null;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full py-32 text-slate-500 italic opacity-40">
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

  const getTitle = () => {
    const feature = getRightPanelFeature(visibleActiveRightTab);
    if (feature) return feature.label;

    const titles: Record<string, string> = {
      metrics: 'System Health',
      agents: 'Active Agents',
      artifacts: 'Artifacts',
      terminal: 'Terminal',
      map: 'Operational Map',
      drawing: 'Canvas Workspace',
    };
    return titles[visibleActiveRightTab] || 'Utility';
  };

  const getIcon = () => {
    const feature = getRightPanelFeature(visibleActiveRightTab);
    if (feature?.icon) {
      const IconComp = feature.icon;
      return <IconComp size={16} className="text-primary" />;
    }

    const icons: Record<string, any> = {
      metrics: Activity,
      agents: Cpu,
      artifacts: Box,
      terminal: TerminalIcon,
      map: MapIcon,
      drawing: Paintbrush,
    };
    const IconComp = icons[visibleActiveRightTab] || Activity;
    return <IconComp size={16} className="text-primary" />;
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/20 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          {getIcon()}
          <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-zinc-300">{getTitle()}</span>
          {visibleActiveRightTab === 'drawing' && (
            <div className="ml-2 flex rounded-lg border border-border bg-black/40 p-0.5">
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${rightPanelCanvasMode === 'draw' ? 'bg-primary/15 text-primary' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                onClick={() => setRightPanelCanvasMode('draw')}
                title="Switch to free drawing canvas"
              >
                <PenLine size={13} />
                Draw
              </button>
              <button
                type="button"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${rightPanelCanvasMode === 'mathplot' ? 'bg-primary/15 text-primary' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
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
              <div className="flex bg-black/60 border border-white/5 p-0.5 rounded font-mono select-none">
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[11px] font-bold font-mono tracking-widest cursor-pointer border-0 rounded transition-all ${viewMode === 'globe' ? 'bg-primary/20 text-primary' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                  onClick={() => setViewMode('globe')}
                >
                  3D_GLOBE
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[11px] font-bold font-mono tracking-widest cursor-pointer border-0 rounded transition-all ${viewMode === 'navigation' ? 'bg-primary/20 text-primary' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                  onClick={() => setViewMode('navigation')}
                >
                  2D_NAV
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMapClosing(true)}
                disabled={mapClosing}
                className="px-2 py-0.5 text-[11px] font-bold font-mono tracking-widest cursor-pointer border border-red-500/30 rounded transition-all text-red-400/80 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/50 disabled:opacity-50 disabled:pointer-events-none"
                title="Close map and free GPU resources"
              >
                {mapClosing ? 'CLOSING…' : 'CLOSE_MAP'}
              </button>
            </div>
          )}
        </div>
        <button 
          onClick={() => setRightPanelOpen(false)}
          className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-all"
        >
          <X size={16} />
        </button>
      </header>          {visibleActiveRightTab === 'map' ? (
        <div className="flex-1 flex flex-col relative overflow-hidden bg-black select-none">
          <div className="flex-1 relative w-full h-full flex flex-col">
            {mapActivated ? (
              <motion.div
                className="flex-1 flex flex-col w-full h-full"
                initial={false}
                animate={{ opacity: mapClosing ? 0 : 1, scale: mapClosing ? 0.96 : 1 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
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
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 motion-safe:animate-pulse">
                  <MapIcon size={24} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-200">
                  Operational Map
                </h3>
                <p className="text-[12px] text-zinc-400 max-w-[260px] mt-2 leading-relaxed">
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
      ) : visibleActiveRightTab === 'drawing' || visibleActiveRightTab === 'agents' || visibleActiveRightTab === 'terminal' || visibleActiveRightTab === 'artifacts' ? (
        <div className="flex-grow flex-1 relative overflow-hidden bg-black flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={visibleActiveRightTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
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
              transition={{ duration: 0.2 }}
              className="pb-8"
            >
              <Suspense fallback={<LoadingFallback />}>
                {renderContent()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ScrollArea>
      )}
    </div>
  );
}
