import { memo } from "react";
import type { WidgetContext } from './types';

export const ModelWidget = memo(function ModelWidget({ context }: { context: WidgetContext }) {
    return (
        <div className="widget-status-card">
            <span className="widget-status-card__value">
                {context.activeModel?.toUpperCase() || 'NONE'}
            </span>
        </div>
    );
});
