import { callCommand } from "./tauriClient";
import type { TelemetrySnapshot } from "@/lib/stores/useGTSMStore";

export interface ComputeNavigationRouteRequest extends Record<string, unknown> {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  profile: string;
}

export const gtsmApi = {
  getTelemetryHistory: (entityType: string, timestamp: number) =>
    callCommand<TelemetrySnapshot[]>("get_telemetry_history", { entityType, timestamp }),
  generateInsight: (prompt: string, model: string) =>
    callCommand<void>("generate_insight", { payload: { prompt, model } }),
  computeNavigationRoute: <T>(request: ComputeNavigationRouteRequest) =>
    callCommand<T>("compute_navigation_route", request),
};
