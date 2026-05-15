import * as Tabs from '@radix-ui/react-tabs';
import { useUIStore } from '@/lib/stores/useUIStore';
import { 
  Activity, Cpu, Globe, Box, Terminal, Map as MapIcon, 
  X, Info, Layers, Zap
} from 'lucide-react';
import { SystemMonitor } from './SystemMonitor';
import { SpaceObservatory } from './SpaceObservatory';
import { TacticalDrawing } from './TacticalDrawing';
import { TerminalPanel } from './TerminalPanel';
import { OperationalMap } from './OperationalMap';
import { AgentTaskBoard } from './AgentTaskBoard';
import { WorkflowProgress } from './WorkflowProgress';
import { AgentMetrics } from './AgentMetrics';
import { ArtifactPanel } from '../chat/ArtifactPanel';

export function RightPanel() {
    const { rightPanelOpen, setRightPanelOpen, activeRightTab, setActiveRightTab } = useUIStore();
    
    if (!rightPanelOpen) return null;

    const tabs = [
        { id: 'metrics', icon: Activity, label: 'SYSTEM' },
        { id: 'analytics', icon: Activity, label: 'STATS' },
        { id: 'agents', icon: Cpu, label: 'AGENTS' },
        { id: 'workflows', icon: Zap, label: 'FLOWS' },
        { id: 'space', icon: Globe, label: 'SPACE' },
        { id: 'drawing', icon: Layers, label: 'DRAW' },
        { id: 'artifacts', icon: Box, label: 'ARTIFACTS' },
        { id: 'terminal', icon: Terminal, label: 'TERM' },
        { id: 'map', icon: MapIcon, label: 'MAP' },
    ];

    return (
        <div className="h-full flex flex-col bg-[#0a0a0c] overflow-hidden">
            <Tabs.Root 
                value={activeRightTab} 
                onValueChange={(val) => setActiveRightTab(val as any)}
                className="flex flex-1 overflow-hidden"
            >
                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/20">
                    <header className="h-12 px-4 border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                                 {tabs.find(t => t.id === activeRightTab)?.label || 'SYSTEM'}
                             </span>
                             <div className="h-px w-8 bg-primary/40" />
                        </div>
                        <button 
                            onClick={() => setRightPanelOpen(false)}
                            className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </header>

                    <main className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        <Tabs.Content value="metrics" className="h-full outline-none">
                            <SystemMonitor />
                        </Tabs.Content>
                        <Tabs.Content value="analytics" className="h-full outline-none">
                            <AgentMetrics />
                        </Tabs.Content>
                        <Tabs.Content value="agents" className="h-full outline-none">
                            <AgentTaskBoard />
                        </Tabs.Content>
                        <Tabs.Content value="workflows" className="h-full outline-none">
                            <WorkflowProgress />
                        </Tabs.Content>
                        <Tabs.Content value="space" className="h-full outline-none">
                            <SpaceObservatory />
                        </Tabs.Content>
                        <Tabs.Content value="drawing" className="h-full outline-none">
                            <TacticalDrawing />
                        </Tabs.Content>
                        <Tabs.Content value="artifacts" className="h-full outline-none">
                            <ArtifactPanel isEmbedded={true} />
                        </Tabs.Content>
                        <Tabs.Content value="terminal" className="h-full outline-none">
                            <TerminalPanel />
                        </Tabs.Content>
                        <Tabs.Content value="map" className="h-full outline-none">
                            <OperationalMap />
                        </Tabs.Content>
                    </main>

                    <footer className="h-8 border-t border-white/5 px-3 flex items-center justify-between shrink-0 bg-zinc-900/10">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-emerald-500/80" />
                            <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest">
                                NODE_STABLE
                            </span>
                        </div>
                        <Info size={10} className="text-zinc-700" />
                    </footer>
                </div>
            </Tabs.Root>
        </div>
    );
}
