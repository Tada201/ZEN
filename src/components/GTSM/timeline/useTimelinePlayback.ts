import { useEffect, useRef } from "react";
import { useGTSMStore } from "@/lib/stores/useGTSMStore";

/**
 * useTimelinePlayback — rAF-driven timeline animation loop.
 * When isPlaying is true, advances currentTime at the configured playbackSpeed.
 */
export function useTimelinePlayback() {
    const isPlaying = useGTSMStore((s) => s.isPlaying);
    const rafRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            return;
        }

        lastTimeRef.current = 0;

        const tick = (now: number) => {
            const state = useGTSMStore.getState();
            if (!state.isPlaying || !state.historyMode) {
                rafRef.current = 0;
                return;
            }

            if (lastTimeRef.current === 0) {
                lastTimeRef.current = now;
            }

            const delta = now - lastTimeRef.current;
            lastTimeRef.current = now;

            const range = state.historyRange;
            if (!range) {
                rafRef.current = 0;
                useGTSMStore.getState().setIsPlaying(false);
                return;
            }

            const newTime = state.currentTime + delta * state.playbackSpeed;
            const [, end] = range;

            if (newTime >= end) {
                useGTSMStore.getState().setCurrentTime(end);
                useGTSMStore.getState().setIsPlaying(false);
                rafRef.current = 0;
                return;
            }

            useGTSMStore.getState().setCurrentTime(newTime);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
        };
    }, [isPlaying]);
}
