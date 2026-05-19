import React from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

export const ViewportHUD: React.FC = () => {
    const { viewportCenter, collapsedPanels, togglePanel, targetLocked, setTargetLocked } = useGTSMStore();
    const isCollapsed = collapsedPanels.includes('viewport');

    const center = viewportCenter || { lat: 40.7127, lon: -74.0060, alt: 1280 };
    const latStr = `${Math.abs(center.lat).toFixed(5)}°${center.lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(center.lon).toFixed(5)}°${center.lon >= 0 ? 'E' : 'W'}`;
    const altKM = (center.alt / 1000).toFixed(2);

    return (
        <div className={`border border-zinc-800 bg-black/60 backdrop-blur-md transition-all duration-300 font-mono ${isCollapsed ? 'h-8 overflow-hidden' : ''}`}>
            {/* Header */}
            <div 
                className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 cursor-pointer select-none bg-zinc-950/40"
                onClick={() => togglePanel('viewport')}
            >
                <div className="flex items-center gap-2 text-cyan-400">
                    <WorkbenchIcon name="solar:radar-bold-duotone" size={13} className="animate-pulse" />
                    <span className="text-[9px] font-bold tracking-[0.2em]">ORBITAL_TELEMETRY</span>
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <WorkbenchButton
                        onClick={(e) => {
                            e.stopPropagation();
                            setTargetLocked(!targetLocked);
                        }}
                        className={`p-1 bg-transparent hover:bg-zinc-800/40 border-0 transition-colors cursor-pointer ${targetLocked ? 'text-cyan-400' : 'text-zinc-500'}`}
                        title={targetLocked ? "Unlock Camera" : "Lock to Target"}
                    >
                        {targetLocked ? <WorkbenchIcon name="solar:lock-bold" size={11} /> : <WorkbenchIcon name="solar:lock-open-bold" size={11} />}
                    </WorkbenchButton>
                    <div className="text-cyan-400">
                        {isCollapsed ? <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} /> : <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} />}
                    </div>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Latitude</span>
                        <span className="font-bold text-white tracking-widest">{latStr}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Longitude</span>
                        <span className="font-bold text-white tracking-widest">{lonStr}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 border-t border-zinc-900/60 pt-1.5 mt-0.5">
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Altitude</span>
                        <span className="font-bold text-cyan-400 tracking-widest">{altKM} KM</span>
                    </div>
                    <div className="flex flex-col gap-0.5 border-t border-zinc-900/60 pt-1.5 mt-0.5">
                        <span className="text-[8px] text-zinc-500 uppercase tracking-wider">Sense_Res</span>
                        <span className="font-bold text-zinc-400 tracking-widest">30M/PX</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewportHUD;
