import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────────

export interface SpatialEntity {
    id: string;
    type: 'satellite' | 'flight' | 'earthquake' | 'military' | 'weather' | 'vessel' | 'natural_event';
    position: { lat: number; lon: number; alt: number };
    velocity?: number;
    metadata: Record<string, any>;
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

export interface GTSMState {
    // Data
    entities: Record<string, SpatialEntity>;
    selectedTarget: SpatialEntity | null;
    targetLocked: boolean;
    viewportCenter: ViewportCenter | null;
    flyToRequest: FlyToRequest | null;

    // View settings
    selectedLayers: string[];
    imageryProvider: 'dark' | 'satellite' | 'off';
    viewMode: 'globe' | 'navigation' | 'radar';

    // UI state
    activeLayer: string | null;
    collapsedPanels: string[];
    wsConnected: boolean;

    // Actions - Entities
    setEntities: (entities: Record<string, SpatialEntity>) => void;
    addEntity: (entity: SpatialEntity) => void;
    removeEntity: (id: string) => void;
    setSelectedTarget: (target: SpatialEntity | null) => void;
    setTargetLocked: (locked: boolean) => void;

    // Actions - Viewport
    setViewportCenter: (center: ViewportCenter | null) => void;
    setFlyToRequest: (request: FlyToRequest | null) => void;

    // Actions - Layers & View
    toggleLayer: (layerId: string) => void;
    setSelectedLayers: (layers: string[]) => void;
    setImageryProvider: (provider: 'dark' | 'satellite' | 'off') => void;
    setViewMode: (mode: 'globe' | 'navigation' | 'radar') => void;
    setActiveLayer: (layer: string | null) => void;

    // Actions - UI
    togglePanel: (panelId: string) => void;
    setWsConnected: (connected: boolean) => void;
}

// ─── Store ──────────────────────────────────────────────────────

export const useGTSMStore = create<GTSMState>()(
    persist(
        (set) => ({
            // Initial data state
            entities: {},
            selectedTarget: null,
            targetLocked: false,
            viewportCenter: null,
            flyToRequest: null,

            // Initial view state
            selectedLayers: ['satellites', 'flights', 'earthquakes', 'military', 'vessels', 'heatmap', 'weather'],
            imageryProvider: 'dark',
            viewMode: 'globe',

            // Initial UI state
            activeLayer: null,
            collapsedPanels: [],
            wsConnected: false,

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

            setViewMode: (mode) => set({ viewMode: mode }),

            setActiveLayer: (layer) => set({ activeLayer: layer }),

            // UI actions
            togglePanel: (panelId) => set((state) => ({
                collapsedPanels: state.collapsedPanels.includes(panelId)
                    ? state.collapsedPanels.filter(id => id !== panelId)
                    : [...state.collapsedPanels, panelId]
            })),

            setWsConnected: (connected) => set({ wsConnected: connected }),
        }),
        {
            name: 'zen-gtsm-store',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                selectedLayers: state.selectedLayers,
                imageryProvider: state.imageryProvider,
                collapsedPanels: state.collapsedPanels,
            }),
        }
    )
);