import React from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { PROVIDER_ICONS } from './constants';
import { cn } from '@/lib/utils/style';

interface ProviderHeaderProps {
    currentProvider: any;
}

export const ProviderHeader = React.memo(({ currentProvider }: ProviderHeaderProps) => {
    const testingConnection = useSettingsStore(s => s.testingConnections[currentProvider?.key] || false);
    const connectionStatus = useSettingsStore(s => s.connectionStatuses[currentProvider?.key] || 'idle');
    const runConnectionTest = useSettingsStore(s => s.testProviderConnection);

    if (!currentProvider) return null;

    return (
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center shrink-0">
                    {PROVIDER_ICONS[currentProvider.key] || <WorkbenchIcon name="lucide:plug-zap" size={14} />}
                </div>
                <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-bold text-foreground shrink-0">{currentProvider.name}</span>
                    <span className="text-[11px] text-muted-foreground/50 truncate">· {currentProvider.description}</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                    "inline-flex items-center gap-1.5 px-2 h-5.5 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                    connectionStatus === 'success' && "bg-success/10 text-success",
                    connectionStatus === 'error' && "bg-destructive/10 text-destructive",
                    connectionStatus !== 'success' && connectionStatus !== 'error' && "bg-warning/10 text-warning"
                )}>
                    <span className={cn(
                        "w-1 h-1 rounded-full",
                        connectionStatus === 'success' && "bg-success",
                        connectionStatus === 'error' && "bg-rose-400",
                        connectionStatus !== 'success' && connectionStatus !== 'error' && "bg-amber-400"
                    )} />
                    {connectionStatus === 'success' ? 'Live' : connectionStatus === 'error' ? 'Error' : 'Idle'}
                </span>

                <button
                    className="h-7 px-2.5 text-[11px] font-bold rounded-lg border border-border/60 hover:bg-muted transition-colors disabled:opacity-50"
                    onClick={() => runConnectionTest(currentProvider.key)}
                    disabled={testingConnection}
                >
                    {testingConnection ? '...' : 'Ping'}
                </button>

                {currentProvider.apiKeyLink && (
                    <a href={currentProvider.apiKeyLink} target="_blank" rel="noreferrer" className="h-7 px-2 text-[11px] font-bold rounded-lg border border-border/60 hover:bg-muted transition-colors inline-flex items-center gap-1 text-muted-foreground/60 hover:text-foreground">
                        Docs
                        <WorkbenchIcon name="lucide:external-link" size={10} />
                    </a>
                )}
            </div>
        </div>
    );
});
