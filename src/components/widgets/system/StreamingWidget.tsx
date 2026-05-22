import { memo } from "react";
import type { WidgetContext } from './types';

export const StreamingWidget = memo(function StreamingWidget({ context }: { context: WidgetContext }) {
    return (
        <div className={`widget-status-card ${context.isStreaming ? 'widget-status-card--active' : ''}`}>
            <span className="widget-status-card__indicator" data-active={context.isStreaming || undefined} />
            <span className="widget-status-card__value">
                {context.isStreaming ? 'STREAMING' : 'IDLE'}
            </span>
        </div>
    );
});
