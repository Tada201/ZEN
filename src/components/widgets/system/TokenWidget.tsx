import { useMemo, memo } from 'react';
import type { WidgetContext } from './types';

function getStatusColor(pct: number): string {
    if (pct < 50) return '#10b981';
    if (pct < 80) return '#f59e0b';
    return '#ef4444';
}

export const TokenWidget = memo(function TokenWidget({ context }: { context: WidgetContext }) {
    const { tokensUsed, tokensLimit, promptTokens, completionTokens, thinkingTokens } = context;

    const pct = useMemo(() => {
        if (tokensLimit <= 0) return 0;
        return Math.min(100, Math.round((tokensUsed / tokensLimit) * 100));
    }, [tokensUsed, tokensLimit]);

    const total = promptTokens + completionTokens + (thinkingTokens ?? 0);
    const promptPct = total > 0 ? Math.round((promptTokens / total) * 100) : 0;
    const completionPct = total > 0 ? Math.round((completionTokens / total) * 100) : 0;
    const thinkingPct = thinkingTokens && total > 0 ? Math.round((thinkingTokens / total) * 100) : 0;

    const color = getStatusColor(pct);

    return (
        <div className="widget-tokens">
            {/* Main progress bar */}
            <div className="widget-tokens__bar-wrap">
                <div className="widget-tokens__bar">
                    <div className="widget-tokens__fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="widget-tokens__pct" style={{ color }}>{pct}%</span>
            </div>

            {/* Usage line */}
            <div className="widget-tokens__usage">
                <span>{tokensUsed.toLocaleString()} / {tokensLimit.toLocaleString()}</span>
            </div>

            {/* Breakdown */}
            <div className="widget-tokens__breakdown">
                <span className="widget-tokens__tag widget-tokens__tag--user">PRM {promptPct}%</span>
                <span className="widget-tokens__tag widget-tokens__tag--ai">GEN {completionPct}%</span>
                {thinkingPct > 0 && (
                    <span className="widget-tokens__tag widget-tokens__tag--think">THK {thinkingPct}%</span>
                )}
            </div>
        </div>
    );
});
