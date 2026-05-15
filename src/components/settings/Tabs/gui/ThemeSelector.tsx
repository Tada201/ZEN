import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchTextArea } from '@/components/settings/ui/WorkbenchTextArea';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

const THEMES = [
    { id: 'slate', name: 'Slate', colors: { r: 16, g: 185, b: 129 } },
    { id: 'arctic', name: 'Arctic', colors: { r: 99, g: 210, b: 255 } },
    { id: 'nebula', name: 'Nebula', colors: { r: 167, g: 139, b: 250 } },
    { id: 'ember', name: 'Ember', colors: { r: 251, g: 146, b: 60 } },
    { id: 'midnight', name: 'Midnight', colors: { r: 100, g: 116, b: 139 } },
];
const CUSTOM_THEME_ID = 'custom';

export const ThemeSelector = memo(() => {
    const themeId = useSettingsStore(s => s.themeId ?? 'slate');
    const customThemeSource = useSettingsStore(s => s.customThemeSource ?? '');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <section className="flex flex-col gap-6">
            <div>
                <h2 className="text-[11px] font-bold text-white/90 uppercase tracking-widest mb-1">System Theme</h2>
                <p className="text-[11px] text-white/50 leading-relaxed">
                    Select a visual theme for the workbench. The Slate theme is recommended for the best professional experience.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {THEMES.map((t) => {
                    const accent = `rgb(${t.colors?.r || 16}, ${t.colors?.g || 185}, ${t.colors?.b || 129})`;
                    const isActive = themeId === t.id;

                    return (
                        <WorkbenchButton
                            key={t.id}
                            onClick={() => updateSetting({ themeId: t.id })}
                            className={cn(
                                "p-3 rounded-xl border transition-all duration-200 text-left relative overflow-hidden group transform-gpu",
                                isActive
                                    ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 hover:-translate-y-0.5"
                            )}
                        >
                            <div className="flex items-center justify-between mb-3 relative z-10">
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest leading-none",
                                    isActive ? "text-emerald-400" : "text-white/40"
                                )}>
                                    {t.name}
                                </span>
                                {isActive && (
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                        <WorkbenchIcon name="codicon:check" size={12} className="text-emerald-400" />
                                    </motion.div>
                                )}
                            </div>

                            <div className="h-10 w-full rounded-lg border border-white/5 relative overflow-hidden bg-slate-950/50 backdrop-blur-sm">
                                <div
                                    className="absolute inset-0 opacity-10"
                                    style={{ background: `linear-gradient(to top, ${accent}, transparent)` }}
                                />
                                <div className="absolute top-2 left-2 right-2 h-1 bg-white/10 rounded-full" />
                                <div className="absolute top-5 left-2 w-3/5 h-1 bg-white/5 rounded-full" />
                            </div>
                        </WorkbenchButton>
                    );
                })}

                <WorkbenchButton
                    onClick={() => updateSetting({ themeId: CUSTOM_THEME_ID })}
                    className={cn(
                        "p-3 rounded-xl border border-dashed transition-all duration-200 text-left relative transform-gpu",
                        themeId === CUSTOM_THEME_ID
                            ? "border-blue-500/50 bg-blue-500/10"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 hover:-translate-y-0.5"
                    )}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest leading-none",
                            themeId === CUSTOM_THEME_ID ? "text-blue-400" : "text-white/40"
                        )}>
                            Custom Override
                        </span>
                        {themeId === CUSTOM_THEME_ID && <WorkbenchIcon name="codicon:check" size={12} className="text-blue-400" />}
                    </div>
                    <div className="h-10 w-full rounded-lg border border-dashed border-white/10 bg-slate-950/50 flex items-center justify-center backdrop-blur-sm">
                        <WorkbenchIcon name="codicon:sparkle" size={12} className="text-white/20" />
                    </div>
                </WorkbenchButton>
            </div>

            <AnimatePresence>
                {themeId === CUSTOM_THEME_ID && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 bg-slate-900/30 rounded-xl border border-white/5 space-y-4">
                            <div className="flex items-center gap-2">
                                <WorkbenchIcon name="codicon:code" size={14} className="text-blue-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                                    JSON Definition Matrix
                                </span>
                            </div>
                            <WorkbenchTextArea
                                value={customThemeSource}
                                onChangeText={(text) => updateSetting({ customThemeSource: text })}
                                className="min-h-[160px] font-mono text-[11px] bg-slate-950/50 rounded-lg border border-white/5 p-3 focus:border-blue-500/30 transition-colors"
                                placeholder='{ "name": "My Theme", "colors": { "r": 130, "g": 181, "b": 238 } }'
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
});