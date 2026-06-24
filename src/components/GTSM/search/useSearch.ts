import { useState, useEffect, useMemo } from "react";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import { useSearchHistory } from "./useSearchHistory";
import { searchEntities } from "./searchEntities";
import { searchLocations } from "./searchLocations";
import type { SearchResult, SearchSection } from "./searchTypes";

export type { SearchResult, SearchSection };

export function useSearch() {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [liveSections, setLiveSections] = useState<SearchSection[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const { history, addToHistory, clearHistory } = useSearchHistory();

    const sections: SearchSection[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            if (history.length === 0) return [];
            return [{
                title: "Recent",
                icon: null,
                results: history,
                maxScore: 0,
            }];
        }
        const matchingHistory = history.filter(
            (r) => r.label.toLowerCase().includes(q)
                || (r.subLabel && r.subLabel.toLowerCase().includes(q))
        );
        const recentSection: SearchSection | null = matchingHistory.length > 0
            ? { title: "Recent", icon: null, results: matchingHistory, maxScore: 99 }
            : null;
        return recentSection ? [recentSection, ...liveSections] : liveSections;
    }, [query, history, liveSections]);

    const flatResults = sections.flatMap((s) => s.results);

    useEffect(() => {
        let isStale = false;

        const run = async () => {
            if (!query.trim()) {
                setLiveSections([]);
                setSelectedIndex(0);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);

            // Search entities synchronously from the store
            const entitySections = searchEntities(query);

            // Search locations via Nominatim (debounced by the timeout)
            const locationSection = await searchLocations(query);

            if (isStale) return;

            const newSections = [...entitySections];
            if (locationSection) newSections.push(locationSection);
            newSections.sort((a, b) => b.maxScore - a.maxScore);

            setLiveSections(newSections);
            setSelectedIndex(0);
            setIsSearching(false);
        };

        const timer = setTimeout(run, 300);
        return () => { isStale = true; clearTimeout(timer); };
    }, [query]);

    const handleSelect = (result: SearchResult) => {
        addToHistory(result);
        setIsOpen(false);
        setQuery("");

        const { setFlyToRequest, setSelectedTarget } = useGTSMStore.getState();

        if (result.type === "entity" && result.entity) {
            // Fly to entity and select it
            setFlyToRequest({
                lat: result.lat,
                lon: result.lon,
                alt: result.entity.position.alt || 50000,
            });
            setSelectedTarget(result.entity);
        } else if (result.type === "country" || result.type === "place") {
            // Fly to place — use appropriate altitude based on category
            const alt = result.placeCategory === "region" ? 8_000_000 : 50_000;
            setFlyToRequest({ lat: result.lat, lon: result.lon, alt });
        }
    };

    return {
        query,
        setQuery,
        isOpen,
        setIsOpen,
        sections,
        selectedIndex,
        setSelectedIndex,
        flatResults,
        handleSelect,
        clearHistory,
        isSearching,
    };
}
