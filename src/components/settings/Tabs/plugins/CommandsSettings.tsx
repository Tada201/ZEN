import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface ZenCommand {
    id: string;
    name: string;
    description: string;
    allowed_tools: string[];
    instructions: string;
    variables: string[];
    enabled: boolean;
}

const FALLBACK_COMMANDS: ZenCommand[] = [
    {
        id: 'code-review',
        name: '/code-review',
        description: 'Analyze code changes and provide improvement suggestions',
        allowed_tools: ['Read', 'Grep', 'Edit', 'Bash'],
        instructions: 'Analyze the provided code diff and identify potential issues, security concerns, and improvement opportunities.',
        variables: ['--pr', '--file'],
        enabled: true,
    },
    {
        id: 'explain-code',
        name: '/explain',
        description: 'Explain complex code sections in detail',
        allowed_tools: ['Read'],
        instructions: 'Provide a thorough explanation of the code including its purpose, architecture, and key patterns.',
        variables: ['<file>'],
        enabled: true,
    },
    {
        id: 'refactor',
        name: '/refactor',
        description: 'Suggest and apply refactoring patterns',
        allowed_tools: ['Read', 'Edit', 'Grep'],
        instructions: 'Identify refactoring opportunities and apply them following SOLID principles and clean code guidelines.',
        variables: ['--mode'],
        enabled: false,
    },
];

export const CommandsSettings = memo(({ embedded }: { embedded?: boolean }) => {
    const { commands, updateSetting } = useSettingsStore(useShallow(s => ({
        commands: s.commands as Record<string, string>,
        updateSetting: s.updateSetting,
    })));

    const [cmdDetails, setCmdDetails] = useState<ZenCommand[]>(FALLBACK_COMMANDS);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const loadCommands = useCallback(async () => {
        setLoading(true);
        try {
            // Backend list_commands not yet implemented — use fallback
            setCmdDetails(FALLBACK_COMMANDS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCommands();
    }, [loadCommands]);

    const toggleCommand = (id: string) => {
        setCmdDetails(prev =>
            prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
        );
        updateSetting({ commands: { ...commands, [id]: String(!commands[id]) } } as any);
    };

    return (
        <div className={cn("flex flex-col gap-6", embedded ? "" : "")}>
            <SettingsCard
                title="Command Registry"
                subtitle="Slash Commands"
                description="Register and configure slash commands for quick access to agent capabilities."
            >
                <div className="flex flex-col gap-3">
                    {loading ? (
                        <div className="py-8 text-center text-[11px] text-slate-500">
                            Loading command registry...
                        </div>
                    ) : cmdDetails.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-white/10 rounded-xl bg-slate-950/20">
                            <WorkbenchIcon name="codicon:terminal" size={32} className="text-slate-600 mx-auto mb-3" />
                            <p className="text-[11px] text-slate-500 mb-2">No commands registered</p>
                            <p className="text-[10px] text-slate-600">
                                Commands are registered by agents at runtime.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {cmdDetails.map(cmd => (
                                <motion.div
                                    key={cmd.id}
                                    layout
                                    className={cn(
                                        "rounded-xl border transition-colors",
                                        expandedId === cmd.id
                                            ? "bg-slate-800/50 border-white/10"
                                            : "bg-slate-900/50 border-white/5 hover:border-white/10"
                                    )}
                                >
                                    <div
                                        className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === cmd.id ? null : cmd.id)}
                                    >
                                        <WorkbenchIcon
                                            name="codicon:symbol-property"
                                            size={16}
                                            className={cmd.enabled ? 'text-emerald-400' : 'text-slate-500'}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[12px] font-mono font-bold text-white">{cmd.name}</span>
                                                <span className="text-[10px] text-slate-500 truncate">{cmd.description}</span>
                                            </div>
                                        </div>
                                        <div onClick={(event) => event.stopPropagation()}>
                                            <WorkbenchSwitch
                                                checked={cmd.enabled}
                                                onCheckedChange={() => toggleCommand(cmd.id)}
                                            />
                                        </div>
                                        <WorkbenchIcon
                                            name={expandedId === cmd.id ? 'codicon:chevron-up' : 'codicon:chevron-down'}
                                            size={14}
                                            className="text-slate-500"
                                        />
                                    </div>

                                    <AnimatePresence>
                                        {expandedId === cmd.id && (
                                            <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: 'auto' }}
                                                exit={{ height: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Variables</label>
                                                        <div className="flex gap-2 mt-1.5 flex-wrap">
                                                            {cmd.variables.length > 0 ? cmd.variables.map(v => (
                                                                <span key={v} className="text-[10px] font-mono px-2 py-1 rounded bg-slate-950 border border-white/10 text-slate-400">
                                                                    {v}
                                                                </span>
                                                            )) : (
                                                                <span className="text-[10px] text-slate-600">None</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Allowed Tools</label>
                                                        <div className="flex gap-2 mt-1.5 flex-wrap">
                                                            {cmd.allowed_tools.map(tool => (
                                                                <span key={tool} className="text-[10px] px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                                                    {tool}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Instructions</label>
                                                        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{cmd.instructions}</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </SettingsCard>
        </div>
    );
});