import type { SpatialEntity } from "@/lib/stores/useGTSMStore";

export type PlaceCategory = "address" | "establishment" | "landmark" | "region";

export interface SearchResult {
    id: string;
    label: string;
    subLabel?: string;
    score: number;
    lat: number;
    lon: number;
    type: "country" | "entity" | "place";
    layerId?: string;
    entity?: SpatialEntity;
    placeCategory?: PlaceCategory;
}

export interface SearchSection {
    title: string;
    icon: React.ReactNode;
    results: SearchResult[];
    maxScore: number;
}
