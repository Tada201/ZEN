import React, { useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';
import type { EntityService } from '../../services/EntityService';
import { useCesiumClusters } from './cesium/useCesiumClusters';
import { useCesiumEntityLayers } from './cesium/useCesiumEntityLayers';
import { useCesiumMapControls } from './cesium/useCesiumMapControls';
import { useCesiumViewerSetup } from './cesium/useCesiumViewerSetup';
import { useCesiumVisualLayers } from './cesium/useCesiumVisualLayers';
import type { CesiumDataSources, CesiumEntityIds } from './cesium/cesiumMapTypes';

import "cesium/Build/Cesium/Widgets/widgets.css";
import '../widgets/workbench/operational-map.css';

export const CesiumMapRenderer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<Cesium.Viewer | null>(null);
    const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
    const googleTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
    const flightPositionsRef = useRef<Map<string, Cesium.SampledPositionProperty>>(new Map());
    const [expandedHubId, setExpandedHubId] = useState<string | null>(null);

    const satellites = useGTSMStore(state => state.satellites);
    const flights = useGTSMStore(state => state.flights);
    const earthquakes = useGTSMStore(state => state.earthquakes);
    const military = useGTSMStore(state => state.military);
    const vessels = useGTSMStore(state => state.vessels);
    const selectedLayers = useGTSMStore(state => state.selectedLayers);
    const targetLocked = useGTSMStore(state => state.targetLocked);
    const setTargetLocked = useGTSMStore(state => state.setTargetLocked);
    const setViewportCenter = useGTSMStore(state => state.setViewportCenter);
    const setSelectedTarget = useGTSMStore(state => state.setSelectedTarget);
    const selectedTarget = useGTSMStore(state => state.selectedTarget);
    const imageryProvider = useGTSMStore(state => state.imageryProvider);
    const googleMapsApiKey = useGTSMStore(state => state.googleMapsApiKey);
    const viewMode = useGTSMStore(state => state.viewMode);
    const viewportCenter = useGTSMStore(state => state.viewportCenter);
    const resolutionScale = useGTSMStore(state => state.resolutionScale);
    const antiAliasing = useGTSMStore(state => state.antiAliasing);
    const tileDetail = useGTSMStore(state => state.tileDetail);
    const shadows = useGTSMStore(state => state.shadows);
    const globeLighting = useGTSMStore(state => state.globeLighting);
    const showFps = useGTSMStore(state => state.showFps);
    const flyToRequest = useGTSMStore(state => state.flyToRequest);
    const setFlyToRequest = useGTSMStore(state => state.setFlyToRequest);

    const activeFlights = selectedLayers.includes('flights') ? flights : [];
    const activeVessels = selectedLayers.includes('vessels') ? vessels : [];
    const activeMilitary = selectedLayers.includes('military') ? military : [];
    const allClusteredUnits = useCesiumClusters(activeFlights, activeVessels, activeMilitary, expandedHubId);

    const entityIdsRef = useRef<CesiumEntityIds>({
        flights: new Set(),
        earthquakes: new Set(),
        military: new Set(),
        vessels: new Set(),
        naturalEvents: new Set(),
    });

    const dataSourcesRef = useRef<CesiumDataSources>({
        flights: null,
        military: null,
        earthquakes: null,
        vessels: null,
        naturalEvents: null,
        connectors: null,
        cables: null,
        nuclear: null
    });

    const entityServiceRef = useRef<EntityService | null>(null);

    useCesiumViewerSetup({
        containerRef,
        viewerRef,
        handlerRef,
        dataSourcesRef,
        entityServiceRef,
        viewMode,
        setViewportCenter,
        setSelectedTarget,
        setTargetLocked,
        setExpandedHubId,
    });

    useCesiumMapControls({
        viewerRef,
        googleTilesetRef,
        viewMode,
        imageryProvider,
        googleMapsApiKey,
        satellites,
        flights,
        earthquakes,
        military,
        vessels,
        selectedTarget,
        targetLocked,
        flyToRequest,
        setFlyToRequest,
        setSelectedTarget,
        setTargetLocked,
        resolutionScale,
        antiAliasing,
        tileDetail,
        shadows,
        globeLighting,
        showFps,
    });

    useCesiumEntityLayers({
        viewerRef,
        dataSourcesRef,
        entityIdsRef,
        entityServiceRef,
        flightPositionsRef,
        satellites,
        flights,
        earthquakes,
        military,
        vessels,
        selectedLayers,
        selectedTarget,
        viewportCenter,
        expandedHubId,
        allClusteredUnits,
    });

    useCesiumVisualLayers({
        viewerRef,
        dataSourcesRef,
        selectedTarget,
        satellites,
        selectedLayers,
    });

    return <div ref={containerRef} className="flex-1 h-full z-0 relative" />;
};
