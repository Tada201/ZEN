import React from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useGTSMStore, SpatialEntity, TelemetrySnapshot } from '@/lib/stores/useGTSMStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { gtsmApi } from '@/api';

// Helper component for the SVG sparkline graph
function SignalSparkline({ target, snapshots }: { target: SpatialEntity, snapshots: TelemetrySnapshot[] }) {
    const entitySnaps = snapshots.filter(s => s.entity_id === target.id).sort((a, b) => a.timestamp - b.timestamp);
    
    let values: number[] = [];
    if (target.type === 'earthquake') {
        values = entitySnaps.map(s => {
            let meta: any = {};
            try { meta = JSON.parse(s.raw_data || (s as any).metadata || '{}'); } catch (_) {}
            return parseFloat(meta.magnitude || meta.mag || target.metadata.mag || 0);
        });
    } else {
        values = entitySnaps.map(s => s.alt || s.velocity || 0);
    }

    let points = "0,20 10,22 20,15 30,25 40,10 50,18 60,5 70,15 80,8 90,20 100,10"; // default
    if (values.length > 1) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        points = values.map((val, i) => {
            const x = (i / (values.length - 1)) * 100;
            const y = 25 - ((val - min) / range) * 20;
            return `${x},${y}`;
        }).join(" ");
    } else if (values.length === 1) {
        points = `0,15 100,15`;
    }

    return (
        <div className="flex flex-col bg-zinc-950/80 border border-zinc-800/60 p-3 relative overflow-hidden group shrink-0 mt-2 font-mono">
            <div className="flex justify-between items-center mb-2 relative z-10">
                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <WorkbenchIcon name="solar:chart-square-bold-duotone" size={10} className="text-cyan-400" />
                    DATALINK TREND
                </span>
                <div className="flex gap-1">
                    <button type="button" className="text-[7px] border border-zinc-800 bg-transparent px-1.5 py-0.5 text-zinc-400 hover:text-cyan-400 hover:border-cyan-400/30 transition-colors uppercase cursor-pointer">RAW</button>
                    <button type="button" className="text-[7px] border border-zinc-800 bg-transparent px-1.5 py-0.5 text-zinc-400 hover:text-cyan-400 hover:border-cyan-400/30 transition-colors uppercase cursor-pointer">EXP</button>
                </div>
            </div>

            <div className="h-10 w-full relative z-10">
                <div className="absolute inset-0 flex flex-col justify-between px-0.5 py-1 pointer-events-none">
                    <div className="w-full h-[1px] bg-zinc-800/20" />
                    <div className="w-full h-[1px] bg-zinc-800/20" />
                    <div className="w-full h-[1px] bg-zinc-800/20" />
                </div>

                <svg viewBox="0 0 100 30" width="100%" height="100%" className="overflow-visible opacity-80 group-hover:opacity-100 transition-opacity" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="transparent" />
                            <stop offset="30%" stopColor="rgba(0,255,255, 0.4)" />
                            <stop offset="100%" stopColor="rgba(0,255,255, 1)" />
                        </linearGradient>
                    </defs>
                    <polyline
                        points={points}
                        fill="none"
                        stroke="url(#neonGradient)"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        className="drop-shadow-[0_0_3px_rgba(0,255,255,0.8)]"
                    />
                    <circle cx="100" cy="10" r="1.5" fill="#00ffff" className="animate-[pulse_1s_ease-in-out_infinite]" />
                </svg>
            </div>
        </div>
    );
}

export const TargetInspector: React.FC = () => {
    const { collapsedPanels, togglePanel, selectedTarget, setIsAnalyzing, isAnalyzing, setAiSynthesis, recentSnapshots } = useGTSMStore();
    const activeModel = useSettingsStore(s => s.activeModel);
    const isCollapsed = collapsedPanels.includes('target');
    const [now, setNow] = React.useState(0);

    React.useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    const setRecentSnapshots = useGTSMStore(state => state.setRecentSnapshots);
    React.useEffect(() => {
        if (!selectedTarget) {
            setRecentSnapshots([]);
            return;
        }

        const nowSecs = Math.floor(Date.now() / 1000);
        gtsmApi.getTelemetryHistoryPage(selectedTarget.type, nowSecs, 500, 0).then(page => {
            const targetSnaps = page.items.filter(s => s.entity_id === selectedTarget.id);
            setRecentSnapshots(targetSnaps);
        }).catch(err => {
            console.error('[TargetInspector] Failed to fetch telemetry:', err);
        });
    }, [selectedTarget?.id, selectedTarget?.type, setRecentSnapshots]);

    async function handleAnalyze() {
        if (!selectedTarget || isAnalyzing) return;
        setIsAnalyzing(true);
        setAiSynthesis("");

        if (collapsedPanels.includes('ai')) {
            togglePanel('ai');
        }

        const prompt = `[SYSTEM OVERRIDE: ROLE = MAP_ASK]\nINTEL BRIEFING REQUEST — Entity: ${selectedTarget.id} | Type: ${selectedTarget.type.toUpperCase()}\n\nEntity data:\n${JSON.stringify(selectedTarget, null, 2)}\n\nProvide tactical intelligence assessment.`;
        try {
            await gtsmApi.generateInsight(prompt, activeModel || 'llama3.2');
        } catch (e) {
            setAiSynthesis(`[SYSTEM_ERROR] ${e}`);
            setIsAnalyzing(false);
        }
    }

    function renderTypeIcon(type: string) {
        switch (type) {
            case 'flight':
            case 'military': return <WorkbenchIcon name="solar:plain-bold-duotone" size={13} className="text-cyan-400" />;
            case 'satellite': return <WorkbenchIcon name="solar:satellite-bold-duotone" size={13} className="text-cyan-400" />;
            case 'earthquake': return <WorkbenchIcon name="solar:pulse-bold-duotone" size={13} className="text-cyan-400" />;
            default: return <WorkbenchIcon name="solar:gps-bold-duotone" size={13} className="text-cyan-400" />;
        }
    }

    function renderTimeSinceUpdate(target: SpatialEntity) {
        const timeVal = target.metadata.time;
        if (!timeVal) {
            return (
                <div className="flex items-center gap-1.5 mt-2 bg-cyan-500/10 px-4 py-1.5 border border-cyan-500/20 rounded-sm">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(0,255,255,0.8)]" />
                    <span className="text-[8px] text-cyan-400 font-bold tracking-wider uppercase">LIVE DATALINK ACTIVE</span>
                </div>
            );
        }

        const timestamp = Number(timeVal);
        if (!isNaN(timestamp) && timestamp > 1000000000) {
            const diffMs = now - timestamp;
            const mins = Math.max(0, Math.floor(diffMs / 60000));
            const colorClass = mins > 60 ? 'text-red-400' : 'text-cyan-400';

            return (
                <div className="flex items-center gap-1.5 mt-2 bg-black/60 px-4 py-1.5 border border-zinc-800 rounded-sm">
                    <WorkbenchIcon name="solar:clock-circle-bold" size={10} className={`${colorClass} opacity-80`} />
                    <span className="text-[8px] text-zinc-400 font-bold tracking-wider uppercase">
                        LAST UPDATE: <span className={colorClass}>{mins} MINS AGO</span>
                    </span>
                </div>
            )
        }

        return (
            <div className="flex items-center gap-1.5 mt-2 bg-black/60 px-4 py-1.5 border border-zinc-800 rounded-sm">
                <WorkbenchIcon name="solar:clock-circle-bold" size={10} className="text-zinc-500" />
                <span className="text-[8px] text-zinc-500 font-bold tracking-wider uppercase">
                    DATA TIMESTAMP: <span className="text-zinc-300">{String(timeVal).substring(0, 15)}</span>
                </span>
            </div>
        )
    }

    function renderDataWidget(target: SpatialEntity) {
        if (target.type === 'earthquake') {
            const mag = target.metadata.mag || 0;
            const depth = target.metadata.depth || 0;
            const magPercentage = Math.min((mag / 10) * 100, 100);
            const isSevere = mag >= 6.0;
            const colorClass = isSevere ? 'text-red-500' : 'text-cyan-400';
            const bgClass = isSevere ? 'bg-red-500' : 'bg-cyan-400';

            return (
                <div className="flex flex-col gap-2 mt-2 shrink-0 font-mono text-[9px]">
                    <div className="bg-zinc-950/80 border border-zinc-800/60 p-3 relative overflow-hidden rounded-sm">
                        <div className="flex justify-between items-center z-10 mb-1.5">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                                {isSevere ? <WorkbenchIcon name="solar:danger-bold" size={10} className="text-red-500 animate-pulse" /> : <WorkbenchIcon name="solar:pulse-bold" size={10} className="text-zinc-500" />}
                                SEISMIC MAGNITUDE
                            </span>
                            <span className={`font-mono font-bold ${colorClass}`}>{mag.toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 border border-zinc-850 relative z-10 overflow-hidden rounded-full">
                            <div className={`h-full transition-all duration-1000 ${bgClass}`} style={{ width: `${magPercentage}%` }} />
                        </div>
                    </div>
                    <div className="bg-zinc-950/80 border border-zinc-800/60 p-3 flex justify-between items-center rounded-sm">
                        <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1 z-10">
                            <WorkbenchIcon name="solar:shield-bold" size={10} className="text-zinc-500" /> DEPTH TO HYPOCENTER
                        </span>
                        <div className="text-[10px] text-white font-bold font-mono z-10">{depth.toFixed(1)} <span className="text-[8px] text-zinc-500">KM</span></div>
                    </div>
                </div>
            )
        }

        if (target.type === 'flight' || target.type === 'military') {
            const heading = target.metadata.true_track || 0;
            const altitude = target.position.alt || 0;
            const velocity = target.velocity || 0;

            return (
                <div className="grid grid-cols-2 gap-2 mt-2 shrink-0 font-mono text-[9px]">
                    <div className="bg-zinc-950/80 border border-zinc-800/60 flex flex-col items-center justify-center p-2 relative overflow-hidden rounded-sm">
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-bold mb-1 w-full text-center border-b border-zinc-900 pb-1">HEADING</span>
                        <div className="relative w-10 h-10 my-1">
                            <svg viewBox="0 0 50 50" className="w-full h-full">
                                <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 4" />
                                <circle cx="25" cy="25" r="16" fill="none" stroke="rgba(0,255,255,0.1)" strokeWidth="0.5" />
                                <g style={{ transform: `rotate(${heading}deg)`, transformOrigin: 'center', transition: 'transform 0.5s ease-out' }}>
                                    <path d="M25 5 L28 35 L25 30 L22 35 Z" fill="#00ffff" />
                                </g>
                            </svg>
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono font-bold mt-1">{heading.toFixed(0)}°</div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="bg-zinc-950/80 p-2.5 border border-zinc-800/60 flex justify-between items-center flex-1 rounded-sm">
                            <div className="flex flex-col">
                                <span className="text-[7.5px] text-zinc-500 uppercase tracking-wider font-bold">ALTITUDE</span>
                                <div className="text-[10px] text-white font-mono font-bold">{(altitude / 1000).toFixed(1)} <span className="text-[8px] text-zinc-500">KM</span></div>
                            </div>
                        </div>
                        <div className="bg-zinc-950/80 p-2.5 border border-zinc-800/60 flex justify-between items-center flex-1 rounded-sm">
                            <div className="flex flex-col">
                                <span className="text-[7.5px] text-zinc-500 uppercase tracking-wider font-bold">VELOCITY</span>
                                <div className="text-[10px] text-cyan-400 font-mono font-bold">{velocity.toFixed(2)} <span className="text-[8px] text-zinc-500">KM/S</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }

        if (target.type === 'satellite') {
            const velocity = target.velocity || 0;
            const altitude = target.position.alt || 0;

            return (
                <div className="flex flex-col gap-2 mt-2 shrink-0 font-mono text-[9px]">
                    <div className="bg-zinc-950/80 p-3 border border-zinc-800/60 flex justify-between relative overflow-hidden rounded-sm">
                        <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-400" />
                        <div className="flex flex-col ml-1">
                            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-bold mb-0.5">ORBITAL VELOCITY</span>
                            <div className="text-xs text-cyan-400 font-mono font-bold">
                                {velocity.toFixed(3)} <span className="text-[8px] text-zinc-500">KM/S</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-950/80 p-3 border border-zinc-800/60 flex justify-between items-center rounded-sm">
                        <div className="flex items-center gap-1.5">
                            <WorkbenchIcon name="solar:shield-bold-duotone" size={11} className="text-cyan-400/80" />
                            <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-bold">ORBITAL ALTITUDE</span>
                        </div>
                        <div className="text-[10px] text-white font-mono font-bold">
                            {(altitude / 1000).toFixed(1)} <span className="text-[8px] text-zinc-500">KM</span>
                        </div>
                    </div>
                </div>
            )
        }

        return null;
    }

    return (
        <aside className={`flex flex-col border border-zinc-800 bg-black/60 backdrop-blur-md transition-all duration-300 w-[240px] font-mono ${isCollapsed ? 'h-8 shrink-0' : 'h-full overflow-hidden'}`}>
            {/* Header */}
            <div 
                className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 cursor-pointer select-none bg-zinc-950/40" 
                onClick={() => togglePanel('target')}
            >
                <div className="flex items-center gap-2 text-cyan-400">
                    {selectedTarget ? renderTypeIcon(selectedTarget.type) : <WorkbenchIcon name="solar:target-bold-duotone" size={13} />}
                    <span className="text-[9px] font-bold tracking-[0.2em]">TARGET_INSPECTOR</span>
                </div>
                <div className="text-cyan-400">
                    {isCollapsed ? <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} /> : <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} />}
                </div>
            </div>

            {!isCollapsed && !selectedTarget && (
                <div className="flex-1 p-6 flex flex-col items-center justify-center gap-2 opacity-35">
                    <WorkbenchIcon name="solar:radar-bold" size={24} className="text-cyan-400 animate-pulse" />
                    <span className="text-[9px] font-bold tracking-widest text-zinc-500 text-center uppercase">Awaiting Target Signal</span>
                </div>
            )}

            {!isCollapsed && selectedTarget && (
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                    {/* Identification Block */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-0.5 max-w-[70%]">
                                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Tracking ID</span>
                                <div className="text-[10px] font-mono font-bold text-white truncate">{selectedTarget.id}</div>
                            </div>
                            <div className="px-1.5 py-0.5 border border-cyan-400/20 bg-cyan-400/5 rounded-sm">
                                <span className="text-[8px] text-cyan-400 font-bold tracking-wider uppercase">{selectedTarget.type}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Designation</span>
                            <div className="text-[9px] text-zinc-300 font-bold truncate">
                                {selectedTarget.metadata.name || selectedTarget.metadata.callsign || selectedTarget.metadata.flight || selectedTarget.metadata.title || "UNKNOWN"}
                            </div>
                        </div>

                        {renderTimeSinceUpdate(selectedTarget)}
                    </div>

                    {/* Dynamic Data Widget */}
                    {renderDataWidget(selectedTarget)}

                    {/* Sparkline Graph */}
                    <SignalSparkline target={selectedTarget} snapshots={recentSnapshots} />

                    {/* AI Analysis Action */}
                    <WorkbenchButton
                        className={`w-full flex items-center justify-center gap-2 py-2 rounded-sm border transition-all duration-300 transform active:scale-98 ${isAnalyzing ? 'border-cyan-500/20 bg-cyan-500/5 text-cyan-500/40 cursor-not-allowed' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-400'}`}
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                    >
                        {isAnalyzing ? <span className="animate-spin"><WorkbenchIcon name="solar:radar-bold" size={12} /></span> : <WorkbenchIcon name="solar:cpu-bold" size={12} />}
                        <span className="text-[9px] font-bold tracking-widest uppercase">{isAnalyzing ? 'Processing' : 'Tactical Analysis'}</span>
                    </WorkbenchButton>

                    {/* Metadata Grid */}
                    <div className="flex flex-col gap-2 pb-2">
                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-zinc-500 uppercase tracking-wider">
                            <WorkbenchIcon name="solar:database-bold" size={10} />
                            <span>Datalink Grid</span>
                        </div>
                        <div className="grid grid-cols-1 gap-px bg-zinc-900 border border-zinc-850 rounded-sm overflow-hidden text-[9px]">
                            {Object.entries(selectedTarget.metadata).map(([key, value]) => {
                                if (value === undefined || value === null || value === "") return null;
                                let displayValue = String(value);
                                if (typeof value === 'object') displayValue = "{...}";
                                if (displayValue.length > 40) displayValue = displayValue.substring(0, 37) + "...";

                                return (
                                    <div key={key} className="flex justify-between items-center px-2 py-1.5 bg-zinc-950 hover:bg-zinc-900/30 transition-colors">
                                        <span className="text-[8px] text-zinc-500 font-mono tracking-tight uppercase truncate mr-2" title={key}>{key}</span>
                                        <span className="text-[9px] text-zinc-300 font-mono font-bold truncate text-right hover:text-cyan-400 transition-colors" title={String(value)}>
                                            {displayValue}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default TargetInspector;
