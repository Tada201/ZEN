import { memo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
    providerKey: string;
    providerName: string;
}

export const ConnectionStatus = memo(({ providerKey, providerName }: ConnectionStatusProps) => {
    const connectionStatus = useSettingsStore(s => {
        const statuses = s.connectionStatuses as unknown as Record<string, string> || {};
        return statuses[providerKey] || 'idle';
    });

    if (connectionStatus === 'idle') return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "flex items-center gap-3 p-4 rounded-xl border transition-all",
                connectionStatus === 'success'
                    ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80"
                    : "bg-red-500/5 border-red-500/10 text-red-400/80"
            )}
        >
            <WorkbenchIcon name={connectionStatus === 'success' ? "codicon:pass" : "codicon:error"} size={16} />
            <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest">
                    {connectionStatus === 'success' ? 'Protocol Synchronized' : 'Handshake Failed'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                    {connectionStatus === 'success'
                        ? `Telemetry established with ${providerName}.`
                        : `Connection refused by ${providerName} node.`}
                </span>
            </div>
        </motion.div>
    );
});