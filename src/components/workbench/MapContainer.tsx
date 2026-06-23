import React, { Suspense, useState } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { useGeojsonLayerStore } from '@/lib/stores/useGeojsonLayerStore';

// GTSM HUD Panel Components
import { ViewportHUD, Minimap, TargetInspector } from '../GTSM';
import { SearchBar } from '../GTSM/search';
import { Timeline } from '../GTSM/timeline';
import { FavoritesPanel } from '../GTSM/favorites';
import { GeoJsonDropZone } from '../GTSM/geojson/GeoJsonDropZone';
import { GeoJsonImportModal } from '../GTSM/geojson/GeoJsonImportModal';
import { prepareMapImport } from '../GTSM/geojson/mapImport';
import { MapSettingsPanel } from '../GTSM/MapSettingsPanel';
import { MapPerformanceBadge } from '../GTSM/MapPerformanceBadge';
import { CameraCatalogPanel } from '../GTSM/CameraCatalogPanel';

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

    const handleImportFile = async (file: File) => {
        try {
            const prepared = await prepareMapImport(file);
            setPendingFile({ name: prepared.name, content: prepared.geojson });
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Unable to prepare the selected map file.');
        }
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
        <div className="w-full h-full relative overflow-hidden bg-background flex">
            {/* 2D navigation remains intentionally deferred; this surface owns the 3D globe only. */}
            <GeoJsonDropZone onFileDropped={(file) => { void handleImportFile(file); }}>
                <Suspense fallback={<MapRendererFallback />}>
                    <CesiumMapRenderer />
                </Suspense>
            </GeoJsonDropZone>

            <div className="absolute inset-0 z-10 pointer-events-none p-2 flex flex-col justify-between">
                {/* Top Row HUD */}
                <div className="flex justify-between items-start gap-3 pointer-events-none w-full">
                    <div className="w-[190px] pointer-events-auto">
                        <ViewportHUD />
                    </div>

                    {/* Top-center search bar */}
                    <div className="pointer-events-auto w-full max-w-[320px]">
                        <SearchBar />
                    </div>
                    
                    <div className="w-[190px] pointer-events-auto flex flex-col items-end gap-1.5">
                        <MapSettingsPanel onImportFile={handleImportFile} />
                        <CameraCatalogPanel />
                        <FavoritesPanel />
                    </div>
                </div>

                {/* Bottom Row HUD */}
                <div className="flex justify-between items-end gap-3 pointer-events-none w-full">
                    <div className="w-[190px] flex items-end">
                        <MapPerformanceBadge />
                    </div>

                    {/* Bottom-center timeline */}
                    <div className="flex-1 max-w-[520px] pointer-events-auto">
                        <Timeline />
                    </div>

                    <div className="w-[180px] pointer-events-auto">
                        <Minimap />
                    </div>
                </div>
            </div>

            {/* Target Inspector on the far right */}
            {selectedTarget && (
                <div className="z-20 relative pointer-events-auto border-l border-white/10 bg-background/90 backdrop-blur-md shrink-0">
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
