import type { SystemMetrics } from '@/hooks/useSysMetrics';

export interface WidgetContext extends SystemMetrics {
    // LLM state
    activeModel: string | null;
    activeProvider: string | null;
    isStreaming: boolean;
    apiLatencyMs: number | null;

    // Token tracking
    tokensUsed: number;
    tokensLimit: number;
    promptTokens: number;
    completionTokens: number;
    thinkingTokens: number | null;

    // App state
    sessionCount: number;
    appUptimeSecs: number;
    ollamaConnected: boolean;
}
