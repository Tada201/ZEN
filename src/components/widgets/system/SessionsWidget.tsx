import { memo } from "react";
import type { WidgetContext } from './types';

export const SessionsWidget = memo(function SessionsWidget({ context }: { context: WidgetContext }) {
    return (
        <div className="widget-status-card">
            <span className="widget-status-card__value">{context.sessionCount}</span>
        </div>
    );
});
