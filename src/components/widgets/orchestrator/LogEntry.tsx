import React from 'react';
import { MarkdownContent } from '@/atlas/components/chat/MarkdownContent';
import { humanizeToolName } from '@/atlas/components/chat/ToolCallCard';
import type { AgentActivity } from '@/lib/stores/agentActivityStore';

const REDACTED_KEYS = /^(api[_-]?key|authorization|bearer|credential|password|secret|token)$/i;

function redactValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactValue);
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (REDACTED_KEYS.test(key)) {
                result[key] = '[redacted]';
            } else {
                result[key] = redactValue(nested);
            }
        }
        return result;
    }
    return value;
}

/**
 * Sanctioned path to render secret-shaped metadata. Replaces any
 * `api_key / bearer / credential / password / secret / token / authorization`
 * value with `[redacted]` before serialisation. This is the ONLY path the
 * panel uses to expose deep tool payload — even at the nested "Raw payload"
 * audit disclosure.
 */
export function redactLogMetadata(metadata: unknown): string {
    return JSON.stringify(redactValue(metadata), null, 2);
}

function readNested(
    obj: Record<string, unknown> | null | undefined,
    path: readonly string[],
): unknown {
    let current: unknown = obj;
    for (const key of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return value.slice(0, Math.max(0, max - 1)) + '\u2026';
}

/**
 * Pinned label set for the user-facing summary. The verifier (8d) anchors
 * on these literal strings so a regression that reverts to a raw JSON dump
 * or drops a label will fail the contract.
 */
const SUMMARY_LABELS = {
    Tool: 'Tool',
    Target: 'Target',
    Status: 'Status',
    Result: 'Result',
    Error: 'Error',
    Duration: 'Duration',
} as const;

/**
 * Curated user-facing summary of heterogeneous tool_call metadata. Only a
 * pinned set of well-known keys is surfaced (no agentIds, no tool_call_id,
 * no raw payloads, no LLM-controlled blobs). Anything unmapped is left to
 * the nested "Raw payload" audit disclosure.
 */
export function summarizeToolMetadata(
    metadata: Record<string, unknown> | null | undefined,
): { label: string; value: string }[] {
    if (!metadata) return [];
    const fields: { label: string; value: string }[] = [];

    const toolName =
        readNested(metadata, ['toolCall', 'toolName']) ??
        readNested(metadata, ['toolCall', 'name']) ??
        readNested(metadata, ['toolCallPreview', 'toolName']) ??
        readNested(metadata, ['toolName']) ??
        readNested(metadata, ['name']);
    if (typeof toolName === 'string' && toolName) {
        fields.push({ label: SUMMARY_LABELS.Tool, value: humanizeToolName(toolName) });
    }

    const targetCandidates = [
        readNested(metadata, ['toolCall', 'input', 'path']),
        readNested(metadata, ['toolCall', 'input', 'file_path']),
        readNested(metadata, ['toolCall', 'input', 'url']),
        readNested(metadata, ['toolCall', 'input', 'query']),
        readNested(metadata, ['toolCall', 'input', 'command']),
        readNested(metadata, ['args', 'path']),
        readNested(metadata, ['path']),
        readNested(metadata, ['target']),
    ];
    for (const candidate of targetCandidates) {
        if (typeof candidate === 'string' && candidate) {
            fields.push({ label: SUMMARY_LABELS.Target, value: truncate(candidate, 80) });
            break;
        }
    }

    const status =
        readNested(metadata, ['status']) ?? readNested(metadata, ['toolResult', 'status']);
    if (typeof status === 'string' && status) {
        fields.push({ label: SUMMARY_LABELS.Status, value: status.replace(/_/g, ' ') });
    }

    const error =
        readNested(metadata, ['error']) ??
        readNested(metadata, ['toolResult', 'error']) ??
        readNested(metadata, ['toolCall', 'error']);
    if (typeof error === 'string' && error) {
        fields.push({ label: SUMMARY_LABELS.Error, value: truncate(error, 80) });
    }

    const result =
        readNested(metadata, ['toolResult', 'summary']) ??
        readNested(metadata, ['result', 'summary']) ??
        readNested(metadata, ['summary']);
    if (typeof result === 'string' && result) {
        fields.push({ label: SUMMARY_LABELS.Result, value: truncate(result, 80) });
    }

    const durationMs =
        readNested(metadata, ['durationMs']) ??
        readNested(metadata, ['toolResult', 'durationMs']) ??
        readNested(metadata, ['toolCall', 'durationMs']);
    if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
        fields.push({
            label: SUMMARY_LABELS.Duration,
            value: `${Math.round(durationMs)}ms`,
        });
    }

    return fields;
}

export function LogEntry({ log, isLast }: { log: AgentActivity; isLast: boolean }) {
    const time = new Date(log.timestamp).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    const isChatType = log.type === 'commentary' || log.type === 'status';

    return (
        <div
            className={`log-entry log-entry--${log.type} ${
                isLast ? 'log-entry--latest' : ''
            } ${isChatType ? 'log-entry--bubble' : ''} group py-1.5`}
        >
            {!isChatType && (
                <span className="log-entry__time text-[11px] font-mono text-muted-foreground group-hover:text-muted-foreground transition-colors">
                    [{time}]
                </span>
            )}
            {!isChatType && (
                <span className="log-entry__type text-[11px] font-bold tracking-wider uppercase text-muted-foreground w-[92px] shrink-0">
                    {log.type.toUpperCase().replace('_', ' ')}
                </span>
            )}

            <div
                className={`flex flex-col gap-1.5 flex-grow min-w-0 ${
                    isChatType ? 'chat-bubble-style' : ''
                }`}
            >
                <div className="log-entry__content text-[12px] text-foreground leading-relaxed group-hover:text-foreground transition-colors">
                    <MarkdownContent content={log.message || log.type} />
                </div>

                {log.type === 'tool_call' && log.metadata && (
                    <details
                        data-testid="log-entry-technical-details"
                        className="log-entry__meta rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 transition-colors"
                    >
                        <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wide text-muted-foreground">
                            Technical details
                        </summary>
                        <ToolCallMetaSummary metadata={log.metadata} />
                        <details className="log-entry__meta-raw mt-1.5 border-t border-border/40 pt-1.5">
                            <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                Raw payload (redacted)
                            </summary>
                            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-muted-foreground/70 custom-scrollbar">
                                {redactLogMetadata(log.metadata)}
                            </pre>
                        </details>
                    </details>
                )}
            </div>
        </div>
    );
}

/**
 * Internal-only summary renderer for tool_call metadata. Memoised so the
 * disclosure (whose `open` attribute would otherwise ripple re-renders into
 * every `<MemoizedLogEntry />`) stays quiet when only the timestamp ticks.
 */
const ToolCallMetaSummary = React.memo(function ToolCallMetaSummary({
    metadata,
}: {
    metadata: Record<string, unknown>;
}) {
    const fields = summarizeToolMetadata(metadata);
    if (fields.length === 0) return null;
    return (
        <dl className="log-entry__meta-grid mt-1.5 mb-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[10.5px]">
            {fields.map((field) => (
                <React.Fragment key={field.label}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="truncate text-foreground" title={field.value}>
                        {field.value}
                    </dd>
                </React.Fragment>
            ))}
        </dl>
    );
});

export const MemoizedLogEntry = React.memo(LogEntry);
