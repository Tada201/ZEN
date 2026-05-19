import { memo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils/style';

interface ConnectionStatusProps {
    providerKey: string;
    providerName: string;
}

export const ConnectionStatus = memo(({ providerKey, providerName }: ConnectionStatusProps) => {
    const connectionStatus = useSettingsStore(s => s.connectionStatuses[providerKey] || 'idle');

    if (connectionStatus === 'idle') return null;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                connectionStatus === 'success' 
                    ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" 
                    : "bg-red-500/5 border-red-500/10 text-red-400"
            )}
        >
            <WorkbenchIcon name={connectionStatus === 'success' ? "lucide:shield-check" : "lucide:shield-alert"} size={14} />
            <div className="flex flex-col flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                    {connectionStatus === 'success' ? 'Protocol Synchronized' : 'Handshake Failed'}
                </span>
                <span className="text-[10px] opacity-60 font-medium mt-0.5">
                    {connectionStatus === 'success' 
                        ? `Telemetry established with ${providerName}.` 
                        : `Connection refused by ${providerName}.`}
                </span>
            </div>
        </motion.div>
    );
});