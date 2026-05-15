import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from "@/components/ui/WorkbenchButton";
import { cn } from '@/lib/utils/style';
import { useUIStore } from '@/lib/stores/useUIStore';
import { getPlanetPositions, getOrbitPath } from '@/lib/celestial_sim';
import "cesium/Build/Cesium/Widgets/widgets.css";
import '@/styles/operational-map.css';

export const OperationalMap: React.FC = () => {
    const operationalParams = useUIStore((s) => s.operationalParams);
    const solarMode = useUIStore((s) => s.solarMode);
    const setSolarMode = useUIStore((s) => s.setSolarMode);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const celestialEntitiesRef = useRef<Cesium.Entity[]>([]);
    const [liveCoords, setLiveCoords] = useState({ lat: 0, lon: 0 });
    const [isMoving, setIsMoving] = useState(false);


    useEffect(() => {
        if (operationalParams) {
            setLiveCoords({ lat: operationalParams.lat, lon: operationalParams.lon });
        }
    }, [operationalParams]);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateCoords = () => {
            const viewer = viewerRef.current;
            if (!viewer || viewer.isDestroyed()) return;

            const windowPosition = new Cesium.Cartesian2(
                viewer.container.clientWidth / 2,
                viewer.container.clientHeight / 2
            );

            const ray = viewer.camera.getPickRay(windowPosition);
            if (ray) {
                const centerCartesian = viewer.scene.globe.pick(ray, viewer.scene);
                if (centerCartesian) {
                    const cartographic = Cesium.Cartographic.fromCartesian(centerCartesian);
                    setLiveCoords({
                        lat: Cesium.Math.toDegrees(cartographic.latitude),
                        lon: Cesium.Math.toDegrees(cartographic.longitude)
                    });
                }
            }
        };

        const handleMoveStart = () => setIsMoving(true);
        const handleMoveEnd = () => {
            setIsMoving(false);
            updateCoords();
        };

        const initViewer = async () => {
            if (containerRef.current && !viewerRef.current) {
                const viewer = new Cesium.Viewer(containerRef.current, {
                    animation: false,
                    baseLayerPicker: false,
                    fullscreenButton: false,
                    geocoder: false,
                    homeButton: false,
                    infoBox: false,
                    sceneModePicker: false,
                    selectionIndicator: false,
                    timeline: false,
                    navigationHelpButton: false,
                    sceneMode: Cesium.SceneMode.SCENE3D,
                    baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({
                        url: "https://a.basemaps.cartocdn.com/dark_all/"
                    }))
                });

                viewer.scene.backgroundColor = Cesium.Color.BLACK;
                viewer.scene.globe.baseColor = Cesium.Color.BLACK;
                
                viewer.camera.changed.addEventListener(updateCoords);
                viewer.camera.moveStart.addEventListener(handleMoveStart);
                viewer.camera.moveEnd.addEventListener(handleMoveEnd);

                viewerRef.current = viewer;
                viewer.resize();
            }
        };

        initViewer();

        return () => {
            if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                const viewer = viewerRef.current;
                viewer.camera.changed.removeEventListener(updateCoords);
                viewer.camera.moveStart.removeEventListener(handleMoveStart);
                viewer.camera.moveEnd.removeEventListener(handleMoveEnd);
                viewer.destroy();
            }
            viewerRef.current = null;
        };
    }, []);

    // Terrestrial fly-to
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed() || !operationalParams || solarMode) return;

        const { lat, lon, zoom } = operationalParams;
        viewer.entities.removeAll();
        viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            point: {
                pixelSize: 10,
                color: Cesium.Color.CYAN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
            }
        });

        const height = 5000 * Math.pow(2, 18 - (zoom || 12));
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
            duration: 1.5,
        });
    }, [operationalParams, solarMode]);

    // Solar Mode
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;

        celestialEntitiesRef.current.forEach(e => viewer.entities.remove(e));
        celestialEntitiesRef.current = [];

        if (solarMode) {
            const planets = getPlanetPositions();
            const earthPos = planets.find(p => p.name === 'Earth')!;
            const SCALE = 1000000;

            // Sun
            const sunEntity = viewer.entities.add({
                name: 'SUN',
                position: new Cesium.Cartesian3(-earthPos.x * SCALE, -earthPos.y * SCALE, -earthPos.z * SCALE),
                point: { pixelSize: 24, color: Cesium.Color.YELLOW },
                label: { text: 'SOL_CENTER', font: '10px monospace', fillColor: Cesium.Color.YELLOW, pixelOffset: new Cesium.Cartesian2(0, -20) }
            });
            celestialEntitiesRef.current.push(sunEntity);

            planets.forEach(p => {
                if (p.name === 'Earth') return;
                const relPos = new Cesium.Cartesian3((p.x - earthPos.x) * SCALE, (p.y - earthPos.y) * SCALE, (p.z - earthPos.z) * SCALE);
                
                const planetEntity = viewer.entities.add({
                    name: p.name.toUpperCase(),
                    position: relPos,
                    point: { pixelSize: 10, color: Cesium.Color.fromCssColorString(p.color) },
                    label: { text: p.name.toUpperCase(), font: '8px monospace', fillColor: Cesium.Color.fromCssColorString(p.color), pixelOffset: new Cesium.Cartesian2(0, -12) }
                });
                celestialEntitiesRef.current.push(planetEntity);

                const orbitPoints = getOrbitPath(p.name).map(pt => new Cesium.Cartesian3((pt[0] - earthPos.x) * SCALE, (pt[1] - earthPos.y) * SCALE, (pt[2] - earthPos.z) * SCALE));
                const orbitEntity = viewer.entities.add({
                    polyline: { positions: orbitPoints, width: 1, material: Cesium.Color.fromCssColorString(p.color).withAlpha(0.2) }
                });
                celestialEntitiesRef.current.push(orbitEntity);
            });

            viewer.camera.flyTo({ destination: new Cesium.Cartesian3(0, 0, 5e9), duration: 2.0 });
        }
    }, [solarMode]);

    useEffect(() => {
        if (!containerRef.current || !viewerRef.current) return;
        const resizeObserver = new ResizeObserver(() => {
            if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.resize();
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    return (
        <div className="tactical-map-sidebar h-full flex flex-col relative overflow-hidden bg-black">
            <div className="tactical-map-container flex-1 relative overflow-hidden">
                <div ref={containerRef} className="absolute inset-0" />
                
                <div className="tactical-hud-overlay absolute inset-0 z-10 pointer-events-none p-6">
                    {/* Crosshair Overlay */}
                    {!solarMode && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className={cn("w-48 h-48 border border-primary/20 rounded-full flex items-center justify-center transition-all duration-700", isMoving ? "opacity-20 scale-95" : "opacity-60 scale-100")}>
                                <div className="w-1 h-8 bg-primary/40 absolute" />
                                <div className="w-8 h-1 bg-primary/40 absolute" />
                            </div>
                        </div>
                    )}

                    {/* Telemetry HUD */}
                    <div className="absolute top-6 right-6 text-right font-mono text-[10px] text-primary/80 space-y-1 bg-black/40 p-3 border-r-2 border-primary/50 backdrop-blur-sm">
                        <div className="opacity-40 tracking-widest text-[8px] mb-2">TELEMETRY_STREAM</div>
                        <div className="flex gap-2 justify-end">
                            <span className="opacity-30">LAT:</span>
                            <span className="tabular-nums font-bold">{liveCoords.lat.toFixed(6)}</span>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <span className="opacity-30">LON:</span>
                            <span className="tabular-nums font-bold">{liveCoords.lon.toFixed(6)}</span>
                        </div>
                    </div>

                    {/* Status HUD */}
                    <div className="absolute top-6 left-6 font-mono text-[10px] space-y-3 pointer-events-auto">
                        <div className="bg-black/40 p-3 border-l-2 border-primary/50 backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <div className={cn("w-2 h-2 rounded-full", isMoving ? "bg-amber-500 animate-pulse" : "bg-primary shadow-[0_0_8px_#00ffff]")} />
                                <span className="font-bold tracking-widest">{isMoving ? "LINK_ACQUIRING..." : "SAT_LINK_LOCKED"}</span>
                            </div>
                            <div className="text-[9px] opacity-60 uppercase">{solarMode ? "Deep Space Monitor" : (operationalParams?.label || "Scanning Surface")}</div>
                        </div>

                        <WorkbenchButton
                            onClick={() => setSolarMode(!solarMode)}
                            variant={solarMode ? "primary" : "outline"}
                            size="xs"
                            className="w-full flex items-center justify-center gap-2 font-bold tracking-widest"
                        >
                            <WorkbenchIcon name={solarMode ? "lucide:earth" : "lucide:orbit"} size={12} />
                            {solarMode ? "EXIT_SOLAR" : "SOLAR_MODE"}
                        </WorkbenchButton>
                    </div>

                    {/* Footer HUD */}
                    <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between font-mono">
                        <div className="bg-black/40 p-3 border-b-2 border-primary/50 backdrop-blur-sm">
                            <div className="text-[8px] opacity-40 mb-1">SYSTEM_FOCUS</div>
                            <div className="text-xs font-bold tracking-[0.2em]">{solarMode ? "SOLAR_SYSTEM" : (operationalParams?.label || "IDLE").toUpperCase()}</div>
                        </div>
                        
                        <div className="flex gap-2 bg-black/40 p-2 border border-white/5 rounded-lg backdrop-blur-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                        </div>
                    </div>
                </div>

                <div className="tactical-grid-overlay absolute inset-0 opacity-10 pointer-events-none" />
            </div>
        </div>
    );
};
