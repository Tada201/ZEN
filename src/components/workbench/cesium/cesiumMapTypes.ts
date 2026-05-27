import type { MutableRefObject } from 'react';
import * as Cesium from 'cesium';
import type { EntityService } from '../../../services/EntityService';

export interface CesiumDataSources {
    flights: Cesium.CustomDataSource | null;
    military: Cesium.CustomDataSource | null;
    earthquakes: Cesium.CustomDataSource | null;
    vessels: Cesium.CustomDataSource | null;
    naturalEvents: Cesium.CustomDataSource | null;
    connectors: Cesium.CustomDataSource | null;
    cables: Cesium.CustomDataSource | null;
    nuclear: Cesium.CustomDataSource | null;
}

export interface CesiumEntityIds {
    flights: Set<string>;
    earthquakes: Set<string>;
    military: Set<string>;
    vessels: Set<string>;
    naturalEvents: Set<string>;
}

export interface CesiumClusterAssignments {
    assignments: Map<string, { hubId: string; offsetPos: Cesium.Cartesian3; isExpanded: boolean }>;
    hubSet: Set<string>;
    hubChildCounts: Map<string, number>;
}

export type CesiumViewerRef = MutableRefObject<Cesium.Viewer | null>;
export type CesiumHandlerRef = MutableRefObject<Cesium.ScreenSpaceEventHandler | null>;
export type CesiumTilesetRef = MutableRefObject<Cesium.Cesium3DTileset | null>;
export type CesiumDataSourcesRef = MutableRefObject<CesiumDataSources>;
export type CesiumEntityIdsRef = MutableRefObject<CesiumEntityIds>;
export type CesiumEntityServiceRef = MutableRefObject<EntityService | null>;
