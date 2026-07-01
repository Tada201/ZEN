import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export const CSSInjection = memo(() => {
    const customCssPath = useSettingsStore(s => s.customCssPath ?? '');
    const customCssEnabled = useSettingsStore(s => s.customCssEnabled ?? false);
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const handlePickCssFile = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                multiple: false,
                filters: [{ name: 'CSS Stylesheets', extensions: ['css'] }]
            });

            if (selected && typeof selected === 'string') {
                updateSetting({ customCssPath: selected, customCssEnabled: true });
            }
        } catch (err) {
            console.error('[GUI] Failed to pick CSS file:', err);
        }
    };

    const hasError = !customCssPath && customCssEnabled;

    return (
        <section className="flex flex-col gap-6">
            <div>
                <h2 className="text-[11px] font-bold text-foreground uppercase tracking-widest mb-1">Custom CSS Injection</h2>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Inject custom CSS stylesheets to override the workbench appearance.
                    Supports real-time updates and deep visual customization.
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <WorkbenchSettingRow
                    label="Enable Injection"
                    description="Apply active CSS overrides to the interface"
                    control={
                        <WorkbenchSwitch
                            checked={customCssEnabled}
                            onCheckedChange={(checked) => updateSetting({ customCssEnabled: checked })}
                        />
                    }
                />

                <WorkbenchSettingRow
                    label="Stylesheet Protocol"
                    description="Path to the local stylesheet repository"
                    control={
                        <div className="flex items-center gap-2 w-[400px]">
                            <WorkbenchInput
                                readOnly
                                placeholder="Awaiting file selection..."
                                value={customCssPath}
                                className="flex-1 text-[11px] font-mono bg-card/70 rounded-lg border border-border"
                            />
                            <WorkbenchButton
                                onClick={handlePickCssFile}
                                className="h-10 w-10 flex items-center justify-center p-0 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors"
                            >
                                <WorkbenchIcon name="codicon:folder-opened" size={16} className="text-muted-foreground" />
                            </WorkbenchButton>
                        </div>
                    }
                />

                <AnimatePresence>
                    {hasError && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pt-2"
                        >
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                                <WorkbenchIcon name="codicon:warning" size={16} className="shrink-0" />
                                <span className="text-[11px] font-medium">
                                    Valid CSS file path is required for protocol activation.
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
});