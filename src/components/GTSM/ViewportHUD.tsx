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
        <div className={`border border-border bg-background/45 backdrop-blur-md transition-all duration-200 ${isCollapsed ? 'h-8 overflow-hidden' : ''}`}>
            {/* Header */}
            <div 
                className="flex h-8 min-h-8 items-center justify-between px-2 border-b border-border cursor-pointer select-none"
                onClick={() => togglePanel('viewport')}
            >
                <div className="flex items-center gap-2 text-foreground">
                    <WorkbenchIcon name="solar:radar-bold-duotone" size={13} className="text-primary" />
                    <span className="text-[10px] font-medium">Viewport</span>
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <WorkbenchButton
                        onClick={(e) => {
                            e.stopPropagation();
                            setTargetLocked(!targetLocked);
                        }}
                        className={`p-1 bg-transparent hover:bg-muted/40 border-0 transition-colors cursor-pointer ${targetLocked ? 'text-cyan-400' : 'text-muted-foreground'}`}
                        title={targetLocked ? "Unlock Camera" : "Lock to Target"}
                    >
                        {targetLocked ? <WorkbenchIcon name="solar:lock-bold" size={11} /> : <WorkbenchIcon name="solar:lock-open-bold" size={11} />}
                    </WorkbenchButton>
                    <div className="text-muted-foreground">
                        {isCollapsed ? <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} /> : <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} />}
                    </div>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-2 grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-[10px]">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] text-muted-foreground">Latitude</span>
                        <span className="text-[10px] font-medium text-foreground">{latStr}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] text-muted-foreground">Longitude</span>
                        <span className="text-[10px] font-medium text-foreground">{lonStr}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 border-t border-border/60 pt-1.5 mt-0.5">
                        <span className="text-[8px] text-muted-foreground">Altitude</span>
                        <span className="text-[10px] font-medium text-foreground">{altKM} km</span>
                    </div>
                    <div className="flex flex-col gap-0.5 border-t border-border/60 pt-1.5 mt-0.5">
                        <span className="text-[8px] text-muted-foreground">Resolution</span>
                        <span className="text-[10px] font-medium text-foreground">30 m/px</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewportHUD;
