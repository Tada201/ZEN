/**
 * Utility to process large arrays of items in chunks over multiple frames
 * to prevent main thread blocking (using requestIdleCallback or setTimeout fallback).
 * Ported from worldwideview-main.
 */

export class ChunkedProcessor {
    private currentRunId: number = 0;

    public processChunked<T>(
        items: T[],
        chunkSize: number,
        processFn: (chunk: T[]) => void
    ): Promise<boolean> {
        this.currentRunId++;
        const runId = this.currentRunId;

        return new Promise((resolve) => {
            if (!items || items.length === 0) {
                return resolve(true);
            }

            let index = 0;

            const processNextChunk = (deadline?: IdleDeadline) => {
                if (runId !== this.currentRunId) return resolve(false);

                do {
                    const chunk = items.slice(index, index + chunkSize);
                    if (chunk.length === 0) break;
                    processFn(chunk);
                    index += chunkSize;
                } while (
                    index < items.length &&
                    deadline &&
                    deadline.timeRemaining() > 5
                );

                if (index >= items.length) {
                    return resolve(true);
                }

                if (typeof requestIdleCallback !== "undefined") {
                    requestIdleCallback(processNextChunk, { timeout: 50 });
                } else {
                    setTimeout(() => processNextChunk(), 16);
                }
            };

            if (typeof requestIdleCallback !== "undefined") {
                requestIdleCallback(processNextChunk, { timeout: 50 });
            } else {
                setTimeout(processNextChunk, 16);
            }
        });
    }

    public cancel(): void {
        this.currentRunId++;
    }
}

export const globalChunkedProcessor = new ChunkedProcessor();
