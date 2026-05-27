import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import { decodePolyline, getMapStyle } from './mapLibreUtils';

export const MapLibreMapRenderer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);

    // Zustand store inputs
    const {
        satellites,
        flights,
        military,
        vessels,
        earthquakes,
        naturalEvents,
        selectedLayers,
        imageryProvider,
        viewportCenter,
        setViewportCenter,
        selectedTarget,
        setSelectedTarget,
        navigationRoute
    } = useGTSMStore();

    // Initialize 2D MapLibre map engine
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: getMapStyle(imageryProvider),
            center: [viewportCenter.lon || -74.0060, viewportCenter.lat || 40.7128],
            zoom: 2.2,
            maxZoom: 18,
            minZoom: 1,
            pitch: 0,
            bearing: 0
        });

        map.on('load', () => {
            // Add custom geojson data sources for overlay layers
            const sources = ['satellites', 'flights', 'military', 'vessels', 'earthquakes', 'naturalEvents', 'route', 'target'];
            
            sources.forEach(src => {
                map.addSource(`${src}-source`, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            });

            // ── Add Styled Layers ──
            // Satellites Layer (Cyan Glowing Circles)
            map.addLayer({
                id: 'satellites-layer',
                type: 'circle',
                source: 'satellites-source',
                paint: {
                    'circle-radius': 3.5,
                    'circle-color': '#00E6E6',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.85
                }
            });

            // Flights Layer (Bright Green Circles)
            map.addLayer({
                id: 'flights-layer',
                type: 'circle',
                source: 'flights-source',
                paint: {
                    'circle-radius': 4.5,
                    'circle-color': '#39FF14',
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.9
                }
            });

            // Military Layer (Bright Amber Circles)
            map.addLayer({
                id: 'military-layer',
                type: 'circle',
                source: 'military-source',
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#FFCC00',
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.95
                }
            });

            // Vessels Layer (Light Blue Circles)
            map.addLayer({
                id: 'vessels-layer',
                type: 'circle',
                source: 'vessels-source',
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#00CCFF',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.85
                }
            });

            // Earthquakes Layer (Red Circles scaled by magnitude)
            map.addLayer({
                id: 'earthquakes-layer',
                type: 'circle',
                source: 'earthquakes-source',
                paint: {
                    'circle-radius': ['get', 'radius'],
                    'circle-color': '#FF2266',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#FFFFFF',
                    'circle-opacity': 0.65
                }
            });

            // Route Line Layer (Cyan Wide Path)
            map.addLayer({
                id: 'route-layer',
                type: 'line',
                source: 'route-source',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#00ffff',
                    'line-width': 3.5,
                    'line-opacity': 0.85
                }
            });

            // Active Target Indicator Layer (Cyan Glowing Core with outline)
            map.addLayer({
                id: 'target-layer',
                type: 'circle',
                source: 'target-source',
                paint: {
                    'circle-radius': 8,
                    'circle-color': 'transparent',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#00ffff',
                    'circle-stroke-opacity': 0.95
                }
            });

            // ── Event Interactions ──
            // Sync current map center to Zustand store on moveend
            map.on('moveend', () => {
                const center = map.getCenter();
                const zoom = map.getZoom();
                const estAlt = 40000000 / Math.pow(2, zoom);
                setViewportCenter({
                    lat: center.lat,
                    lon: center.lng,
                    alt: estAlt
                });
            });

            // Global Click listener for entity selections
            map.on('click', (e) => {
                const activeLayers = ['satellites-layer', 'flights-layer', 'military-layer', 'vessels-layer', 'earthquakes-layer'];
                const queryLayers = activeLayers.filter(l => map.getLayer(l));
                
                const features = map.queryRenderedFeatures(e.point, { layers: queryLayers });
                if (features.length > 0) {
                    const feat = features[0];
                    const id = feat.properties?.id;
                    if (id) {
                        const entity = useGTSMStore.getState().entities[id];
                        if (entity) {
                            setSelectedTarget(entity);
                            return;
                        }
                    }
                }
                setSelectedTarget(null);
            });

            // Hover pointer changes
            const layers = ['satellites-layer', 'flights-layer', 'military-layer', 'vessels-layer', 'earthquakes-layer'];
            layers.forEach(l => {
                map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
            });

            // Force initial layer visibility render
            updateLayerVisibilities();
            updateSourceData();
        });

        mapRef.current = map;

        const resizeObserver = new ResizeObserver(() => {
            if (mapRef.current) {
                mapRef.current.resize();
            }
        });
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Helper to toggle layout visibility based on store
    const updateLayerVisibilities = () => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const visibilities = {
            'satellites-layer': selectedLayers.includes('satellites'),
            'flights-layer': selectedLayers.includes('flights'),
            'military-layer': selectedLayers.includes('military'),
            'vessels-layer': selectedLayers.includes('vessels'),
            'earthquakes-layer': selectedLayers.includes('earthquakes'),
            'route-layer': true,
            'target-layer': true
        };

        Object.entries(visibilities).forEach(([id, visible]) => {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
            }
        });
    };

    // Helper to push geojson update payloads to map sources
    const updateSourceData = () => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        // 1. Satellites
        const satSource = map.getSource('satellites-source') as maplibregl.GeoJSONSource;
        if (satSource) {
            satSource.setData({
                type: 'FeatureCollection',
                features: satellites.map(s => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [s.position.lon, s.position.lat] },
                    properties: { id: s.id }
                }))
            });
        }

        // 2. Flights
        const flightSource = map.getSource('flights-source') as maplibregl.GeoJSONSource;
        if (flightSource) {
            flightSource.setData({
                type: 'FeatureCollection',
                features: flights.map(f => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [f.position.lon, f.position.lat] },
                    properties: { id: f.id }
                }))
            });
        }

        // 3. Military
        const milSource = map.getSource('military-source') as maplibregl.GeoJSONSource;
        if (milSource) {
            milSource.setData({
                type: 'FeatureCollection',
                features: military.map(m => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [m.position.lon, m.position.lat] },
                    properties: { id: m.id }
                }))
            });
        }

        // 4. Vessels
        const vesselSource = map.getSource('vessels-source') as maplibregl.GeoJSONSource;
        if (vesselSource) {
            vesselSource.setData({
                type: 'FeatureCollection',
                features: vessels.map(v => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [v.position.lon, v.position.lat] },
                    properties: { id: v.id }
                }))
            });
        }

        // 5. Earthquakes
        const eqSource = map.getSource('earthquakes-source') as maplibregl.GeoJSONSource;
        if (eqSource) {
            eqSource.setData({
                type: 'FeatureCollection',
                features: earthquakes.map(eq => {
                    const mag = parseFloat(eq.metadata?.mag) || 4.0;
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [eq.position.lon, eq.position.lat] },
                        properties: { id: eq.id, radius: Math.max(5, mag * 2.5) }
                    };
                })
            });
        }
    };

    // Watch layers toggle changes
    useEffect(() => {
        updateLayerVisibilities();
    }, [selectedLayers]);

    // Watch entity dynamic real-time updates
    useEffect(() => {
        updateSourceData();
    }, [satellites, flights, military, vessels, earthquakes, naturalEvents]);

    // React to dynamic imagery provider toggles
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const source = map.getSource('raster-tiles') as any;
        if (source) {
            let newTiles = ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'];
            if (imageryProvider === 'satellite' || imageryProvider === 'google-3d') {
                newTiles = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
            } else if (imageryProvider === 'off') {
                newTiles = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='];
            }
            source.setTiles(newTiles);
            // Refresh map display to apply changes immediately
            map.triggerRepaint();
        }
    }, [imageryProvider]);

    // Draw active routing path
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const routeSource = map.getSource('route-source') as maplibregl.GeoJSONSource;
        if (!routeSource) return;

        if (navigationRoute && navigationRoute.polyline) {
            const coords = decodePolyline(navigationRoute.polyline);
            routeSource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: {}
                }]
            });

            // Automatically pan and fit the map to the navigation route path
            if (coords.length > 0) {
                const bounds = coords.reduce((acc, coord) => {
                    return acc.extend(coord);
                }, new maplibregl.LngLatBounds(coords[0], coords[0]));

                map.fitBounds(bounds, { padding: 45, maxZoom: 14, duration: 1500 });
            }
        } else {
            routeSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    }, [navigationRoute]);

    // Lock and pulse selected target entity indicator
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const targetSource = map.getSource('target-source') as maplibregl.GeoJSONSource;
        if (!targetSource) return;

        if (selectedTarget) {
            targetSource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [selectedTarget.position.lon, selectedTarget.position.lat] },
                    properties: { id: selectedTarget.id }
                }]
            });

            // Center target when selected
            map.easeTo({
                center: [selectedTarget.position.lon, selectedTarget.position.lat],
                duration: 600
            });
        } else {
            targetSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    }, [selectedTarget]);

    // Handle flyTo requests from Minimap
    const flyToRequest = useGTSMStore(state => state.flyToRequest);
    const setFlyToRequest = useGTSMStore(state => state.setFlyToRequest);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded() || !flyToRequest) return;

        map.flyTo({
            center: [flyToRequest.lon, flyToRequest.lat],
            zoom: flyToRequest.alt > 10000000 ? 2 : (flyToRequest.alt > 1000000 ? 5 : 9),
            duration: 1500
        });

        setFlyToRequest(null);
    }, [flyToRequest, setFlyToRequest]);

    return <div ref={containerRef} className="flex-1 h-full z-0 relative" />;
};
