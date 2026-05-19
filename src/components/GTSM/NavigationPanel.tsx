import React from 'react';
import { useNavigation } from '@/hooks/useNavigation';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

export const NavigationPanel: React.FC = () => {
    const {
        startNavigation,
        cancelNavigation,
        navigationRoute,
        isRouting,
        routeError,
        lastRefresh,
        navigationActive
    } = useNavigation();

    const viewMode = useGTSMStore(state => state.viewMode);

    const viewportCenter = useGTSMStore(state => state.viewportCenter);
    const selectedTarget = useGTSMStore(state => state.selectedTarget);
    const navigationProfile = useGTSMStore(state => state.navigationProfile);
    const setNavigationProfile = useGTSMStore(state => state.setNavigationProfile);

    const [startCoord, setStartCoord] = React.useState('');
    const [endCoord, setEndCoord] = React.useState('');

    // Pre-fill start coordinate based on camera location
    React.useEffect(() => {
        if (!startCoord && viewportCenter) {
            setStartCoord(`${viewportCenter.lon.toFixed(4)}, ${viewportCenter.lat.toFixed(4)}`);
        }
    }, [viewportCenter]);

    // Pre-fill end coordinate if a target is locked/selected
    React.useEffect(() => {
        if (selectedTarget && selectedTarget.position) {
            setEndCoord(`${selectedTarget.position.lon.toFixed(4)}, ${selectedTarget.position.lat.toFixed(4)}`);
        }
    }, [selectedTarget]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const handleCalculateRoute = () => {
        const startParts = startCoord.split(',').map(s => parseFloat(s.trim()));
        const endParts = endCoord.split(',').map(s => parseFloat(s.trim()));

        if (startParts.length === 2 && !isNaN(startParts[0]) && !isNaN(startParts[1]) &&
            endParts.length === 2 && !isNaN(endParts[0]) && !isNaN(endParts[1])) {
            startNavigation([startParts[0], startParts[1]], [endParts[0], endParts[1]]);
        }
    };

    const is2D = viewMode === 'navigation';
    const containerPadding = is2D ? "p-2 flex flex-col gap-2" : "p-3 flex flex-col gap-3";
    const inputClass = is2D 
        ? "w-full h-6 px-2 bg-black/45 border border-zinc-800 rounded text-foreground focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono text-[8px]" 
        : "w-full h-7 px-2.5 bg-black/40 border border-zinc-800 rounded text-foreground focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30 transition-all font-mono text-[9px]";
    const labelSizeClass = is2D ? "text-[7.5px]" : "text-[8px]";
    const headingSizeClass = is2D ? "text-[8px]" : "text-[8.5px]";
    const profileBtnClass = (pId: string) => {
        const active = navigationProfile === pId;
        const base = `flex flex-col items-center justify-center rounded border text-center transition-all cursor-pointer`;
        const size = is2D ? 'py-1' : 'py-1.5';
        const color = active 
            ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400' 
            : 'border-zinc-850 bg-zinc-900/10 hover:bg-zinc-900/30 text-zinc-400 hover:text-white';
        return `${base} ${size} ${color}`;
    };
    const calcBtnClass = is2D
        ? "w-full h-7 bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 border border-cyan-400/30 hover:border-cyan-400/60 text-cyan-400 hover:text-white transition-all text-[8px] font-bold uppercase tracking-wider cursor-pointer rounded flex items-center justify-center gap-1 font-mono"
        : "w-full h-8 bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 border border-cyan-400/30 hover:border-cyan-400/60 text-cyan-400 hover:text-white transition-all text-[8.5px] font-bold uppercase tracking-wider cursor-pointer rounded flex items-center justify-center gap-1.5 font-mono";

    return (
        <div className="border border-zinc-800 bg-black/60 backdrop-blur-md transition-all duration-300 font-mono flex flex-col font-sans">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-950/40">
                <div className="flex items-center gap-2 text-cyan-400">
                    <WorkbenchIcon name="solar:map-arrow-up-bold-duotone" size={13} />
                    <span className="text-[9px] font-bold tracking-[0.2em] font-mono">A{'>'}B_ROUTING</span>
                </div>
                {navigationActive && (
                    <button 
                        type="button" 
                        onClick={cancelNavigation} 
                        className="text-zinc-500 hover:text-red-400 transition-colors bg-transparent border-0 cursor-pointer p-0.5"
                    >
                        <WorkbenchIcon name="solar:close-circle-bold" size={12} />
                    </button>
                )}
            </div>

            <div className={containerPadding}>
                {!navigationActive ? (
                    <div className={is2D ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
                        <div className="flex flex-col items-center justify-center py-0.5 gap-0.5 opacity-80">
                            <WorkbenchIcon name="solar:gps-bold" size={is2D ? 16 : 20} className="text-cyan-400 animate-pulse" />
                            <span className={`${headingSizeClass} font-bold uppercase tracking-widest text-cyan-400 font-mono`}>
                                ROUTING ENGINE STANDBY
                            </span>
                        </div>

                        {/* Interactive Coordinate Inputs */}
                        <div className={is2D ? "space-y-1.5 text-[8px]" : "space-y-2.5 text-[9px]"}>
                            <div className="space-y-1">
                                <div className={`flex justify-between items-center ${labelSizeClass} text-zinc-400 font-mono`}>
                                    <span className="uppercase font-bold tracking-wider">START POINT (LON, LAT)</span>
                                    <button 
                                        type="button" 
                                        onClick={() => setStartCoord(`${viewportCenter.lon.toFixed(4)}, ${viewportCenter.lat.toFixed(4)}`)}
                                        className="text-cyan-400 hover:text-white bg-transparent border-0 cursor-pointer text-[7.5px]"
                                    >
                                        [GET CAMERA]
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    placeholder="-74.0060, 40.7128"
                                    className={inputClass}
                                    value={startCoord}
                                    onChange={(e) => setStartCoord(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <div className={`flex justify-between items-center ${labelSizeClass} text-zinc-400 font-mono`}>
                                    <span className="uppercase font-bold tracking-wider">END POINT (LON, LAT)</span>
                                    <div className="flex gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => setEndCoord('106.6602, 10.7626')} // Saigon HQ preset!
                                            className="text-cyan-400 hover:text-white bg-transparent border-0 cursor-pointer text-[7.5px]"
                                        >
                                            [HQ]
                                        </button>
                                        {selectedTarget && (
                                            <button 
                                                type="button" 
                                                onClick={() => setEndCoord(`${selectedTarget.position.lon.toFixed(4)}, ${selectedTarget.position.lat.toFixed(4)}`)}
                                                className="text-cyan-400 hover:text-white bg-transparent border-0 cursor-pointer text-[7.5px]"
                                            >
                                                [TARGET]
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="106.6602, 10.7626"
                                    className={inputClass}
                                    value={endCoord}
                                    onChange={(e) => setEndCoord(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Navigation Profile Buttons */}
                        <div className="space-y-1">
                            <span className={`${labelSizeClass} text-zinc-400 uppercase font-bold tracking-wider block font-mono`}>Routing Profile</span>
                            <div className="grid grid-cols-4 gap-1.5 font-mono">
                                {[
                                    { id: 'car', icon: 'solar:car-bold', label: 'Car' },
                                    { id: 'truck', icon: 'solar:delivery-bold', label: 'Truck' },
                                    { id: 'bicycle', icon: 'solar:bicycle-bold', label: 'Bike' },
                                    { id: 'pedestrian', icon: 'solar:walking-bold', label: 'Walk' }
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className={profileBtnClass(p.id)}
                                        onClick={() => setNavigationProfile(p.id as any)}
                                    >
                                        <WorkbenchIcon name={p.icon} size={is2D ? 10 : 11} />
                                        <span className="text-[7px] font-bold uppercase mt-1 leading-none">{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {routeError && (
                            <div className="text-[8px] text-red-400 mt-1 font-mono leading-tight">
                                ERROR: {routeError}
                            </div>
                        )}

                        <button
                            type="button"
                            disabled={isRouting}
                            onClick={handleCalculateRoute}
                            className={calcBtnClass}
                        >
                            {isRouting ? (
                                <>
                                    <WorkbenchIcon name="solar:spinner-bold" className="animate-spin text-cyan-400" size={10} />
                                    CALCULATING...
                                </>
                            ) : (
                                <>
                                    <WorkbenchIcon name="solar:map-arrow-up-bold" size={10} />
                                    CALCULATE TACTICAL ROUTE
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Active Route Summary */}
                        {navigationRoute && (
                            <div className={`flex flex-col ${is2D ? 'gap-1.5 p-2' : 'gap-2 p-3'} border border-cyan-400/30 bg-cyan-400/5 relative rounded-sm font-mono`}>
                                <div className="absolute top-2 right-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isRouting ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400 shadow-[0_0_5px_#00ffff]'}`} />
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-[8px] text-zinc-500 uppercase tracking-wider">{navigationRoute.provider} ROUTE</div>
                                        <div className={`font-bold tracking-tight text-white mt-0.5 ${is2D ? 'text-sm' : 'text-lg'}`}>
                                            {formatTime(navigationRoute.traffic_duration_s || navigationRoute.duration_s)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[8px] text-zinc-500 uppercase tracking-wider">DISTANCE</div>
                                        <div className="text-xs font-bold text-cyan-400 mt-0.5">
                                            {(navigationRoute.distance_m / 1000).toFixed(1)} KM
                                        </div>
                                    </div>
                                </div>

                                {navigationRoute.traffic_duration_s && Math.abs(navigationRoute.traffic_duration_s - navigationRoute.duration_s) > 60 && (
                                    <div className="text-[8.5px] text-amber-400 mt-1 flex items-center gap-1">
                                        <WorkbenchIcon name="solar:danger-bold" size={9} />
                                        {navigationRoute.summary}
                                    </div>
                                )}

                                <div className="text-[7.5px] text-zinc-500 text-right mt-0.5">
                                    LAST_SYNC: {new Date(lastRefresh).toLocaleTimeString()}
                                </div>
                            </div>
                        )}

                        {/* Turn-by-Turn Steps */}
                        <div className={`flex-1 overflow-y-auto pr-1 space-y-2 mt-1 ${is2D ? 'max-h-[100px]' : 'max-h-[140px]'} font-mono`}>
                            {navigationRoute?.steps?.map((step, idx) => (
                                <div key={idx} className="flex gap-2 text-[9px] items-start border-l border-zinc-800 pl-2 ml-1">
                                    <div className="w-10 shrink-0 text-zinc-500 text-[8px] mt-0.5 font-bold">
                                        {step.distance_m > 999 ? `${(step.distance_m / 1000).toFixed(1)}km` : `${Math.round(step.distance_m)}m`}
                                    </div>
                                    <div className="text-zinc-200 leading-normal">
                                        {step.instruction}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default NavigationPanel;
