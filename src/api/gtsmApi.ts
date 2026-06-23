import { callCommand } from "./tauriClient";
import type { PaginatedResponse } from "./chatApi";
import type { TelemetrySnapshot } from "@/lib/stores/useGTSMStore";

export interface ComputeNavigationRouteRequest extends Record<string, unknown> {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  profile: string;
}

export interface TrackPoint {
  timestamp: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface GlobalMapRecord {
  id?: string;
  icao24?: string;
  hex?: string;
  mmsi?: string;
  name?: string;
  title?: string;
  lat: number;
  lon: number;
  alt?: number;
  alt_baro?: number;
  depth?: number;
  velocity?: number;
  heading?: number;
  track?: number;
  magnitude?: number;
  place?: string;
  event_type?: string;
  ship_type?: string;
  ground_speed?: number;
  callsign?: string | null;
  flight?: string | null;
  [key: string]: unknown;
}

export interface GtsmGeofence {
  id: string;
  name: string;
  geofenceType: string;
  centerLat?: number | null;
  centerLon?: number | null;
  radiusKm?: number | null;
  polygonCoords?: string | null;
  boxNorth?: number | null;
  boxSouth?: number | null;
  boxEast?: number | null;
  boxWest?: number | null;
  alertEnabled: number;
  createdAt: string;
  updatedAt: string;
}

export interface GtsmMarker {
  id: string;
  name: string;
  markerType: string;
  lat: number;
  lon: number;
  alt: number;
  color: string;
  icon: string;
  metadata?: string | null;
  createdAt: string;
}

export interface GtsmFavorite {
  id: string;
  entityId: string;
  label: string;
  layerId: string;
  layerLabel: string;
  lat: number;
  lon: number;
  alt: number;
  createdAt: string;
}

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  place_type: string;
  importance: number;
  bounding_box?: [number, number, number, number] | null;
}

export interface TelemetryStats {
  total_snapshots: number;
  distinct_entities: number;
  time_range: { start: number; end: number } | null;
}

export interface WeatherGridPoint {
  lat: number;
  lon: number;
  temperature: number;
  weather_code: number;
  cloud_cover: number;
  wind_speed: number;
}

export interface MapConnectorMetadata {
  id: string;
  label: string;
  provider: string;
  attribution: string;
  refreshSeconds: number;
  maturity: 'prototype' | 'preview' | 'partial' | 'production';
}

export interface MapCameraCatalogEntry {
  id: string;
  label: string;
  operator: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  streamFormat: 'hls' | 'mp4' | 'external';
  status: 'available' | 'unavailable' | 'maintenance';
  isDemo: boolean;
  attribution?: string | null;
  termsUrl?: string | null;
}

export interface MapCameraCatalogSourceStatus {
  id: string;
  label: string;
  configured: boolean;
  status: 'available' | 'unavailable' | 'not_configured';
  entryCount: number;
  checkedAt: number;
  detail?: string | null;
}

export interface MapCameraCatalogSnapshot {
  entries: MapCameraCatalogEntry[];
  sources: MapCameraCatalogSourceStatus[];
  fetchedAt: number;
}

export interface MapCameraPlaybackDescriptor {
  cameraId: string;
  label: string;
  streamUrl?: string | null;
  streamFormat: 'hls' | 'mp4' | 'external';
  sourceUrl: string;
  directPreviewSupported: boolean;
}

export const gtsmApi = {
  getSatellites: () => callCommand<GlobalMapRecord[]>("get_satellites"),
  getFlights: () => callCommand<GlobalMapRecord[]>("get_flights"),
  getEarthquakes: () => callCommand<GlobalMapRecord[]>("get_earthquakes", { minMagnitude: 2.5, hours: 24 }),
  getMilitaryAircraft: () => callCommand<GlobalMapRecord[]>("get_military_aircraft"),
  getVessels: () => callCommand<GlobalMapRecord[]>("get_vessels"),
  getNaturalEvents: () => callCommand<GlobalMapRecord[]>("get_natural_events"),
  getUnderseaCables: () => callCommand<unknown>("get_undersea_cables"),
  listMapConnectors: () => callCommand<MapConnectorMetadata[]>("list_map_connectors"),
  listMapCameras: () => callCommand<MapCameraCatalogEntry[]>("list_map_cameras"),
  getMapCameraCatalog: () => callCommand<MapCameraCatalogSnapshot>("get_map_camera_catalog"),
  resolveMapCameraPlayback: (cameraId: string) => callCommand<MapCameraPlaybackDescriptor>("resolve_map_camera_playback", { cameraId }),
  testMapCameraCatalog: () => callCommand<number>("test_map_camera_catalog"),
  getWeatherGrid: (latMin: number, latMax: number, lonMin: number, lonMax: number, step: number) =>
    callCommand<WeatherGridPoint[]>("get_weather_grid", { latMin, latMax, lonMin, lonMax, step }),
  getTelemetryStats: () => callCommand<TelemetryStats>("get_telemetry_stats"),
  geocodeSearch: (query: string, limit = 5) =>
    callCommand<GeocodingResult[]>("geocode_search", { query, limit }),
  getTelemetryHistory: (entityType: string, timestamp: number) =>
    callCommand<TelemetrySnapshot[]>("get_telemetry_history", { entityType, timestamp }),
  getTelemetryHistoryPage: (entityType: string, timestamp: number, limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<TelemetrySnapshot>>("get_telemetry_history_page", {
      entityType,
      timestamp,
      limit,
      offset,
    }),
  getEntityTrackPage: (
    entityId: string,
    startTime: number,
    endTime: number,
    limit?: number,
    offset?: number
  ) =>
    callCommand<PaginatedResponse<TrackPoint>>("get_entity_track_page", {
      entityId,
      startTime,
      endTime,
      limit,
      offset,
    }),
  listGeofencesPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<GtsmGeofence>>("list_geofences_db_page", { limit, offset }),
  listMarkersPage: (limit?: number, offset?: number) =>
    callCommand<PaginatedResponse<GtsmMarker>>("list_markers_db_page", { limit, offset }),
  generateInsight: (prompt: string, model: string) =>
    callCommand<void>("generate_insight", { payload: { prompt, model } }),
  computeNavigationRoute: <T>(request: ComputeNavigationRouteRequest) =>
    callCommand<T>("compute_navigation_route", request),
  // Favorites CRUD (SQLite-backed)
  listFavorites: () => callCommand<GtsmFavorite[]>("list_favorites_db"),
  saveFavorite: (fav: {
    id: string;
    entityId: string;
    label: string;
    layerId: string;
    layerLabel: string;
    lat: number;
    lon: number;
    alt: number;
  }) => callCommand<void>("save_favorite_db", fav),
  deleteFavorite: (id: string) => callCommand<void>("delete_favorite_db", { id }),
};
