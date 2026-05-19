/**
 * Core type definitions for Cesium geo entities.
 * Ported from worldwideview-main PluginTypes.
 */

export interface GeoEntity {
    id: string;
    pluginId?: string;
    latitude: number;
    longitude: number;
    altitude?: number;
    heading?: number;
    pitch?: number;
    roll?: number;
    velocity?: number;
    label?: string;
    iconUrl?: string;
    modelUrl?: string;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface CesiumEntityOptions {
    color?: string;
    outlineColor?: string;
    outlineWidth?: number;
    size?: number;
    iconUrl?: string;
    iconScale?: number;
    labelText?: string;
    labelFont?: string;
    type?: "point" | "billboard" | "model";
    modelUrl?: string;
    modelScale?: number;
    modelMinPixelSize?: number;
    modelHeadingOffset?: number;
    disableDepthTestDistance?: number;
    distanceDisplayCondition?: { near: number; far: number };
    pixelOffset?: { x: number; y: number };
    clampToGround?: boolean;
    [key: string]: unknown;
}

export interface FilterDefinition {
    id: string;
    label: string;
    type: "select" | "range";
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
}

export interface LayerConfig {
    id: string;
    name: string;
    enabled: boolean;
    visible?: boolean;
    minZoom?: number;
    maxZoom?: number;
    opacity?: number;
}

export interface WorldPlugin {
    id: string;
    name: string;
    getLayerConfig?: () => { disableDefaultRendering?: boolean };
    getFilterDefinitions?: () => FilterDefinition[];
    getGlobeComponent?: () => React.ComponentType<{ viewer: unknown; enabled: boolean }>;
}
