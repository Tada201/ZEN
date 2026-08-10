import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveAgentTask } from '@/lib/stores/agentActivityStore';

/**
 * Carries the running/done/failed/pending state as a single Lucide icon with
 * the same tone palette as the chat timeline (`ToolCallCard`):
 *   running    → primary (spinning Loader2)
 *   completed  → success (CheckCircle2)
 *   failed     → destructive (XCircle)
 *   pending    → warning (Clock)
 */
export function AgentStatusIcon({ status }: { status: ActiveAgentTask['status'] }) {
    const tone = status === 'completed'
        ? 'text-success/80'
        : status === 'failed'
            ? 'text-destructive/80'
            : status === 'in_progress'
                ? 'text-primary/80'
                : 'text-warning/80';
    const Icon = status === 'completed'
        ? CheckCircle2
        : status === 'failed'
            ? XCircle
            : status === 'in_progress'
                ? Loader2
                : Clock;
    return (
        <Icon
            className={cn("h-3.5 w-3.5", tone, status === 'in_progress' && "animate-spin")}
            aria-hidden="true"
        />
    );
}
