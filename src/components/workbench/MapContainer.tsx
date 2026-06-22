import React, { Suspense, useState } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { useGeojsonLayerStore } from '@/lib/stores/useGeojsonLayerStore';

// GTSM HUD Panel Components
import { ViewportHUD, Minimap, LayerManager, TargetInspector } from '../GTSM';
import { GeoJsonDropZone } from '../GTSM/geojson/GeoJsonDropZone';
import { GeoJsonImportModal } from '../GTSM/geojson/GeoJsonImportModal';
import { GeoJsonLayerPanel } from '../GTSM/geojson/GeoJsonLayerPanel';

import '../GTSM/geojson/geojson-layers.css';

const CesiumMapRenderer = React.lazy(() =>
    import('./CesiumMapRenderer').then((module) => ({ default: module.CesiumMapRenderer }))
);

const MapRendererFallback = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        Loading map renderer...
    </div>
);

export const CesiumCanvas: React.FC = () => {
    // Read state from Zustand store
    const selectedTarget = useGTSMStore(state => state.selectedTarget);
    const { addLayer } = useGeojsonLayerStore();

    // Import modal state
    const [pendingFile, setPendingFile] = useState<{ name: string; content: string } | null>(null);

    const handleFileDropped = (name: string, content: string) => {
        setPendingFile({ name, content });
    };

    const handleImportConfirm = async (name: string, description: string, color: string) => {
        if (!pendingFile) return;
        try {
            await addLayer(name, description, color, pendingFile.content);
            setPendingFile(null);
        } catch (e) {
            console.error('[GeoJSON Import] Failed to save layer:', e);
            alert('Failed to import layer: ' + e);
        }
    };

    return (
        <div className="w-full h-full relative overflow-hidden bg-black flex">
            {/* 2D navigation remains intentionally deferred; this surface owns the 3D globe only. */}
            <GeoJsonDropZone onFileDropped={handleFileDropped}>
                <Suspense fallback={<MapRendererFallback />}>
                    <CesiumMapRenderer />
                </Suspense>
            </GeoJsonDropZone>

            {/* Tactical eDEX Dashboards overlay grids */}
            <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between font-mono">
                {/* Top Row HUD */}
                <div className="flex justify-between items-start pointer-events-none w-full">
                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        <ViewportHUD />
                    </div>
                    
                    <div className="w-[240px] pointer-events-auto flex flex-col gap-2 shadow-lg shadow-black/45">
                        <GeoJsonLayerPanel />
                    </div>
                </div>

                {/* Bottom Row HUD */}
                <div className="flex justify-between items-end pointer-events-none w-full">
                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        <LayerManager />
                    </div>

                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        <Minimap />
                    </div>
                </div>
            </div>

            {/* Target Inspector on the far right */}
            {selectedTarget && (
                <div className="z-20 relative pointer-events-auto border-l border-zinc-800 bg-black/60 backdrop-blur-md shrink-0">
                    <TargetInspector />
                </div>
            )}

            {/* Import Dialog */}
            {pendingFile && (
                <GeoJsonImportModal
                    fileName={pendingFile.name}
                    fileContent={pendingFile.content}
                    onConfirm={handleImportConfirm}
                    onCancel={() => setPendingFile(null)}
                />
            )}
        </div>
    );
};

export default CesiumCanvas;
