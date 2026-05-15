import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { invoke } from '@tauri-apps/api/core';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';

interface MapPreviewProps {
    data: {
        lat: number;
        lon: number;
        altitude?: number;
        label?: string;
    };
    onClose: () => void;
}

type AnimationStage = 'REVEAL' | 'ZOOM_1' | 'ZOOM_2' | 'FINAL_DIVE' | 'LOCKED';

export function MapPreview({ data, onClose }: MapPreviewProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const revealTimerRef = useRef<number | null>(null);
    const [apiKeyLoadFailed, setApiKeyLoadFailed] = useState(false);
    const [stage, setStage] = useState<AnimationStage>('REVEAL');
    const [isInteracted, setIsInteracted] = useState(false);
    const isInteractedRef = useRef(false);

    useEffect(() => {
        if (!mapContainer.current) return;
        let isMounted = true;

        invoke<string | null>('get_setting', { key: 'maptiler_api_key' })
            .then((maptilerKey) => {
                if (!isMounted) return;
                if (!maptilerKey) {
                    setApiKeyLoadFailed(true);
                    return;
                }

                const finalZoom = data.altitude ? Math.max(10, 20 - Math.log2(data.altitude / 100)) : 17;
                map.current = new maplibregl.Map({
                    container: mapContainer.current!,
                    style: `https://api.maptiler.com/maps/satellite/style.json?key=${maptilerKey}`,
                    center: [data.lon, data.lat],
                    zoom: 1,
                    pitch: 0,
                    bearing: 0,
                    attributionControl: false,
                    interactive: true,
                });

                const handleIntervention = () => {
                    if (!isInteractedRef.current) {
                        isInteractedRef.current = true;
                        setIsInteracted(true);
                    }
                };

                map.current.on('mousedown', handleIntervention);
                map.current.on('wheel', handleIntervention);
                map.current.on('touchstart', handleIntervention);
                map.current.on('error', () => isMounted && setApiKeyLoadFailed(true));

                map.current.on('load', () => {
                    if (!isMounted || !map.current) return;
                    revealTimerRef.current = window.setTimeout(() => {
                        if (!isMounted || !map.current || isInteractedRef.current) return;
                        setStage('ZOOM_1');
                        map.current.flyTo({ zoom: 5, pitch: 20, bearing: 15, duration: 2500, essential: true });
                        map.current.once('moveend', () => {
                            if (!isMounted || !map.current || isInteractedRef.current) return;
                            setStage('ZOOM_2');
                            map.current.flyTo({ zoom: 10, pitch: 45, bearing: -20, duration: 2500, essential: true });
                            map.current.once('moveend', () => {
                                if (!isMounted || !map.current || isInteractedRef.current) return;
                                setStage('FINAL_DIVE');
                                map.current.flyTo({ zoom: finalZoom, pitch: 65, bearing: 45, duration: 3500, essential: true });
                                map.current.once('moveend', () => {
                                    if (isMounted && !isInteractedRef.current) setStage('LOCKED');
                                });
                            });
                        });
                    }, 1200);
                });
            })
            .catch((err) => {
                console.error('Failed to init MapTiler for preview', err);
                if (isMounted) setApiKeyLoadFailed(true);
            });

        return () => {
            isMounted = false;
            if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
            map.current?.remove();
            map.current = null;
        };
    }, [data.lat, data.lon, data.altitude]);

    return (
        <div className="absolute left-[15vw] top-[15%] z-50 flex h-[65vh] w-[70vw] items-center justify-center overflow-hidden">
            <div className="relative h-full w-full overflow-hidden border border-cyan-500/10 bg-black shadow-[0_0_80px_rgba(0,255,255,0.1)]">
                <div className="absolute inset-0 h-full w-full overflow-hidden opacity-90">
                    {apiKeyLoadFailed && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-4 text-center font-mono text-[10px] text-rose-500">
                            MAP LOADING FAILED<br />(CHECK API KEY)
                        </div>
                    )}
                    <div ref={mapContainer} className="h-full w-full" />
                </div>

                {!isInteracted && (
                    <div
                        className="pointer-events-none absolute inset-0 z-10 opacity-10"
                        style={{ backgroundImage: 'linear-gradient(cyan 1px, transparent 1px), linear-gradient(90deg, cyan 1px, transparent 1px)', backgroundSize: '50px 50px' }}
                    />
                )}

                <div className="absolute left-6 top-4 z-30 font-mono text-xs font-bold tracking-[0.3em] text-cyan-400">
                    <span className="mr-2 animate-pulse">●</span>
                    {isInteracted ? 'MANUAL CONTROL' : stage === 'REVEAL' ? 'LOADING MAP...' : stage === 'ZOOM_1' ? 'ACQUIRING AREA...' : stage === 'ZOOM_2' ? 'ZOOMING IN...' : stage === 'FINAL_DIVE' ? 'FINAL APPROACH...' : 'TARGET LOCKED'}
                </div>

                <div className="absolute bottom-6 left-6 z-30 flex flex-col gap-1">
                    {data.label && <div className="border border-cyan-500/30 bg-cyan-900/40 px-3 py-1 font-mono text-[10px] tracking-widest text-cyan-300">{data.label}</div>}
                    {!isInteracted && (stage === 'LOCKED' || stage === 'FINAL_DIVE') && (
                        <div className="border border-rose-500/30 bg-rose-900/40 px-3 py-1 font-mono text-[10px] tracking-widest text-rose-400">
                            LAT: {data.lat.toFixed(6)} // LON: {data.lon.toFixed(6)}
                        </div>
                    )}
                </div>

                {!isInteracted && (
                    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                        <div className="relative flex h-[300px] w-[300px] items-center justify-center">
                            {stage !== 'REVEAL' && (
                                <svg className="absolute h-full w-full opacity-40" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="48" fill="none" stroke="cyan" strokeWidth="0.5" strokeDasharray="5 15" />
                                    <circle cx="50" cy="50" r="40" fill="none" stroke="red" strokeWidth="0.5" strokeDasharray="30 10" opacity={stage === 'LOCKED' ? 0.3 : 0} />
                                </svg>
                            )}
                            {(stage === 'FINAL_DIVE' || stage === 'LOCKED') && (
                                <svg className="absolute h-16 w-16 opacity-80" viewBox="0 0 100 100">
                                    <line x1="50" y1="0" x2="50" y2="35" stroke={stage === 'LOCKED' ? '#ef4444' : 'cyan'} strokeWidth="1.5" />
                                    <line x1="50" y1="65" x2="50" y2="100" stroke={stage === 'LOCKED' ? '#ef4444' : 'cyan'} strokeWidth="1.5" />
                                    <line x1="0" y1="50" x2="35" y2="50" stroke={stage === 'LOCKED' ? '#ef4444' : 'cyan'} strokeWidth="1.5" />
                                    <line x1="65" y1="50" x2="100" y2="50" stroke={stage === 'LOCKED' ? '#ef4444' : 'cyan'} strokeWidth="1.5" />
                                    <circle cx="50" cy="50" r="25" fill="none" stroke={stage === 'LOCKED' ? '#ef4444' : 'cyan'} strokeWidth="1" strokeDasharray="4 2" />
                                </svg>
                            )}
                            {stage === 'LOCKED' && <div className="h-12 w-12 animate-ping rounded-full border-2 border-rose-500" />}
                        </div>
                    </div>
                )}

                <WorkbenchButton onClick={onClose} variant="ghost" className="absolute right-6 top-4 z-50 font-mono text-[10px] italic text-cyan-500/60 hover:text-cyan-300">
                    [X] CLOSE
                </WorkbenchButton>
            </div>
        </div>
    );
}
