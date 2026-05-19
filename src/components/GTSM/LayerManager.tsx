import React, { useState } from 'react';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useGTSMStore } from '@/lib/stores/useGTSMStore';

export const LayerManager: React.FC = () => {
    const {
        selectedLayers,
        toggleLayer,
        imageryProvider,
        setImageryProvider,
        collapsedPanels,
        togglePanel,
        satellites,
        flights,
        earthquakes,
        military,
        vessels,
        naturalEvents
    } = useGTSMStore();

    const [search, setSearch] = useState('');
    const isCollapsed = collapsedPanels.includes('layers');

    const layers = [
        { id: 'satellites', label: 'Orbital Units', count: `${satellites.length || '—'}`, color: '#00E6E6' },
        { id: 'flights', label: 'Flights', count: `${flights.length || '—'}`, color: '#39FF14' },
        { id: 'earthquakes', label: 'Seismic', count: `${earthquakes.length || '—'}`, color: '#FF2266' },
        { id: 'military', label: 'Military', count: `${military.length || '—'}`, color: '#FFCC00' },
        { id: 'vessels', label: 'Vessels (AIS)', count: `${vessels.length || '—'}`, color: '#00CCFF' },
        { id: 'naturalEvents', label: 'Natural Events', count: `${naturalEvents.length || '—'}`, color: '#FF4500' },
        { id: 'weather', label: 'Thermal Map', count: 'API', color: '#f97316' },
        { id: 'radar', label: 'Precip Radar', count: 'LIVE', color: '#4488FF' },
        { id: 'heatmap', label: 'Threat Heatmap', count: 'DATA', color: '#EF4444' },
    ];

    const filteredLayers = layers.filter(l => l.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className={`border border-zinc-800 bg-black/60 backdrop-blur-md transition-all duration-300 font-mono ${isCollapsed ? 'h-8 overflow-hidden' : ''}`}>
            {/* Header */}
            <div 
                className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 cursor-pointer select-none bg-zinc-950/40"
                onClick={() => togglePanel('layers')}
            >
                <div className="flex items-center gap-2 text-cyan-400">
                    <WorkbenchIcon name="solar:layers-bold-duotone" size={13} />
                    <span className="text-[9px] font-bold tracking-[0.2em]">LAYER_MANIFEST</span>
                </div>
                <div className="text-cyan-400">
                    {isCollapsed ? <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} /> : <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} />}
                </div>
            </div>

            {!isCollapsed && (
                <div className="p-3 flex flex-col gap-3">
                    {/* Terminal Search */}
                    <div className="relative group flex items-center bg-black/50 border border-zinc-800 focus-within:border-cyan-400/70 transition-colors">
                        <div className="pl-2 pr-1 text-cyan-400/65">
                            <span className="text-[10px] font-mono font-bold">{'>_'}</span>
                        </div>
                        <input
                            type="text"
                            placeholder="FIND_QUERY..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-transparent py-1 text-[10px] font-mono text-white placeholder:text-zinc-600 focus:outline-none"
                            spellCheck={false}
                        />
                    </div>

                    {/* Base Map Selector */}
                    <div className="flex flex-col gap-1 mb-1">
                        <span className="text-[7.5px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 px-0.5">Base Imagery</span>

                        <div className="grid grid-cols-3 gap-1">
                            <button
                                type="button"
                                className={`py-1 text-[8px] font-bold font-mono tracking-widest border transition-all cursor-pointer ${imageryProvider === 'dark' ? 'bg-cyan-500/10 border-cyan-400/80 text-cyan-400' : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                                onClick={() => setImageryProvider('dark')}
                            >
                                DARK
                            </button>
                            <button
                                type="button"
                                className={`py-1 text-[8px] font-bold font-mono tracking-widest border transition-all cursor-pointer ${imageryProvider === 'satellite' ? 'bg-cyan-500/10 border-cyan-400/80 text-cyan-400' : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                                onClick={() => setImageryProvider('satellite')}
                            >
                                IMAGERY
                            </button>
                            <button
                                type="button"
                                className={`py-1 text-[8px] font-bold font-mono tracking-widest border transition-all cursor-pointer ${imageryProvider === 'off' ? 'bg-cyan-500/10 border-cyan-400/80 text-cyan-400' : 'bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                                onClick={() => setImageryProvider('off')}
                            >
                                GRID
                            </button>
                        </div>
                    </div>

                    {/* Layer List */}
                    <div className="space-y-1 max-h-[140px] overflow-y-auto pr-0.5">
                        {filteredLayers.map(layer => {
                            const isActive = selectedLayers.includes(layer.id);
                            return (
                                <div
                                    key={layer.id}
                                    className={`flex items-center justify-between p-1.5 cursor-pointer transition-all border-l-2 ${isActive ? 'bg-zinc-900/30 border-l-cyan-400' : 'bg-transparent border-l-transparent hover:bg-zinc-900/20'}`}
                                    onClick={() => toggleLayer(layer.id)}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-1.5 h-1.5"
                                            style={{
                                                backgroundColor: isActive ? layer.color : 'transparent',
                                                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.2)'
                                            }}
                                        />
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>{layer.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[8px]">
                                        <span className="font-mono text-zinc-500 bg-zinc-950/60 px-1 py-0.5 border border-zinc-900">{layer.count}</span>
                                        {isActive ? <WorkbenchIcon name="solar:eye-bold" size={10} style={{ color: layer.color }} /> : <WorkbenchIcon name="solar:eye-closed-bold" size={10} className="text-zinc-600" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LayerManager;
