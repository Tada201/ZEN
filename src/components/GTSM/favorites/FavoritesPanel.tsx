import React, { useState } from "react";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

const LAYER_COLORS: Record<string, string> = {
    satellite: "#00E6E6",
    flight: "#39FF14",
    earthquake: "#FF2266",
    military: "#FFCC00",
    vessel: "#00CCFF",
    natural_event: "#FF4500",
    weather: "#8B5CF6",
};

/**
 * FavoritesPanel — Terminal-styled bookmarked entities list.
 */
export const FavoritesPanel: React.FC = () => {
    const favorites = useGTSMStore((s) => s.favorites);
    const removeFavorite = useGTSMStore((s) => s.removeFavorite);
    const setFlyToRequest = useGTSMStore((s) => s.setFlyToRequest);
    const collapsedPanels = useGTSMStore((s) => s.collapsedPanels);
    const togglePanel = useGTSMStore((s) => s.togglePanel);
    const [search, setSearch] = useState("");

    const isCollapsed = collapsedPanels.includes("favorites");

    const filtered = favorites.filter(
        (f) =>
            f.label.toLowerCase().includes(search.toLowerCase()) ||
            f.layerLabel.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (fav: typeof favorites[0]) => {
        setFlyToRequest({ lat: fav.lat, lon: fav.lon, alt: fav.alt || 50000 });
    };

    return (
        <div className={`w-full border border-border bg-background/45 backdrop-blur-md transition-all duration-200 ${isCollapsed ? "h-8 overflow-hidden" : ""}`}>
            {/* Header */}
            <div
                className="flex h-8 min-h-8 items-center justify-between px-2 border-b border-border cursor-pointer select-none"
                onClick={() => togglePanel("favorites")}
            >
                <div className="flex items-center gap-2 text-foreground">
                    <WorkbenchIcon name="solar:star-bold" size={13} />
                    <span className="text-[10px] font-medium">Saved places</span>
                    {favorites.length > 0 && (
                        <span className="text-[7px] font-mono text-muted-foreground/70 bg-muted px-1 py-0.5 border border-border">
                            {favorites.length}
                        </span>
                    )}
                </div>
                <div className="text-muted-foreground">
                    {isCollapsed ? <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} /> : <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} />}
                </div>
            </div>

            {!isCollapsed && (
                <div className="p-2 flex flex-col gap-1.5">
                    {/* Search */}
                    {favorites.length > 3 && (
                        <div className="relative flex items-center bg-background/50 border border-border focus-within:border-cyan-400/70 transition-colors">
                            <div className="pl-2 pr-1 text-cyan-400/65">
                                <span className="text-[10px] font-mono font-bold">{">_"}</span>
                            </div>
                            <input
                                type="text"
                                placeholder="FILTER..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-transparent py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                                spellCheck={false}
                            />
                        </div>
                    )}

                    {/* Empty state */}
                    {favorites.length === 0 && (
                        <div className="py-4 text-center">
                            <WorkbenchIcon name="solar:star-outline" size={20} className="text-foreground/80 mx-auto mb-2" />
                            <span className="text-[9px] font-mono text-muted-foreground/70 tracking-wider">
                                NO_BOOKMARKS
                            </span>
                            <div className="text-[8px] font-mono text-foreground/80 mt-1">
                                Click ★ on a target to bookmark
                            </div>
                        </div>
                    )}

                    {/* Favorites list */}
                    {filtered.length > 0 && (
                        <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
                            {filtered.map((fav) => {
                                const layerColor = LAYER_COLORS[fav.layerId] || "#00ffff";
                                return (
                                    <div
                                        key={fav.id}
                                        className="flex items-center justify-between p-1.5 cursor-pointer transition-all border-l-2 hover:bg-muted/40"
                                        style={{ borderLeftColor: layerColor }}
                                        onClick={() => handleSelect(fav)}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div
                                                className="w-1.5 h-1.5 shrink-0"
                                                style={{ backgroundColor: layerColor }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[9px] font-bold text-foreground truncate tracking-wider">
                                                    {fav.label}
                                                </div>
                                                <div className="text-[7px] text-muted-foreground/70 truncate">
                                                    {fav.layerLabel}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFavorite(fav.id);
                                            }}
                                            className="shrink-0 p-1 text-muted-foreground/70 hover:text-destructive transition-colors cursor-pointer"
                                            title="Remove bookmark"
                                        >
                                            <WorkbenchIcon name="solar:trash-bin-minimalistic-bold" size={10} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {favorites.length > 0 && filtered.length === 0 && (
                        <div className="py-2 text-center">
                            <span className="text-[9px] font-mono text-muted-foreground/70 tracking-wider">
                                NO_MATCH
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FavoritesPanel;
