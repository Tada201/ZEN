import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import type { SearchResult, SearchSection } from "./searchTypes";

/**
 * Score how well a query matches a text string.
 * Returns 0–100: 100 exact, 50 starts-with, 10 contains.
 */
function calculateScore(query: string, text: string | undefined): number {
    if (!text || !query) return 0;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    if (lower === q) return 100;
    if (lower.startsWith(q)) return 50;
    if (lower.includes(q)) return 10;
    return 0;
}

/**
 * Search all active telemetry entities in the GTSM store.
 * Returns one SearchSection per layer type that has matches.
 */
export function searchEntities(query: string): SearchSection[] {
    const state = useGTSMStore.getState();
    const { selectedLayers } = state;

    const layerConfigs: { key: string; label: string; color: string }[] = [
        { key: "satellites", label: "Satellites", color: "#00E6E6" },
        { key: "flights", label: "Flights", color: "#39FF14" },
        { key: "earthquakes", label: "Earthquakes", color: "#FF2266" },
        { key: "military", label: "Military", color: "#FFCC00" },
        { key: "vessels", label: "Vessels", color: "#00CCFF" },
        { key: "naturalEvents", label: "Natural Events", color: "#FF4500" },
    ];

    const sections: SearchSection[] = [];

    for (const layer of layerConfigs) {
        if (!selectedLayers.includes(layer.key)) continue;

        const layerDataMap: Record<string, typeof state.satellites> = {
            satellites: state.satellites,
            flights: state.flights,
            earthquakes: state.earthquakes,
            military: state.military,
            vessels: state.vessels,
            naturalEvents: state.naturalEvents,
        };
        const entities = layerDataMap[layer.key] ?? [];
        if (!Array.isArray(entities) || entities.length === 0) continue;

        const results: SearchResult[] = [];

        for (const entity of entities) {
            let maxScore = calculateScore(query, entity.metadata?.name || entity.metadata?.callsign || entity.metadata?.flight || entity.metadata?.title || entity.id);

            // Also search all metadata values
            if (entity.metadata && typeof entity.metadata === "object") {
                for (const val of Object.values(entity.metadata)) {
                    if (typeof val === "string" || typeof val === "number") {
                        const s = calculateScore(query, String(val));
                        if (s > maxScore) maxScore = s;
                    }
                }
            }

            if (maxScore > 0) {
                const subLabel =
                    entity.metadata?.description ||
                    entity.metadata?.summary ||
                    entity.metadata?.airline ||
                    entity.metadata?.magnitude ||
                    "";

                results.push({
                    id: entity.id,
                    label: entity.metadata?.name || entity.metadata?.callsign || entity.metadata?.flight || entity.metadata?.title || entity.id,
                    subLabel: subLabel ? String(subLabel).substring(0, 80) : undefined,
                    score: maxScore,
                    lat: entity.position.lat,
                    lon: entity.position.lon,
                    type: "entity",
                    layerId: layer.key,
                    entity,
                });
            }
        }

        if (results.length > 0) {
            results.sort((a, b) => b.score - a.score);
            sections.push({
                title: layer.label,
                icon: null, // Will be set by the component
                results: results.slice(0, 5),
                maxScore: results[0].score,
            });
        }
    }

    return sections;
}
