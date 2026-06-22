import { create } from 'zustand';
import * as geojsonApi from '@/lib/features/geojsonApi';

export interface GeojsonLayerState {
  layers: geojsonApi.GtsmGeojsonLayer[];
  isLoading: boolean;
  error: string | null;

  loadLayers: () => Promise<void>;
  addLayer: (
    name: string,
    description: string,
    color: string,
    geojson: string
  ) => Promise<geojsonApi.GtsmGeojsonLayer>;
  deleteLayer: (id: string) => Promise<void>;
  toggleLayerVisibility: (id: string, visible: boolean) => Promise<void>;
  updateLayerColor: (id: string, color: string) => Promise<void>;
}

export const useGeojsonLayerStore = create<GeojsonLayerState>((set, get) => ({
  layers: [],
  isLoading: false,
  error: null,

  loadLayers: async () => {
    set({ isLoading: true, error: null });
    try {
      const layers = await geojsonApi.listGeojsonLayers();
      set({ layers, isLoading: false });
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
    }
  },

  addLayer: async (name, description, color, geojson) => {
    set({ isLoading: true, error: null });
    try {
      const id = 'layer_' + Math.random().toString(36).substring(2, 9);
      const newLayer = await geojsonApi.saveGeojsonLayer(
        id,
        name,
        description,
        color,
        true,
        geojson
      );
      set((state) => ({
        layers: [newLayer, ...state.layers],
        isLoading: false,
      }));
      return newLayer;
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
      throw err;
    }
  },

  deleteLayer: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await geojsonApi.deleteGeojsonLayer(id);
      set((state) => ({
        layers: state.layers.filter((l) => l.id !== id),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.toString(), isLoading: false });
      throw err;
    }
  },

  toggleLayerVisibility: async (id, visible) => {
    const layer = get().layers.find((l) => l.id === id);
    if (!layer) return;

    try {
      const updatedLayer = await geojsonApi.saveGeojsonLayer(
        id,
        layer.name,
        layer.description,
        layer.color,
        visible,
        layer.geojson
      );
      set((state) => ({
        layers: state.layers.map((l) => (l.id === id ? updatedLayer : l)),
      }));
    } catch (err: any) {
      set({ error: err.toString() });
      throw err;
    }
  },

  updateLayerColor: async (id, color) => {
    const layer = get().layers.find((l) => l.id === id);
    if (!layer) return;

    try {
      const updatedLayer = await geojsonApi.saveGeojsonLayer(
        id,
        layer.name,
        layer.description,
        color,
        layer.visible === 1,
        layer.geojson
      );
      set((state) => ({
        layers: state.layers.map((l) => (l.id === id ? updatedLayer : l)),
      }));
    } catch (err: any) {
      set({ error: err.toString() });
      throw err;
    }
  },
}));
