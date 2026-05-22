import { memo } from "react";
import type { WidgetContext } from './types';

export const ProviderWidget = memo(function ProviderWidget({ context }: { context: WidgetContext }) {
    return (
        <div className={`widget-status-card ${context.activeProvider === 'ollama' ? (context.ollamaConnected ? 'widget-status-card--good' : 'widget-status-card--error') : 'widget-status-card--good'}`}>
            <span className="widget-status-card__indicator" data-active={context.activeProvider === 'ollama' ? (context.ollamaConnected || undefined) : true} />
            <span className="widget-status-card__value">
                {context.activeProvider?.toUpperCase() || 'NONE'}
            </span>
        </div>
    );
});
