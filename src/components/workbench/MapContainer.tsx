import React from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { CesiumMapRenderer } from './CesiumMapRenderer';
import { MapLibreMapRenderer } from './MapLibreMapRenderer';

// GTSM HUD Panel Components
import { ViewportHUD, Minimap, NavigationPanel, LayerManager, TargetInspector } from '../GTSM';

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
            {viewMode !== 'navigation' ? (
                <CesiumMapRenderer />
            ) : (
                <MapLibreMapRenderer />
            )}

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
