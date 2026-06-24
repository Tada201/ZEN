import type { SearchResult, SearchSection, PlaceCategory } from "./searchTypes";
import { gtsmApi, type GeocodingResult } from "@/api/gtsmApi";

/**
 * Search places through Zen's typed Rust geocoding service.
 * Returns a SearchSection with up to 5 place results.
 */
export async function searchLocations(query: string): Promise<SearchSection | null> {
    try {
        const data = await gtsmApi.geocodeSearch(query, 5);
        if (data.length === 0) return null;

        const results: SearchResult[] = data.map(
            (item: GeocodingResult, i: number) => {
                const category = categorizePlaceType(item.place_type);
                return {
                    id: `geocode-${item.lat}-${item.lon}-${i}`,
                    label: item.display_name?.split(",")[0] || item.display_name || query,
                    subLabel: item.display_name || "",
                    score: 100 - i,
                    lat: item.lat,
                    lon: item.lon,
                    type: category === "region" ? "country" as const : "place" as const,
                    placeCategory: category,
                };
            }
        );

        return {
            title: "Places",
            icon: null,
            results: results.slice(0, 5),
            maxScore: results[0]?.score ?? 0,
        };
    } catch (err) {
        console.error("[SearchLocations] Geocoding request failed:", err);
        return null;
    }
}

function categorizePlaceType(placeType: string): PlaceCategory {
    if (["country", "state", "region", "administrative"].includes(placeType.toLowerCase())) {
        return "region";
    }
    return "address";
}
