import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { gtsmApi } from '@/api/gtsmApi';
import type { MapCameraCatalogEntry } from '@/api/gtsmApi';

// ─── Types ──────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
    id: number;
    entity_type: string;
    entity_id: string;
    timestamp: number;
    lat: number;
    lon: number;
    alt: number | null;
    velocity: number | null;
    heading: number | null;
    raw_data: string | null;
    metadata?: string | null;
}

export interface SpatialEntity {
    id: string;
    type: "satellite" | "flight" | "earthquake" | "military" | "weather" | "vessel" | "natural_event";
    position: { lat: number; lon: number; alt: number };
    velocity?: number;
    metadata: Record<string, any>;
    _timestamp?: number;
}

export interface ViewportCenter {
    lat: number;
    lon: number;
    alt: number;
}

export interface FlyToRequest {
    lat: number;
    lon: number;
    alt: number;
}

export interface FavoriteItem {
    id: string;
    label: string;
    layerId: string;
    layerLabel: string;
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;
}

// Entity limits per layer to prevent unbounded growth
const ENTITY_LIMITS = {
    satellites: 9000,
    flights: 500,
    military: 200,
    vessels: 300,
    earthquakes: 100,
    naturalEvents: 50,
    weatherGrid: 50
};

// Maximum age for entities (in milliseconds)
const ENTITY_MAX_AGE = {
    satellites: 24 * 60 * 60 * 1000,
    flights: 6 * 60 * 60 * 1000,
    military: 6 * 60 * 60 * 1000,
    vessels: 12 * 60 * 60 * 1000,
    earthquakes: 48 * 60 * 60 * 1000,
    naturalEvents: 7 * 24 * 60 * 60 * 1000,
    weatherGrid: 60 * 60 * 1000
};

const pruneEntities = (
    entities: SpatialEntity[],
    layerName: keyof typeof ENTITY_LIMITS,
    maxAge: number
): SpatialEntity[] => {
    const now = Date.now();
    let pruned = entities.filter(e => {
        const timestamp = e._timestamp || now;
        return now - timestamp < maxAge;
    });
    const limit = ENTITY_LIMITS[layerName] || 500;
    if (pruned.length > limit) {
        pruned = pruned
            .sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0))
            .slice(0, limit);
    }
    return pruned;
};

export interface GTSMState {
    // Entities Map (Workspace style)
    entities: Record<string, SpatialEntity>;
    selectedTarget: SpatialEntity | null;
    targetLocked: boolean;
    viewportCenter: ViewportCenter;
    flyToRequest: FlyToRequest | null;

    // View settings
    selectedLayers: string[];
    imageryProvider: 'dark' | 'satellite' | 'google-3d' | 'off';
    googleMapsApiKey: string;
    mapMode: '2D' | '3D';
    viewMode: 'globe' | 'navigation' | 'radar';

    // Premium WebGL Graphics settings
    resolutionScale: number;
    antiAliasing: 'none' | 'fxaa' | 'msaa';
    tileDetail: number;
    shadows: boolean;
    globeLighting: boolean;
    showFps: boolean;

    // UI state
    activeLayer: string | null;
    collapsedPanels: string[];
    wsConnected: boolean;

    // Lists (Legacy style compatibility)
    satellites: SpatialEntity[];
    flights: SpatialEntity[];
    earthquakes: SpatialEntity[];
    military: SpatialEntity[];
    vessels: SpatialEntity[];
    naturalEvents: SpatialEntity[];
    weatherGrid: SpatialEntity[];
    cameras: MapCameraCatalogEntry[];
    cameraCatalogLoaded: boolean;
    
    riskScore: number;
    aiInsights: string[];
    aiSynthesis: string | null;
    isAnalyzing: boolean;
    isOrbiting: boolean;
    loadingLayers: string[];
    errorLayers: Record<string, string>;
    layerUpdatedAt: Record<string, number>;
    recentSnapshots: TelemetrySnapshot[];
    
    // History / Timeline mode
    historyMode: boolean;
    historyTimestamp: number | null;
    historyRange: [number, number] | null;
    playbackSpeed: number;
    isPlaying: boolean;
    currentTime: number;
    timeWindow: '1h' | '6h' | '24h' | '48h' | '7d';
    timelineAvailability: Record<string, { start: number; end: number }[]>;

    // Navigation State
    navigationRoute: any | null;
    navigationActive: boolean;
    navigationProfile: 'car' | 'bicycle' | 'pedestrian' | 'truck';

    // Favorites
    favorites: FavoriteItem[];

    // Actions - Entities
    setEntities: (entities: Record<string, SpatialEntity>) => void;
    addEntity: (entity: SpatialEntity) => void;
    removeEntity: (id: string) => void;
    setSelectedTarget: (target: SpatialEntity | null) => void;
    setTargetLocked: (locked: boolean) => void;

    // Actions - Viewport
    setViewportCenter: (center: ViewportCenter) => void;
    setFlyToRequest: (request: FlyToRequest | null) => void;

    // Actions - Layers & View
    toggleLayer: (layerId: string) => void;
    setSelectedLayers: (layers: string[]) => void;
    setImageryProvider: (provider: 'dark' | 'satellite' | 'google-3d' | 'off') => void;
    setGoogleMapsApiKey: (key: string) => void;
    setMapMode: (mode: '2D' | '3D') => void;
    setViewMode: (mode: 'globe' | 'navigation' | 'radar') => void;
    setActiveLayer: (layer: string | null) => void;

    // Actions - UI
    togglePanel: (panelId: string) => void;
    setWsConnected: (connected: boolean) => void;
    
    setRiskScore: (score: number) => void;
    addInsight: (insight: string) => void;
    setAiSynthesis: (text: string | null) => void;
    appendAiSynthesis: (chunk: string) => void;
    setIsAnalyzing: (analyzing: boolean) => void;
    setWeatherGrid: (grid: SpatialEntity[]) => void;
    setCameras: (cameras: MapCameraCatalogEntry[]) => void;
    updateEntities: (layer: string, entities: SpatialEntity[]) => void;
    addEntities: (layer: string, newEntities: SpatialEntity[]) => void;
    clearEntities: (layer: string) => void;
    setHistoryMode: (on: boolean) => void;
    setHistoryTimestamp: (ts: number | null) => void;
    setHistoryRange: (range: [number, number] | null) => void;
    setPlaybackSpeed: (speed: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setTimeWindow: (window: '1h' | '6h' | '24h' | '48h' | '7d') => void;
    setTimelineAvailability: (pluginId: string, availability: { start: number; end: number }[]) => void;
    setLoadingLayer: (layerId: string, loading: boolean) => void;
    setLayerError: (layerId: string, error: string | null) => void;
    setLayerUpdatedAt: (layerId: string, timestamp: number) => void;
    setRecentSnapshots: (snapshots: TelemetrySnapshot[]) => void;

    // Premium WebGL Graphics actions
    setResolutionScale: (val: number) => void;
    setAntiAliasing: (val: 'none' | 'fxaa' | 'msaa') => void;
    setTileDetail: (val: number) => void;
    setShadows: (val: boolean) => void;
    setGlobeLighting: (val: boolean) => void;
    setShowFps: (val: boolean) => void;
    resetGraphicsToDefault: () => void;

    // Navigation Actions
    setNavigationRoute: (route: any | null) => void;
    setNavigationActive: (active: boolean) => void;
    setNavigationProfile: (profile: 'car' | 'bicycle' | 'pedestrian' | 'truck') => void;

    // Favorites Actions
    addFavorite: (entity: SpatialEntity, layerLabel: string) => void;
    removeFavorite: (id: string) => void;
}

// ─── Store ──────────────────────────────────────────────────────

export const useGTSMStore = create<GTSMState>()(
    persist(
        (set) => ({
            // Initial data state
            entities: {},
            selectedTarget: null,
            targetLocked: false,
            viewportCenter: { lat: 40.7127, lon: -74.0060, alt: 1280 },
            flyToRequest: null,

            // Initial view state
            selectedLayers: ['satellites', 'flights', 'earthquakes', 'military', 'vessels', 'naturalEvents'],
            imageryProvider: 'dark',
            googleMapsApiKey: '',
            mapMode: '3D',
            viewMode: 'globe',

            // Initial premium WebGL Graphics settings
            resolutionScale: 1.0,
            antiAliasing: 'fxaa',
            tileDetail: 5.0,
            shadows: false,
            globeLighting: true,
            showFps: false,

            // Initial UI state
            activeLayer: null,
            collapsedPanels: [],
            wsConnected: false,

            // Lists
            satellites: [],
            flights: [],
            earthquakes: [],
            military: [],
            vessels: [],
            naturalEvents: [],
            weatherGrid: [],
            cameras: [],
            cameraCatalogLoaded: false,

            riskScore: 0,
            aiInsights: [],
            aiSynthesis: null,
            isAnalyzing: false,
            isOrbiting: true,
            loadingLayers: [],
            errorLayers: {},
            layerUpdatedAt: {},
            recentSnapshots: [],
            
            historyMode: false,
            historyTimestamp: null,
            historyRange: null,
            playbackSpeed: 1,
            isPlaying: false,
            currentTime: Date.now(),
            timeWindow: '24h',
            timelineAvailability: {},

            navigationRoute: null,
            navigationActive: false,
            navigationProfile: 'car',

            favorites: [],

            // Entity actions
            setEntities: (entities) => set({ entities }),

            addEntity: (entity) => set((state) => ({
                entities: { ...state.entities, [entity.id]: entity }
            })),

            removeEntity: (id) => set((state) => {
                const next = { ...state.entities };
                delete next[id];
                return { entities: next };
            }),

            setSelectedTarget: (target) => set({ selectedTarget: target }),
            setTargetLocked: (locked) => set({ targetLocked: locked }),

            // Viewport actions
            setViewportCenter: (center) => set({ viewportCenter: center }),
            setFlyToRequest: (request) => set({ flyToRequest: request }),

            // Layer & View actions
            toggleLayer: (layerId) => set((state) => ({
                selectedLayers: state.selectedLayers.includes(layerId)
                    ? state.selectedLayers.filter(id => id !== layerId)
                    : [...state.selectedLayers, layerId]
            })),

            setSelectedLayers: (layers) => set({ selectedLayers: layers }),
            setImageryProvider: (provider) => set({ imageryProvider: provider }),
            setGoogleMapsApiKey: (key) => set({ googleMapsApiKey: key }),
            setMapMode: (mode) => set({ mapMode: mode }),
            setViewMode: (mode) => set({ viewMode: mode }),
            setActiveLayer: (layer) => set({ activeLayer: layer }),

            // UI actions
            togglePanel: (panelId) => set((state) => ({
                collapsedPanels: state.collapsedPanels.includes(panelId)
                    ? state.collapsedPanels.filter(id => id !== panelId)
                    : [...state.collapsedPanels, panelId]
            })),

            setWsConnected: (connected) => set({ wsConnected: connected }),

            setRiskScore: (score) => set({ riskScore: score }),
            addInsight: (insight) => set((state) => ({
                aiInsights: [insight, ...state.aiInsights].slice(0, 5)
            })),
            setAiSynthesis: (text) => set({ aiSynthesis: text }),
            appendAiSynthesis: (chunk) => set((state) => ({ aiSynthesis: (state.aiSynthesis || "") + chunk })),
            setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
            setWeatherGrid: (grid) => set({ weatherGrid: grid }),
            setCameras: (cameras) => set({ cameras, cameraCatalogLoaded: true }),

            updateEntities: (layer, entities) => set((state) => {
                const timestampedEntities = entities.map(e => ({
                    ...e,
                    _timestamp: e._timestamp || Date.now()
                }));
                const maxAge = ENTITY_MAX_AGE[layer as keyof typeof ENTITY_MAX_AGE] || 24 * 60 * 60 * 1000;
                const pruned = pruneEntities(timestampedEntities, layer as keyof typeof ENTITY_LIMITS, maxAge);
                
                // Keep record map synchronized
                const updatedEntities = { ...state.entities };
                pruned.forEach(e => { updatedEntities[e.id] = e; });
                
                return { [layer]: pruned, entities: updatedEntities } as Partial<GTSMState>;
            }),

            addEntities: (layer, newEntities) => set((state) => {
                const existing = ((state[layer as keyof GTSMState] as SpatialEntity[]) || []).map(e => ({
                    ...e,
                    _timestamp: e._timestamp || Date.now()
                }));
                const timestampedNewEntities = newEntities.map(e => ({
                    ...e,
                    _timestamp: e._timestamp || Date.now()
                }));
                const map = new Map(existing.map(e => [e.id, e]));
                for (const e of timestampedNewEntities) map.set(e.id, e);
                const allEntities = Array.from(map.values());
                const maxAge = ENTITY_MAX_AGE[layer as keyof typeof ENTITY_MAX_AGE] || 24 * 60 * 60 * 1000;
                const pruned = pruneEntities(allEntities, layer as keyof typeof ENTITY_LIMITS, maxAge);
                
                // Keep record map synchronized
                const updatedEntities = { ...state.entities };
                pruned.forEach(e => { updatedEntities[e.id] = e; });

                return { [layer]: pruned, entities: updatedEntities } as Partial<GTSMState>;
            }),

            clearEntities: (layer) => set(() => ({ [layer]: [] }) as Partial<GTSMState>),

            setLoadingLayer: (layerId, loading) => set((state) => ({
                loadingLayers: loading
                    ? [...state.loadingLayers, layerId]
                    : state.loadingLayers.filter(id => id !== layerId)
            })),

            setLayerError: (layerId, error) => set((state) => {
                const updated = { ...state.errorLayers };
                if (error === null) {
                    delete updated[layerId];
                } else {
                    updated[layerId] = error;
                }
                return { errorLayers: updated };
            }),

            setLayerUpdatedAt: (layerId, timestamp) => set((state) => ({
                layerUpdatedAt: { ...state.layerUpdatedAt, [layerId]: timestamp },
            })),

            setRecentSnapshots: (snapshots) => set({ recentSnapshots: snapshots }),
            setHistoryMode: (on) => set({ historyMode: on }),
            setHistoryTimestamp: (ts) => set({ historyTimestamp: ts }),
            setHistoryRange: (range) => set({ historyRange: range }),
            setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
            setIsPlaying: (playing) => set({ isPlaying: playing }),
            setCurrentTime: (time) => set({ currentTime: time }),
            setTimeWindow: (window) => {
                const now = Date.now();
                const msMap: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '48h': 172800000, '7d': 604800000 };
                set({
                    timeWindow: window,
                    historyRange: [now - msMap[window], now],
                    currentTime: now,
                });
            },
            setTimelineAvailability: (pluginId, availability) => set((state) => ({
                timelineAvailability: { ...state.timelineAvailability, [pluginId]: availability },
            })),

            setResolutionScale: (val) => set({ resolutionScale: val }),
            setAntiAliasing: (val) => set({ antiAliasing: val }),
            setTileDetail: (val) => set({ tileDetail: val }),
            setShadows: (val) => set({ shadows: val }),
            setGlobeLighting: (val) => set({ globeLighting: val }),
            setShowFps: (val) => set({ showFps: val }),
            resetGraphicsToDefault: () => set({
                resolutionScale: 1.0,
                antiAliasing: 'fxaa',
                tileDetail: 5.0,
                shadows: false,
                globeLighting: true,
                showFps: false
            }),

            setNavigationRoute: (route) => set({ navigationRoute: route }),
            setNavigationActive: (active) => set({ navigationActive: active }),
            setNavigationProfile: (profile) => set({ navigationProfile: profile }),

            addFavorite: (entity, layerLabel) => set((state) => {
                if (state.favorites.some(f => f.id === entity.id)) return state;
                const fav = {
                    id: entity.id,
                    label: entity.metadata?.name || entity.metadata?.callsign || entity.metadata?.flight || entity.metadata?.title || entity.id,
                    layerId: entity.type,
                    layerLabel,
                    lat: entity.position.lat,
                    lon: entity.position.lon,
                    alt: entity.position.alt,
                    timestamp: Date.now(),
                };
                // Persist to SQLite backend (fire-and-forget)
                gtsmApi.saveFavorite({
                    id: fav.id,
                    entityId: entity.id,
                    label: fav.label,
                    layerId: fav.layerId,
                    layerLabel: fav.layerLabel,
                    lat: fav.lat,
                    lon: fav.lon,
                    alt: fav.alt,
                }).catch(console.error);
                return { favorites: [...state.favorites, fav] };
            }),
            removeFavorite: (id) => set((state) => {
                // Delete from SQLite backend (fire-and-forget)
                gtsmApi.deleteFavorite(id).catch(console.error);
                return { favorites: state.favorites.filter(f => f.id !== id) };
            }),
        }),
        {
            name: 'zen-gtsm-store-hybrid',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                selectedLayers: state.selectedLayers,
                imageryProvider: state.imageryProvider,
                googleMapsApiKey: state.googleMapsApiKey,
                navigationProfile: state.navigationProfile,
                mapMode: state.mapMode,
                viewMode: state.viewMode,
                collapsedPanels: state.collapsedPanels,
                resolutionScale: state.resolutionScale,
                antiAliasing: state.antiAliasing,
                tileDetail: state.tileDetail,
                shadows: state.shadows,
                globeLighting: state.globeLighting,
                showFps: state.showFps,
                favorites: state.favorites,
            }),
            onRehydrateStorage: () => (_state, _error) => {
                // After localStorage rehydration completes, merge SQLite favorites
                gtsmApi.listFavorites().then((dbFavorites) => {
                    if (dbFavorites && dbFavorites.length > 0) {
                        useGTSMStore.setState((state) => {
                            const existingIds = new Set(state.favorites.map(f => f.id));
                            const newFromDb = dbFavorites
                                .filter(f => !existingIds.has(f.id))
                                .map(f => ({
                                    id: f.id,
                                    label: f.label,
                                    layerId: f.layerId,
                                    layerLabel: f.layerLabel,
                                    lat: f.lat,
                                    lon: f.lon,
                                    alt: f.alt,
                                    timestamp: 0,
                                }));
                            if (newFromDb.length === 0) return state;
                            return { favorites: [...state.favorites, ...newFromDb] };
                        });
                    }
                }).catch(() => {});
            },
        }
    )
);
