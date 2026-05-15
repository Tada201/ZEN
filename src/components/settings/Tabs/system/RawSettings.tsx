import { useState, useEffect, memo } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { mapSqliteToState } from '@/lib/stores/settingsMapper';

export const RawSettings = memo(() => {
    const { updateSetting, applyChanges } = useSettingsStore(useShallow(s => ({
        updateSetting: s.updateSetting,
        applyChanges: s.applyChanges,
    })));

    const [jsonString, setJsonString] = useState<string>('{}');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadRaw();
    }, []);

    const loadRaw = async () => {
        setLoading(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const settings = await invoke<Record<string, string>>('get_all_settings');
            const parsed: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(settings)) {
                try {
                    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
                        parsed[key] = JSON.parse(value);
                    } else {
                        parsed[key] = value;
                    }
                } catch {
                    parsed[key] = value;
                }
            }
            setJsonString(JSON.stringify(parsed, null, 4));
            setError(null);
        } catch (err) {
            // Fallback to current store state
            setJsonString('{}');
            setError('Backend unavailable — displaying empty manifest');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const parsed = JSON.parse(jsonString);
            const toPersist: Record<string, string> = {};

            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'object') {
                    toPersist[key] = JSON.stringify(value);
                } else {
                    toPersist[key] = String(value);
                }
            }

            const stateUpdate = mapSqliteToState(toPersist);
            updateSetting(stateUpdate);
            await applyChanges();
            await loadRaw();
            setError(null);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setError(`Invalid JSON or Save Failure: ${errMsg}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <SettingsCard
                title="Raw Architecture Data"
                subtitle="Direct Registry Access"
                description="Direct low-level access to the SQLite settings manifest. USE WITH EXTREME CAUTION."
                icon="codicon:database"
            >
                <div className="flex flex-col gap-4">
                    <div className="flex justify-end gap-2">
                        <WorkbenchButton
                            variant="secondary"
                            onClick={loadRaw}
                            disabled={loading || saving}
                            className="h-8 px-4 gap-2"
                        >
                            <WorkbenchIcon name="codicon:refresh" size={14} />
                            <span className="text-[10px] font-extrabold uppercase">Refresh</span>
                        </WorkbenchButton>
                        <WorkbenchButton
                            variant="primary"
                            onClick={handleSave}
                            disabled={loading || saving}
                            className="h-8 px-4 gap-2"
                        >
                            {saving ? (
                                <WorkbenchIcon name="codicon:loading" size={14} className="animate-spin" />
                            ) : (
                                <WorkbenchIcon name="codicon:save" size={14} />
                            )}
                            <span className="text-[10px] font-extrabold uppercase">
                                {saving ? 'Committing...' : 'Commit Changes'}
                            </span>
                        </WorkbenchButton>
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                            <WorkbenchIcon name="codicon:error" size={16} className="text-rose-500" />
                            <span className="text-[11px] font-bold text-rose-400">{error}</span>
                        </div>
                    )}

                    <div className="relative flex-1 min-h-[400px] rounded-xl bg-slate-950/50 border border-white/5 overflow-hidden group focus-within:border-brand-purple/30">
                        <textarea
                            value={jsonString}
                            onChange={(e) => setJsonString(e.target.value)}
                            spellCheck={false}
                            className="w-full h-full p-6 bg-transparent text-slate-300 font-mono text-[12px] resize-none outline-none border-none focus:ring-0"
                            placeholder="{ ...settings manifest }"
                        />
                    </div>

                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                        <WorkbenchIcon name="codicon:warning" size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-amber-500/80 leading-relaxed">
                            <strong className="uppercase font-bold">Warning:</strong> Direct modification of the registry bypasses UI validation. Invalid data schemas may cause application instability or boot failure.
                        </p>
                    </div>
                </div>
            </SettingsCard>
        </div>
    );
});