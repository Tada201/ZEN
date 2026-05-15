import { useState, useEffect, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface Hook {
    id: string;
    name: string;
    trigger: 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'PostEdit' | 'UserStop';
    patterns?: string[];
    enabled: boolean;
    trigger_count: number;
}

interface HookLogEntry {
    timestamp: number;
    hook_id: string;
    hook_name: string;
    trigger: string;
    result: 'success' | 'blocked' | 'error';
    message?: string;
}

const TRIGGER_CONFIG: Record<Hook['trigger'], { icon: string; label: string; color: string }> = {
    SessionStart: { icon: 'codicon:play', label: 'Session Start', color: 'text-amber-400' },
    PreToolUse: { icon: 'codicon:zap', label: 'Pre-Tool', color: 'text-rose-400' },
    PostToolUse: { icon: 'codicon:check', label: 'Post-Tool', color: 'text-purple-400' },
    PostEdit: { icon: 'codicon:edit', label: 'Post-Edit', color: 'text-indigo-400' },
    UserStop: { icon: 'codicon:debug-stop', label: 'User Stop', color: 'text-orange-400' },
};

const FALLBACK_HOOKS: Hook[] = [
    {
        id: 'security-scanner',
        name: 'Security Scanner',
        trigger: 'PreToolUse',
        patterns: ['exec', 'shell', 'sudo'],
        enabled: true,
        trigger_count: 12,
    },
    {
        id: 'post-edit-lint',
        name: 'Post-Edit Lint',
        trigger: 'PostEdit',
        patterns: [],
        enabled: true,
        trigger_count: 47,
    },
    {
        id: 'session-greeting',
        name: 'Session Greeting',
        trigger: 'SessionStart',
        patterns: [],
        enabled: false,
        trigger_count: 0,
    },
];

export const HooksSettings = memo(({ embedded }: { embedded?: boolean }) => {
    const { hooks, updateSetting } = useSettingsStore(useShallow(s => ({
        hooks: s.hooks as Record<string, boolean>,
        updateSetting: s.updateSetting,
    })));

    const [logs, setLogs] = useState<HookLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showLogs, setShowLogs] = useState(false);
    const [hookDetails, setHookDetails] = useState<Hook[]>(FALLBACK_HOOKS);

    const loadHooks = useCallback(async () => {
        try {
            const hookList = await invoke<Hook[]>('list_hooks');
            if (hookList?.length) {
                setHookDetails(hookList);
            }
        } catch (err) {
            console.warn('[HooksSettings] Tauri backend unavailable, using fallback hooks');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHooks();
    }, [loadHooks]);

    useEffect(() => {
        if (!showLogs) return;
        const fetchLogs = async () => {
            try {
                const logEntries = await invoke<HookLogEntry[]>('get_hook_logs');
                setLogs(logEntries?.slice(0, 50) || []);
            } catch {
                setLogs([]);
            }
        };
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, [showLogs]);

    const toggleHook = (id: string) => {
        setHookDetails(prev =>
            prev.map(h => h.id === id ? { ...h, enabled: !h.enabled } : h)
        );
        updateSetting({ hooks: { ...hooks, [id]: !hooks[id] } } as any);
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    };

    return (
        <div className={cn("flex flex-col gap-6", embedded ? "" : "")}>
            <SettingsCard
                title="Hook System"
                subtitle="Event-Driven Automation"
                description="Configure hooks to trigger actions at specific events during agent execution."
            >
                <div className="flex flex-col gap-4">
                    {loading ? (
                        <div className="py-8 text-center text-[11px] text-slate-500">
                            Loading hook configurations...
                        </div>
                    ) : hookDetails.length === 0 ? (
                        <div className="py-8 text-center">
                            <WorkbenchIcon name="codicon:blank" size={32} className="text-slate-600 mx-auto mb-3" />
                            <p className="text-[11px] text-slate-500">No hooks configured</p>
                        </div>
                    ) : (
                        hookDetails.map(hook => {
                            const trigger = TRIGGER_CONFIG[hook.trigger];
                            return (
                                <div
                                    key={hook.id}
                                    className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition-colors"
                                >
                                    <WorkbenchIcon name={trigger.icon} size={18} className={trigger.color} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-bold text-white truncate">{hook.name}</span>
                                            <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-white/10", trigger.color)}>
                                                {trigger.label}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="text-[10px] text-slate-500">ID: {hook.id}</span>
                                            <span className="text-[10px] text-emerald-500/70">{hook.trigger_count} triggers</span>
                                        </div>
                                    </div>
                                    <WorkbenchSwitch
                                        checked={hook.enabled}
                                        onCheckedChange={() => toggleHook(hook.id)}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>
            </SettingsCard>

            <SettingsCard
                title="Hook Activity Log"
                subtitle="Execution History"
                description="Monitor hook execution and debug automation issues."
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-400">
                            {logs.length > 0 ? `${logs.length} entries` : 'No activity recorded'}
                        </p>
                        <WorkbenchButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowLogs(!showLogs)}
                        >
                            <WorkbenchIcon name={showLogs ? 'codicon:chevron-up' : 'codicon:list-flat'} size={12} />
                            {showLogs ? 'Hide Logs' : 'Show Logs'}
                        </WorkbenchButton>
                    </div>

                    <AnimatePresence>
                        {showLogs && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="max-h-[300px] overflow-y-auto bg-slate-950/50 rounded-lg border border-white/5">
                                    {logs.length === 0 ? (
                                        <div className="py-8 text-center text-[11px] text-slate-600">
                                            No log entries
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-white/5">
                                            {logs.map((log, i) => (
                                                <div key={i} className="flex items-center gap-3 px-4 py-3 text-[10px] font-mono hover:bg-white/[0.02]">
                                                    <span className="text-slate-500">{formatTime(log.timestamp)}</span>
                                                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold",
                                                        log.result === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        log.result === 'blocked' ? 'bg-amber-500/10 text-amber-400' :
                                                        'bg-rose-500/10 text-rose-400'
                                                    )}>
                                                        {log.result}
                                                    </span>
                                                    <span className="text-slate-300">{log.hook_name}</span>
                                                    <span className="text-slate-500">→ {log.trigger}</span>
                                                    {log.message && <span className="text-rose-400/70 ml-auto">{log.message}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </SettingsCard>
        </div>
    );
});