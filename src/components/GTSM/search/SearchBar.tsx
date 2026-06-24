import React, { useEffect, useRef } from "react";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { useSearch } from "./useSearch";

/**
 * Highlight matching query text within a string.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const safeQuery = query.trim();
    if (!safeQuery) return <>{text}</>;
    const parts = text.split(new RegExp(`(${safeQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === safeQuery.toLowerCase() ? (
                    <strong key={i} className="text-primary font-semibold">{part}</strong>
                ) : (
                    part
                )
            )}
        </>
    );
}

const LAYER_COLORS: Record<string, string> = {
    satellites: "#00E6E6",
    flights: "#39FF14",
    earthquakes: "#FF2266",
    military: "#FFCC00",
    vessels: "#00CCFF",
    naturalEvents: "#FF4500",
};

const SECTION_ICONS: Record<string, string> = {
    "Satellites": "solar:satellite-bold-duotone",
    "Flights": "solar:plain-bold-duotone",
    "Earthquakes": "solar:pulse-bold-duotone",
    "Military": "solar:plain-bold-duotone",
    "Vessels": "solar:ship-bold-duotone",
    "Natural Events": "solar:danger-triangle-bold-duotone",
    "Places": "solar:map-point-wave-bold-duotone",
    "Recent": "solar:clock-circle-bold-duotone",
};

/**
 * SearchBar — Terminal-styled geocoding and entity search component.
 * Ported from worldwideview-main and adapted for Zen's eDEX aesthetic.
 */
export const SearchBar: React.FC = () => {
    const {
        query, setQuery, isOpen, setIsOpen,
        sections, selectedIndex, setSelectedIndex,
        flatResults, handleSelect, isSearching,
    } = useSearch();

    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsOpen]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const isArrow = e.key === "ArrowDown" || e.key === "ArrowUp";

        if (isArrow && !isOpen && !query.trim()) {
            e.preventDefault();
            setIsOpen(true);
            return;
        }

        if (!isOpen || flatResults.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % flatResults.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (flatResults[selectedIndex]) {
                handleSelect(flatResults[selectedIndex]);
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    // Scroll selected item into view
    useEffect(() => {
        if (isOpen && dropdownRef.current) {
            const selectedElement = dropdownRef.current.querySelector('[data-selected="true"]');
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: "nearest" });
            }
        }
    }, [selectedIndex, isOpen]);

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Input */}
            <div className="flex items-center border border-white/15 bg-black/45 focus-within:border-primary/60 transition-colors backdrop-blur-md">
                <div className="pl-2.5 pr-1.5 text-zinc-400">
                    <WorkbenchIcon name="solar:magnifer-linear" size={12} />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search locations and active entities"
                    className="w-full bg-transparent py-1.5 pr-2 text-[10px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
                    spellCheck={false}
                    autoComplete="off"
                />
                {isSearching && (
                    <div className="pr-2.5 text-primary/70">
                        <div className="h-2.5 w-2.5 border border-primary/40 border-t-primary animate-spin rounded-full" />
                    </div>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && sections.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute top-full left-0 right-0 mt-1 max-h-[380px] overflow-y-auto z-50 border border-white/10 bg-background/95 backdrop-blur-md shadow-2xl shadow-black/60"
                >
                    {sections.map((section) => (
                        <div key={section.title} className="p-2 border-b border-zinc-900/60 last:border-b-0">
                            {/* Section header */}
                            <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                                <WorkbenchIcon
                                    name={SECTION_ICONS[section.title] || "solar:hashtag-circle-bold-duotone"}
                                    size={10}
                                    className="text-zinc-400"
                                />
                                <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-zinc-500">
                                    {section.title}
                                </span>
                                <span className="text-[7px] font-mono text-zinc-600 ml-auto">
                                    {section.results.length}
                                </span>
                            </div>

                            {/* Results */}
                            <div className="flex flex-col gap-0.5">
                                {section.results.map((result) => {
                                    const isSelected = flatResults[selectedIndex]?.id === result.id;
                                    const layerColor = result.layerId ? LAYER_COLORS[result.layerId] : undefined;
                                    return (
                                        <button
                                            key={result.id}
                                            onClick={() => handleSelect(result)}
                                            data-selected={isSelected}
                                            className="w-full text-left px-2 py-1.5 transition-colors cursor-pointer border-l-2"
                                            style={{
                                                background: isSelected ? "hsl(var(--primary) / 0.12)" : "transparent",
                                                borderColor: isSelected
                                                    ? (layerColor || "hsl(var(--primary))")
                                                    : "transparent",
                                            }}
                                            onMouseEnter={() => setSelectedIndex(flatResults.findIndex((r) => r.id === result.id))}
                                        >
                                            <div className="flex items-center gap-2">
                                                {layerColor && (
                                                    <div
                                                        className="w-1.5 h-1.5 shrink-0"
                                                        style={{ backgroundColor: layerColor }}
                                                    />
                                                )}
                                                <span className="text-[10px] font-mono text-zinc-200 truncate">
                                                    <HighlightMatch text={result.label} query={query} />
                                                </span>
                                            </div>
                                            {result.subLabel && (
                                                <span className="text-[8px] font-mono text-zinc-500 truncate block mt-0.5 pl-3.5">
                                                    <HighlightMatch text={result.subLabel} query={query} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* No results */}
            {isOpen && query.trim() && sections.length === 0 && !isSearching && (
                <div className="absolute top-full left-0 right-0 mt-1 p-3 z-50 border border-white/10 bg-background/95 backdrop-blur-md text-center">
                    <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
                        NO_MATCH_FOUND
                    </span>
                </div>
            )}
        </div>
    );
};

export default SearchBar;
