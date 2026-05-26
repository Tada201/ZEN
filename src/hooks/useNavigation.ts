import { useState, useCallback, useRef, useEffect } from 'react';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { gtsmApi } from '@/api';

export interface TrafficIncident {
    id: string;
    lat: number;
    lon: number;
    type_code: string;
    description: string;
    severity: number;
}

export interface NavigationStep {
    lat: number;
    lon: number;
    instruction: string;
    distance_m: number;
    duration_s: number;
    action: string;
}

export interface NavigationRoute {
    provider: string;
    geometry: [number, number][];
    polyline: string;
    distance_m: number;
    duration_s: number;
    traffic_duration_s?: number;
    steps: NavigationStep[];
    incidents: TrafficIncident[];
    summary: string;
}

const validateRouteGeometry = (route: any): route is NavigationRoute => {
    if (!route || typeof route !== 'object') return false;
    if (!Array.isArray(route.geometry)) return false;
    if (route.geometry.length < 2) return false;
    
    return route.geometry.every(([lon, lat]: any) => {
        const validLat = typeof lat === 'number' && lat >= -90 && lat <= 90 && !isNaN(lat);
        const validLon = typeof lon === 'number' && lon >= -180 && lon <= 180 && !isNaN(lon);
        return validLat && validLon;
    });
};

export const useNavigation = () => {
    const setNavigationRoute = useGTSMStore(state => state.setNavigationRoute);
    const setNavigationActive = useGTSMStore(state => state.setNavigationActive);
    const setViewMode = useGTSMStore(state => state.setViewMode);

    const navigationRoute = useGTSMStore(state => state.navigationRoute) as NavigationRoute | null;
    const navigationProfile = useGTSMStore(state => state.navigationProfile);
    const navigationActive = useGTSMStore(state => state.navigationActive);

    const [isRouting, setIsRouting] = useState(false);
    const [routeError, setRouteError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<number>(0);

    const currentOrigin = useRef<[number, number] | null>(null);
    const currentDest = useRef<[number, number] | null>(null);
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchRoute = useCallback(async (origin: [number, number], dest: [number, number], profile: string) => {
        setIsRouting(true);
        setRouteError(null);
        try {
            const route = await gtsmApi.computeNavigationRoute<NavigationRoute>({
                startLat: origin[1],
                startLon: origin[0],
                endLat: dest[1],
                endLon: dest[0],
                profile
            });

            if (!validateRouteGeometry(route)) {
                throw new Error('Invalid route geometry from server (malformed coordinates)');
            }

            setNavigationRoute(route);
            setNavigationActive(true);
            setViewMode('navigation');
            setLastRefresh(Date.now());

            currentOrigin.current = origin;
            currentDest.current = dest;

        } catch (err: any) {
            console.error("Navigation routing failed:", err);
            const errorMessage = err instanceof Error ? err.message : err?.toString?.() || 'Unknown error';
            setRouteError(errorMessage);
            setNavigationRoute(null);
            setNavigationActive(false);
        } finally {
            setIsRouting(false);
        }
    }, [setNavigationRoute, setNavigationActive, setViewMode]);

    const startNavigation = useCallback((origin: [number, number], dest: [number, number]) => {
        fetchRoute(origin, dest, navigationProfile);
    }, [fetchRoute, navigationProfile]);

    const cancelNavigation = useCallback(() => {
        setNavigationActive(false);
        setNavigationRoute(null);
        setViewMode('globe');
        if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
            refreshIntervalRef.current = null;
        }
    }, [setNavigationActive, setNavigationRoute, setViewMode]);

    useEffect(() => {
        if (navigationActive && currentOrigin.current && currentDest.current) {
            refreshIntervalRef.current = setInterval(() => {
                console.log("Refreshing navigation route (traffic/ETA update)...");
                fetchRoute(currentOrigin.current!, currentDest.current!, navigationProfile);
            }, 3 * 60 * 1000);
            
            return () => {
                if (refreshIntervalRef.current) {
                    clearInterval(refreshIntervalRef.current);
                }
            };
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [navigationActive, navigationProfile, fetchRoute]);

    useEffect(() => {
        if (navigationActive && currentOrigin.current && currentDest.current) {
            console.log(`Profile changed to ${navigationProfile}, re-fetching route...`);
            fetchRoute(currentOrigin.current, currentDest.current, navigationProfile);
        }
    }, [navigationProfile]);

    return {
        startNavigation,
        cancelNavigation,
        navigationRoute,
        isRouting,
        routeError,
        lastRefresh,
        navigationActive
    };
};
