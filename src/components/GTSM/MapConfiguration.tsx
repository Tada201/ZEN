import React from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Map } from 'lucide-react';

export const MapConfiguration: React.FC = () => {
    const viewportCenter = useGTSMStore(state => state.viewportCenter);
    const imageryProvider = useGTSMStore(state => state.imageryProvider);
    const setImageryProvider = useGTSMStore(state => state.setImageryProvider);
    const googleMapsApiKey = useGTSMStore(state => state.googleMapsApiKey);
    const setGoogleMapsApiKey = useGTSMStore(state => state.setGoogleMapsApiKey);
    
    const selectedLayers = useGTSMStore(state => state.selectedLayers);
    const toggleLayer = useGTSMStore(state => state.toggleLayer);

    const resolutionScale = useGTSMStore(state => state.resolutionScale);
    const setResolutionScale = useGTSMStore(state => state.setResolutionScale);
    const antiAliasing = useGTSMStore(state => state.antiAliasing);
    const setAntiAliasing = useGTSMStore(state => state.setAntiAliasing);
    const tileDetail = useGTSMStore(state => state.tileDetail);
    const setTileDetail = useGTSMStore(state => state.setTileDetail);
    const shadows = useGTSMStore(state => state.shadows);
    const setShadows = useGTSMStore(state => state.setShadows);
    const globeLighting = useGTSMStore(state => state.globeLighting);
    const setGlobeLighting = useGTSMStore(state => state.setGlobeLighting);
    const showFps = useGTSMStore(state => state.showFps);
    const setShowFps = useGTSMStore(state => state.setShowFps);
    const resetGraphicsToDefault = useGTSMStore(state => state.resetGraphicsToDefault);

    const [defaultLat, setDefaultLat] = React.useState('40.7128');
    const [defaultLon, setDefaultLon] = React.useState('-74.0060');
    const [defaultZoom, setDefaultZoom] = React.useState('6');

    const handleApplyViewport = () => {
        setDefaultLat(viewportCenter.lat.toFixed(4));
        setDefaultLon(viewportCenter.lon.toFixed(4));
        setDefaultZoom((18 - Math.round(Math.log2(viewportCenter.alt / 5000))).toString());
    };

    return (
        <div className="space-y-8 select-none">
            {/* Header */}
            <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Map className="h-5 w-5 text-primary" />
                    Map Config
                </h3>
                <p className="text-[13px] text-muted-foreground">
                    Configure GTSM base providers, initial viewport coordinates, dynamic stream overlays, and WebGL diagnostic modes.
                </p>
            </div>

            {/* Base Layer Providers Section */}
            <SettingsSection 
                title="Imagery & Base Layer Providers" 
                description="Choose the active GIS layer provider or digital grid void for the operations deck."
            >
                <div className="grid grid-cols-4 gap-3 px-1 py-2">
                    {[
                        { id: 'dark', label: 'Dark Tiles', desc: 'OSM basemaps', icon: 'solar:moon-bold' },
                        { id: 'satellite', label: 'Satellite', desc: 'ArcGIS imagery', icon: 'solar:map-bold' },
                        { id: 'google-3d', label: 'Google 3D', desc: 'Photorealistic Tiles', icon: 'solar:city-bold' },
                        { id: 'off', label: 'Void Earth', desc: 'Empty globe grid', icon: 'solar:globus-bold' }
                    ].map((provider) => (
                        <button
                            key={provider.id}
                            type="button"
                            className={`flex flex-col items-center justify-center p-3.5 rounded-lg border text-center transition-all cursor-pointer ${
                                imageryProvider === provider.id 
                                    ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_rgba(var(--color-primary),0.1)]' 
                                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() => setImageryProvider(provider.id as any)}
                        >
                            <WorkbenchIcon 
                                name={provider.icon} 
                                size={20} 
                                className={imageryProvider === provider.id ? 'text-primary' : 'text-zinc-500'} 
                            />
                            <span className="text-[10px] font-bold uppercase tracking-wider mt-2.5">{provider.label}</span>
                            <span className="text-[8px] text-zinc-500 mt-1">{provider.desc}</span>
                        </button>
                    ))}
                </div>

                {imageryProvider === 'google-3d' && (
                    <div className="mt-4 px-1 space-y-2">
                        <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Google Maps API Key</label>
                        <input
                            type="password"
                            placeholder="AIzaSy..."
                            className="w-full h-8 px-2.5 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-xs"
                            value={googleMapsApiKey}
                            onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                        />
                        <p className="text-[8px] text-zinc-500 leading-normal">
                            Access up to 10K calls per month at no cost with Google Maps Platform APIs. Get started free at console.cloud.google.com.
                        </p>
                    </div>
                )}
            </SettingsSection>

            {/* Coordinates Anchors Section */}
            <SettingsSection 
                title="Default Viewport Coordinate Anchors" 
                description="Set the initial positioning viewpoint and Level of Detail (LOD) zoom anchor for spatial tracking."
            >
                <div className="grid grid-cols-3 gap-4 px-1 py-2">
                    <div className="space-y-1.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Latitude (N/S)</span>
                        <input
                            type="text"
                            className="w-full h-8 px-2.5 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-xs"
                            value={defaultLat}
                            onChange={(e) => setDefaultLat(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Longitude (E/W)</span>
                        <input
                            type="text"
                            className="w-full h-8 px-2.5 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-xs"
                            value={defaultLon}
                            onChange={(e) => setDefaultLon(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Zoom (LOD)</span>
                        <input
                            type="text"
                            className="w-full h-8 px-2.5 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-xs"
                            value={defaultZoom}
                            onChange={(e) => setDefaultZoom(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end px-1 pt-1.5">
                    <button
                        type="button"
                        className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.08] hover:border-white/20 px-3.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                        onClick={handleApplyViewport}
                    >
                        <WorkbenchIcon name="solar:gps-bold" size={10} />
                        Capture Viewport
                    </button>
                </div>
            </SettingsSection>

            {/* GTSM Overlays Section */}
            <SettingsSection 
                title="GTSM Stream Overlays & Filters" 
                description="Toggle dynamic tracking vector grids, orbital channels, and environmental telemetry overlays."
            >
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 py-2">
                    {[
                        { id: 'satellites', label: 'Orbital Satellites', desc: 'Real-time telemetry' },
                        { id: 'flights', label: 'Commercial Flights', desc: 'ADS-B global tracks' },
                        { id: 'military', label: 'Tactical Recon Flights', desc: 'Mil ADS-B signals' },
                        { id: 'vessels', label: 'Maritime Vessels', desc: 'AIS position loops' },
                        { id: 'earthquakes', label: 'Earthquakes', desc: 'USGS fault markers' },
                        { id: 'naturalEvents', label: 'Disaster Feeds', desc: 'EONET active overlays' },
                        { id: 'cables', label: 'Undersea Cables', desc: 'Submarine fiber paths' },
                        { id: 'nuclear', label: 'Nuclear Facilities', desc: 'Active power stations' }
                    ].map((layer) => {
                        const active = selectedLayers.includes(layer.id);
                        return (
                            <button
                                key={layer.id}
                                type="button"
                                onClick={() => toggleLayer(layer.id)}
                                className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] text-left transition-all w-full cursor-pointer group"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                    active 
                                        ? 'border-primary bg-primary/10 text-primary shadow-[0_0_6px_rgba(var(--color-primary),0.1)]' 
                                        : 'border-white/10 bg-black/40 text-transparent group-hover:border-white/20'
                                }`}>
                                    {active && <span className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_4px_var(--color-primary)]" />}
                                </div>
                                <div className="truncate">
                                    <div className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${active ? 'text-primary' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                                        {layer.label}
                                    </div>
                                    <div className="text-[8px] text-zinc-500 mt-0.5">{layer.desc}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </SettingsSection>

            {/* Premium WebGL Graphics Engine Settings */}
            <SettingsSection 
                title="WebGL Render Engine Configuration" 
                description="Optimize GPU compute loads, polygon density, and screen anti-aliasing dynamically."
            >
                <div className="space-y-4 px-1 py-2 font-mono text-xs">
                    {/* Resolution & Anti-Aliasing Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Resolution Scale</label>
                            <select
                                className="w-full h-8 px-2 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/45 transition-all text-xs font-mono cursor-pointer"
                                value={resolutionScale}
                                onChange={(e) => setResolutionScale(parseFloat(e.target.value))}
                            >
                                <option value="0.5">0.5x (ECO MODE)</option>
                                <option value="0.75">0.75x (PERFORMANCE)</option>
                                <option value="0.85">0.85x (BALANCED)</option>
                                <option value="1.0">1.0x (NATIVE QUALITY)</option>
                                <option value="2.0">2.0x (ULTRA RETINA)</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider block">Anti-Aliasing</label>
                            <select
                                className="w-full h-8 px-2 bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/45 transition-all text-xs font-mono cursor-pointer"
                                value={antiAliasing}
                                onChange={(e) => setAntiAliasing(e.target.value as any)}
                            >
                                <option value="none">NONE (FASTEST)</option>
                                <option value="fxaa">FXAA (FAST GRAPHICS)</option>
                                <option value="msaa">MSAA (HIGH SMOOTHNESS)</option>
                            </select>
                        </div>
                    </div>

                    {/* Tile Detail Slider */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                            <span>Globe Tile Geometry Detail</span>
                            <span className="text-primary font-mono">{tileDetail === 1.0 ? 'ULTRA' : tileDetail <= 3.0 ? 'BALANCED' : 'LOW LOAD'} ({tileDetail.toFixed(1)} SSE)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="1.0"
                                max="8.0"
                                step="0.5"
                                className="flex-1 accent-primary h-1 bg-white/10 rounded-lg cursor-pointer"
                                value={tileDetail}
                                onChange={(e) => setTileDetail(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Checkbox Grid */}
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3 pt-2">
                        <div className="flex items-center justify-between bg-white/[0.01] border border-white/[0.03] p-2 rounded-lg">
                            <span className="text-[9px] text-zinc-400 uppercase font-bold">Globe Lighting</span>
                            <button
                                type="button"
                                onClick={() => setGlobeLighting(!globeLighting)}
                                className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${globeLighting ? 'bg-primary/20 border border-primary/50' : 'bg-black/60 border border-white/10'}`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full absolute top-[1px] transition-all ${globeLighting ? 'right-[2px] bg-primary shadow-[0_0_6px_var(--color-primary)]' : 'left-[2px] bg-zinc-500'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between bg-white/[0.01] border border-white/[0.03] p-2 rounded-lg">
                            <span className="text-[9px] text-zinc-400 uppercase font-bold">Shadows</span>
                            <button
                                type="button"
                                onClick={() => setShadows(!shadows)}
                                className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${shadows ? 'bg-primary/20 border border-primary/50' : 'bg-black/60 border border-white/10'}`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full absolute top-[1px] transition-all ${shadows ? 'right-[2px] bg-primary shadow-[0_0_6px_var(--color-primary)]' : 'left-[2px] bg-zinc-500'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between bg-white/[0.01] border border-white/[0.03] p-2 rounded-lg">
                            <span className="text-[9px] text-zinc-400 uppercase font-bold">Show FPS</span>
                            <button
                                type="button"
                                onClick={() => setShowFps(!showFps)}
                                className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${showFps ? 'bg-primary/20 border border-primary/50' : 'bg-black/60 border border-white/10'}`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full absolute top-[1px] transition-all ${showFps ? 'right-[2px] bg-primary shadow-[0_0_6px_var(--color-primary)]' : 'left-[2px] bg-zinc-500'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Reset Button */}
                    <div className="flex justify-end pt-3 border-t border-white/[0.04]">
                        <button
                            type="button"
                            onClick={resetGraphicsToDefault}
                            className="bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] hover:border-white/20 px-3 py-1.5 text-[9px] font-bold text-muted-foreground hover:text-foreground rounded-lg uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <WorkbenchIcon name="solar:refresh-bold" size={10} />
                            Reset to Defaults
                        </button>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
};

export default MapConfiguration;
