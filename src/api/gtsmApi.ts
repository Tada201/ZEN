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

export const gtsmApi = {
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
};
