import React, { useEffect } from "react";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { gtsmApi } from "@/api/gtsmApi";
import { useTimelinePlayback } from "./useTimelinePlayback";

const SPEEDS = [1, 2, 10, 100] as const;
const TIME_WINDOWS = ["1h", "6h", "24h", "48h", "7d"] as const;

function formatTimestamp(ms: number): string {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function formatDate(ms: number): string {
    const d = new Date(ms);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Timeline — Terminal-styled playback control bar.
 * Ported from worldwideview-main and adapted for Zen's eDEX aesthetic.
 */
export const Timeline: React.FC = () => {
    useTimelinePlayback();

    const isPlaying = useGTSMStore((s) => s.isPlaying);
    const setIsPlaying = useGTSMStore((s) => s.setIsPlaying);
    const playbackSpeed = useGTSMStore((s) => s.playbackSpeed);
    const setPlaybackSpeed = useGTSMStore((s) => s.setPlaybackSpeed);
    const historyMode = useGTSMStore((s) => s.historyMode);
    const setHistoryMode = useGTSMStore((s) => s.setHistoryMode);
    const currentTime = useGTSMStore((s) => s.currentTime);
    const setCurrentTime = useGTSMStore((s) => s.setCurrentTime);
    const setHistoryRange = useGTSMStore((s) => s.setHistoryRange);
    const historyRange = useGTSMStore((s) => s.historyRange);
    const timeWindow = useGTSMStore((s) => s.timeWindow);
    const setTimeWindow = useGTSMStore((s) => s.setTimeWindow);
    const collapsedPanels = useGTSMStore((s) => s.collapsedPanels);
    const togglePanel = useGTSMStore((s) => s.togglePanel);

    const isCollapsed = collapsedPanels.includes("timeline");

    useEffect(() => {
        if (!historyMode) return;
        let cancelled = false;
        void gtsmApi.getTelemetryStats().then((stats) => {
            if (cancelled || !stats.time_range) return;
            const start = stats.time_range.start * 1000;
            const end = stats.time_range.end * 1000;
            setHistoryRange([start, end]);
            setCurrentTime(end);
        }).catch(() => {
            // The panel stays usable with its configured time window when history is empty.
        });
        return () => { cancelled = true; };
    }, [historyMode, setCurrentTime, setHistoryRange]);

    const [start, end] = historyRange || [Date.now() - 86400000, Date.now()];
    const totalMs = end - start;
    const progress = totalMs > 0 ? Math.max(0, Math.min(1, (currentTime - start) / totalMs)) : 0;

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        const newTime = start + val * totalMs;
        setCurrentTime(newTime);
    };

    const togglePlayback = () => {
        if (!historyMode) {
            setHistoryMode(true);
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <div className={`border border-border bg-background/45 backdrop-blur-md transition-all duration-200 ${isCollapsed ? "h-8 overflow-hidden" : ""}`}>
            {/* Header */}
            <div
                className="flex h-8 min-h-8 items-center justify-between px-2 border-b border-border cursor-pointer select-none"
                onClick={() => togglePanel("timeline")}
            >
                <div className="flex items-center gap-2 text-foreground">
                    <WorkbenchIcon
                        name={isPlaying ? "solar:pause-bold" : "solar:play-bold"}
                        size={13}
                        className={isPlaying ? "text-green-400" : ""}
                    />
                    <span className="text-[10px] font-medium">Timeline</span>
                    {historyMode && (
                        <span className={`text-[9px] px-1.5 py-0.5 border ${isPlaying ? "text-success border-emerald-400/30 bg-success/10" : "text-primary border-primary/30 bg-primary/10"}`}>
                            {isPlaying ? "Playing" : "Replay"}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <div className="text-muted-foreground">
                        {isCollapsed
                            ? <WorkbenchIcon name="solar:alt-arrow-up-bold" size={11} />
                            : <WorkbenchIcon name="solar:alt-arrow-down-bold" size={11} />}
                    </div>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-2 flex flex-col gap-1.5">
                    {/* Mode toggle + Speed controls */}
                    <div className="flex items-center gap-2">
                        {/* Live / Playback toggle */}
                        <button
                            type="button"
                            onClick={() => {
                                setHistoryMode(!historyMode);
                                if (historyMode) setIsPlaying(false);
                            }}
                            className={`px-2 py-1 text-[8px] font-bold font-mono tracking-widest border transition-all cursor-pointer ${
                                historyMode
                                    ? "bg-primary/10 border-primary/60 text-primary"
                                    : "bg-muted/50 border-border text-foreground"
                            }`}
                        >
                            {historyMode ? "Replay" : "Live"}
                        </button>

                        {/* Play/Pause */}
                        <button
                            type="button"
                            onClick={togglePlayback}
                            disabled={!historyMode}
                            className={`w-7 h-7 flex items-center justify-center border transition-all cursor-pointer ${
                                historyMode
                                    ? isPlaying
                                        ? "bg-primary/10 border-primary/60 text-primary hover:bg-primary/15"
                                        : "bg-muted/50 border-border text-muted-foreground hover:border-border hover:text-foreground"
                                    : "bg-card/60 border-border text-foreground/80 cursor-not-allowed"
                            }`}
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying
                                ? <WorkbenchIcon name="solar:pause-bold" size={12} />
                                : <WorkbenchIcon name="solar:play-bold" size={12} />}
                        </button>

                        {/* Speed selector */}
                        <div className="flex items-center gap-0.5 ml-auto">
                            {SPEEDS.map((speed) => (
                                <button
                                    key={speed}
                                    type="button"
                                    onClick={() => setPlaybackSpeed(speed)}
                                    disabled={!historyMode}
                                    className={`px-1.5 py-0.5 text-[8px] font-bold font-mono border transition-all cursor-pointer ${
                                        playbackSpeed === speed
                                            ? "bg-primary/10 border-primary/60 text-primary"
                                            : "bg-transparent border-border text-muted-foreground hover:border-border hover:text-foreground"
                                    } ${!historyMode ? "opacity-40 cursor-not-allowed" : ""}`}
                                >
                                    {speed}×
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scrubber track */}
                    <div className="flex flex-col gap-1">
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.001}
                            value={progress}
                            onChange={handleScrub}
                            disabled={!historyMode}
                            className="w-full h-1 appearance-none bg-muted rounded-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0"
                            style={{
                                background: historyMode
                                    ? `linear-gradient(to right, hsl(var(--primary)) ${progress * 100}%, #27272a ${progress * 100}%)`
                                    : undefined,
                            }}
                        />
                    </div>

                    {/* Time window selector + Current time */}
                    <div className="flex items-center justify-between">
                        {/* Time window chips */}
                        <div className="flex items-center gap-0.5">
                            {TIME_WINDOWS.map((tw) => (
                                <button
                                    key={tw}
                                    type="button"
                                    onClick={() => setTimeWindow(tw)}
                                    className={`px-1.5 py-0.5 text-[7px] font-bold font-mono tracking-wider border transition-all cursor-pointer ${
                                        timeWindow === tw
                                            ? "bg-primary/10 border-primary/60 text-primary"
                                            : "bg-transparent border-border text-muted-foreground hover:border-border hover:text-foreground"
                                    }`}
                                >
                                    {tw}
                                </button>
                            ))}
                        </div>

                        {/* Current timestamp */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[7px] text-muted-foreground/70 font-bold uppercase tracking-wider">
                                {formatDate(currentTime)}
                            </span>
                            <span className="text-[10px] font-medium text-foreground tracking-wide">
                                {formatTimestamp(currentTime)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Timeline;
