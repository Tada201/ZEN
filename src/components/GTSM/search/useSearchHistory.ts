import { useState, useCallback } from "react";
import type { SearchResult } from "./searchTypes";

const STORAGE_KEY = "zen_search_history";
const MAX_HISTORY = 10;

function readHistory(): SearchResult[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as SearchResult[]) : [];
    } catch {
        return [];
    }
}

function writeHistory(history: SearchResult[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
        // Storage quota exceeded — silently ignore.
    }
}

export function useSearchHistory() {
    const [history, setHistory] = useState<SearchResult[]>(readHistory);

    const addToHistory = useCallback((result: SearchResult) => {
        setHistory((prev) => {
            const deduped = prev.filter((r) => r.id !== result.id);
            const next = [result, ...deduped].slice(0, MAX_HISTORY);
            writeHistory(next);
            return next;
        });
    }, []);

    const clearHistory = useCallback(() => {
        writeHistory([]);
        setHistory([]);
    }, []);

    return { history, addToHistory, clearHistory };
}
