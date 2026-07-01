import React, { useState } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { cn } from '@/lib/utils/style';

const LayerManager: React.FC = () => {
    const {
        selectedLayers,
        toggleLayer,
        collapsedPanels,
        togglePanel
    } = useGTSMStore();

    const [search, setSearch] = useState('');
    const isCollapsed = collapsedPanels.includes('layers');

    const layers = [
        { id: 'satellites', label: 'Orbital Units', color: '#00E6E6' },
        { id: 'flights', label: 'Flights', color: '#39FF14' },
        { id: 'earthquakes', label: 'Seismic', color: '#FF2266' },
        { id: 'military', label: 'Military', color: '#FFCC00' },
        { id: 'vessels', label: 'Vessels (AIS)', color: '#00CCFF' },
        { id: 'naturalEvents', label: 'Natural Events', color: '#FF4500' },
        { id: 'heatmap', label: 'Threat Heatmap', color: '#EF4444' },
    ];

    const filteredLayers = layers.filter(l => l.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className={cn(
            "bg-background/60 border border-primary/20 p-4 backdrop-blur-md rounded-lg w-72 transition-all duration-300",
            isCollapsed && "h-12 overflow-hidden"
        )}>
            <div className="flex justify-between items-center mb-4 cursor-pointer" onClick={() => togglePanel('layers')}>
                <h3 className="text-xs font-bold tracking-widest text-primary uppercase">Layer Manager</h3>
                <span className="text-[10px] opacity-50">{isCollapsed ? '[+EXPAND]' : '[-COLLAPSE]'}</span>
            </div>

            {!isCollapsed && (
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Search layers..."
                        className="w-full bg-background/40 border border-primary/20 text-xs p-2 text-primary-foreground outline-none focus:border-primary/50"
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="space-y-2">
                        {filteredLayers.map(layer => (
                            <div
                                key={layer.id}
                                className={cn(
                                    "flex items-center justify-between p-2 cursor-pointer border-l-2 text-xs",
                                    selectedLayers.includes(layer.id) ? "bg-primary/10 border-primary" : "bg-transparent border-transparent opacity-60"
                                )}
                                onClick={() => toggleLayer(layer.id)}
                            >
                                <span>{layer.label}</span>
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LayerManager;
