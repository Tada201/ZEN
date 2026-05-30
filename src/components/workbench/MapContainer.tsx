import React, { Suspense } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';

// GTSM HUD Panel Components
import { ViewportHUD, Minimap, NavigationPanel, LayerManager, TargetInspector } from '../GTSM';

const CesiumMapRenderer = React.lazy(() =>
    import('./CesiumMapRenderer').then((module) => ({ default: module.CesiumMapRenderer }))
);

const MapLibreMapRenderer = React.lazy(() =>
    import('./MapLibreMapRenderer').then((module) => ({ default: module.MapLibreMapRenderer }))
);

const MapRendererFallback = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        Loading map renderer...
    </div>
);

export const CesiumCanvas: React.FC = () => {
    // Read state from Zustand store
    const viewMode = useGTSMStore(state => state.viewMode);
    const selectedTarget = useGTSMStore(state => state.selectedTarget);

    return (
        <div className="w-full h-full relative overflow-hidden bg-black flex">
            {/* 
              Conditional Map Mounting:
              - When viewMode is 'globe' (3D), we mount Cesium and unmount MapLibre.
              - When viewMode is 'navigation' (2D), we mount MapLibre and completely unmount Cesium.
              - Unmounting cleanly triggers standard cleanup hooks (viewer.destroy() / map.remove())
                which completely unloads the GPU context and releases RAM/VRAM!
            */}
            <Suspense fallback={<MapRendererFallback />}>
                {viewMode !== 'navigation' ? (
                    <CesiumMapRenderer />
                ) : (
                    <MapLibreMapRenderer />
                )}
            </Suspense>

            {/* Tactical eDEX Dashboards overlay grids */}
            <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between font-mono">
                {/* Top Row HUD */}
                <div className="flex justify-between items-start pointer-events-none w-full">
                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        {viewMode !== 'navigation' && <ViewportHUD />}
                    </div>
                    
                    <div className="w-[280px]" />

                    {/* Compact Navigation Panel renders on the right in 2D mode */}
                    <div className="w-[240px] pointer-events-auto">
                        {viewMode === 'navigation' && (
                            <div className="shadow-lg shadow-black/45">
                                <NavigationPanel />
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Row HUD */}
                <div className="flex justify-between items-end pointer-events-none w-full">
                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        {viewMode !== 'navigation' && <LayerManager />}
                    </div>

                    <div className="w-[240px] pointer-events-auto shadow-lg shadow-black/45">
                        {viewMode !== 'navigation' && <Minimap />}
                    </div>
                </div>
            </div>

            {/* Target Inspector on the far right */}
            {selectedTarget && (
                <div className="z-20 relative pointer-events-auto border-l border-zinc-800 bg-black/60 backdrop-blur-md shrink-0">
                    <TargetInspector />
                </div>
            )}
        </div>
    );
};

export default CesiumCanvas;
