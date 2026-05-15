import { create } from 'zustand';
import {
  Star,
  Planet,
  Satellite,
  DeepSkyObject,
  AstronomyStatus,
  ObserverLocation,
  getStars,
  getPlanets,
  getAstronomicalSatellites,
  getDeepSkyObjects,
  getAstronomyStatus,
} from '../api/astronomy';

export interface AstronomyStore {
  // Data
  stars: Star[];
  planets: Planet[];
  satellites: Satellite[];
  deepSkyObjects: DeepSkyObject[];
  status: AstronomyStatus | null;

  // Loading states
  loading: boolean;
  syncing: boolean;
  starsLoading: boolean;
  planetsLoading: boolean;
  satellitesLoading: boolean;
  deepSkyLoading: boolean;

  // Observer settings
  observer: ObserverLocation;

  // Display options
  showStars: boolean;
  showPlanets: boolean;
  showSatellites: boolean;
  showDeepSky: boolean;
  starMagnitudeLimit: number;
  maxSatellitesShown: number;
  observatoryModeEnabled: boolean;

  // Actions
  loadAllAstronomyData: () => Promise<void>;
  loadStars: () => Promise<void>;
  loadPlanets: () => Promise<void>;
  loadSatellites: () => Promise<void>;
  loadDeepSkyObjects: () => Promise<void>;
  loadStatus: () => Promise<void>;

  setObserver: (observer: ObserverLocation) => void;
  toggleShowStars: () => void;
  toggleShowPlanets: () => void;
  toggleShowSatellites: () => void;
  toggleShowDeepSky: () => void;
  setStarMagnitudeLimit: (limit: number) => void;
  setMaxSatellitesShown: (count: number) => void;
  toggleObservatoryMode: () => void;

  // Reset
  reset: () => void;
}

const defaultObserver: ObserverLocation = {
  latitude: 37.7749, // San Francisco
  longitude: -122.4194,
  altitude: 50,
  timezone: 'America/Los_Angeles',
};

export const useAstronomyStore = create<AstronomyStore>((set) => ({
  // Initial state
  stars: [],
  planets: [],
  satellites: [],
  deepSkyObjects: [],
  status: null,

  loading: false,
  syncing: false,
  starsLoading: false,
  planetsLoading: false,
  satellitesLoading: false,
  deepSkyLoading: false,

  observer: defaultObserver,

  showStars: true,
  showPlanets: true,
  showSatellites: true,
  showDeepSky: true,
  starMagnitudeLimit: 6,
  maxSatellitesShown: 50,
  observatoryModeEnabled: false,

  loadAllAstronomyData: async () => {
    set({ loading: true });
    try {
      const [stars, planets, satellites, deepSkyObjects, status] = await Promise.all([
        getStars(),
        getPlanets(),
        getAstronomicalSatellites(),
        getDeepSkyObjects(),
        getAstronomyStatus(),
      ]);
      set({ stars, planets, satellites, deepSkyObjects, status });
    } finally {
      set({ loading: false });
    }
  },

  loadStars: async () => {
    set({ starsLoading: true });
    try {
      const stars = await getStars();
      set({ stars });
    } catch (error) {
      console.error('Failed to load stars:', error);
    } finally {
      set({ starsLoading: false });
    }
  },

  loadPlanets: async () => {
    set({ planetsLoading: true });
    try {
      const planets = await getPlanets();
      set({ planets });
    } catch (error) {
      console.error('Failed to load planets:', error);
    } finally {
      set({ planetsLoading: false });
    }
  },

  loadSatellites: async () => {
    set({ satellitesLoading: true });
    try {
      const satellites = await getAstronomicalSatellites();
      set({ satellites });
    } catch (error) {
      console.error('Failed to load satellites:', error);
    } finally {
      set({ satellitesLoading: false });
    }
  },

  loadDeepSkyObjects: async () => {
    set({ deepSkyLoading: true });
    try {
      const deepSkyObjects = await getDeepSkyObjects();
      set({ deepSkyObjects });
    } catch (error) {
      console.error('Failed to load deep sky objects:', error);
    } finally {
      set({ deepSkyLoading: false });
    }
  },

  loadStatus: async () => {
    try {
      const status = await getAstronomyStatus();
      set({ status });
    } catch (error) {
      console.error('Failed to load astronomy status:', error);
    }
  },

  setObserver: (observer) => set({ observer }),

  toggleShowStars: () => set((s) => ({ showStars: !s.showStars })),
  toggleShowPlanets: () => set((s) => ({ showPlanets: !s.showPlanets })),
  toggleShowSatellites: () => set((s) => ({ showSatellites: !s.showSatellites })),
  toggleShowDeepSky: () => set((s) => ({ showDeepSky: !s.showDeepSky })),

  setStarMagnitudeLimit: (starMagnitudeLimit) => set({ starMagnitudeLimit }),
  setMaxSatellitesShown: (maxSatellitesShown) => set({ maxSatellitesShown }),

  toggleObservatoryMode: () => set((s) => ({ observatoryModeEnabled: !s.observatoryModeEnabled })),

  reset: () => set({
    stars: [],
    planets: [],
    satellites: [],
    deepSkyObjects: [],
    status: null,
    loading: false,
    syncing: false,
    starsLoading: false,
    planetsLoading: false,
    satellitesLoading: false,
    deepSkyLoading: false,
    observer: defaultObserver,
    showStars: true,
    showPlanets: true,
    showSatellites: true,
    showDeepSky: true,
    starMagnitudeLimit: 6,
    maxSatellitesShown: 50,
    observatoryModeEnabled: false,
  }),
}));