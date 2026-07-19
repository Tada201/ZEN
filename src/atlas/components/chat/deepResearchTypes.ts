import type { Message } from "./types";

/** Local shape used by the deep-research timeline rendering. */
export interface ResearchStep {
    id?: string;
    text: string;
    status: "pending" | "running" | "completed" | "error";
    agentIndex?: number;
    agentName?: string;
    phase?: string;
    durationSecs?: number;
    subQuestion?: string;
    progressPercent?: number;
}

/** Derived per-agent summary used by the ResearchAgentCard surface. */
export interface AgentInfo {
    index: number;
    name: string;
    subQuestion: string;
    steps: ResearchStep[];
    completed: number;
    total: number;
    activeText: string;
    allDone: boolean;
    durationSecs?: number;
    hasError?: boolean;
}

export interface DeepResearchRunMessageProps {
    message: Message;
    compact?: boolean;
    isChatStreaming?: boolean;
    messages?: Message[];
    onContinueResearch?: (request: string) => void;
    onAbort?: () => void;
}
