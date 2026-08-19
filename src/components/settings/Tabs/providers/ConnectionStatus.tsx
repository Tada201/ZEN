import { memo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils/style';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';

interface ConnectionStatusProps {
    providerKey: string;
    providerName: string;
}

export const ConnectionStatus = memo(({ providerKey, providerName }: ConnectionStatusProps) => {
    const connectionStatus = useSettingsStore(s => s.connectionStatuses[providerKey] || 'idle');
    const reducedMotion = useReducedMotion();

    if (connectionStatus === 'idle') return null;

    return (
        <motion.div 
            initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : motionDurations.fast, ease: motionEasings.standard }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                connectionStatus === 'success' 
                    ? "bg-success/5 border-emerald-500/10 text-success" 
                    : "bg-destructive/5 border-destructive/10 text-destructive"
            )}
        >
            <WorkbenchIcon name={connectionStatus === 'success' ? "lucide:shield-check" : "lucide:shield-alert"} size={14} />
            <div className="flex flex-col flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                    {connectionStatus === 'success' ? 'Connection ready' : 'Connection failed'}
                </span>
                <span className="mt-0.5 text-[10px] font-medium">
                    {connectionStatus === 'success' 
                        ? `Connection tested successfully for ${providerName}.`
                        : `Could not connect to ${providerName}.`}
                </span>
            </div>
        </motion.div>
    );
});
