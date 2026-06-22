import React, { useEffect, useState } from 'react';
import { useGeojsonLayerStore } from '@/lib/stores/useGeojsonLayerStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export const GeoJsonLayerPanel: React.FC = () => {
  const {
    layers,
    loadLayers,
    deleteLayer,
    toggleLayerVisibility,
    updateLayerColor,
    isLoading
  } = useGeojsonLayerStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadLayers();
  }, []);

  const handleExport = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const blob = new Blob([layer.geojson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layer.name}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-1.5 p-3 border border-zinc-800 bg-black/60 backdrop-blur-md font-mono text-xs w-full max-h-[220px] overflow-y-auto">
      <div className="flex items-center justify-between text-cyan-400 border-b border-zinc-800/50 pb-1 mb-1">
        <div className="flex items-center gap-1.5">
          <WorkbenchIcon name="solar:database-bold-duotone" size={12} />
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase">SAVED_GEOJSON_LAYERS</span>
        </div>
        {isLoading && <span className="text-[8px] animate-pulse">SYNCING...</span>}
      </div>

      {layers.length === 0 ? (
        <div className="text-center py-4 text-zinc-600 text-[9px] uppercase tracking-wider">
          No imported layers. Drop a .geojson file to import.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {layers.map((layer) => {
            const isVisible = layer.visible === 1;
            const isExpanded = expandedId === layer.id;

            return (
              <div 
                key={layer.id} 
                className="border border-zinc-900 bg-zinc-950/40 p-1.5 rounded flex flex-col gap-1 hover:border-zinc-800/80 transition-colors"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2">
                  <div 
                    className="flex items-center gap-2 cursor-pointer truncate flex-1"
                    onClick={() => setExpandedId(isExpanded ? null : layer.id)}
                  >
                    <div 
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/40" 
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="font-bold text-[9px] tracking-wide text-zinc-300 truncate uppercase">{layer.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleLayerVisibility(layer.id, !isVisible)}
                      className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                      <WorkbenchIcon 
                        name={isVisible ? 'solar:eye-bold' : 'solar:eye-closed-bold'} 
                        size={12} 
                        style={{ color: isVisible ? layer.color : undefined }}
                      />
                    </button>
                    <button
                      onClick={() => handleExport(layer.id)}
                      className="text-zinc-500 hover:text-cyan-400 transition-colors cursor-pointer"
                      title="Export Layer"
                    >
                      <WorkbenchIcon name="solar:download-bold" size={12} />
                    </button>
                    <button
                      onClick={() => deleteLayer(layer.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete Layer"
                    >
                      <WorkbenchIcon name="solar:trash-bin-trash-bold" size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded Details / Controls */}
                {isExpanded && (
                  <div className="border-t border-zinc-900 mt-1 pt-1.5 flex flex-col gap-1 text-[9px] text-zinc-500">
                    {layer.description && (
                      <p className="text-zinc-400 leading-relaxed break-all">{layer.description}</p>
                    )}
                    <div className="flex justify-between items-center mt-1">
                      <span>FEATURES: <b className="text-zinc-300">{layer.featureCount}</b></span>
                      <div className="flex items-center gap-1">
                        <span>COLOR:</span>
                        <input
                          type="color"
                          value={layer.color}
                          onChange={(e) => updateLayerColor(layer.id, e.target.value)}
                          className="w-4 h-4 bg-transparent border-0 cursor-pointer p-0 shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
