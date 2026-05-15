import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

export const EmbeddingConfig = memo(() => {
    const embeddingProvider = useSettingsStore(s => s.embeddingProvider ?? 'ollama');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    return (
        <SettingsCard
            title="Embedding Models"
            subtitle="Vector Indexing"
            description="Manage the models responsible for turning your text into searchable vector embeddings."
        >
            <div className="flex flex-col gap-4">
                <WorkbenchSettingRow
                    label="Embedding Provider"
                    description="Select the provider for embedding model inference"
                    control={
                        <WorkbenchSelect
                            value={embeddingProvider}
                            onValueChange={(val) => updateSetting({ embeddingProvider: val })}
                            options={[
                                { label: 'Ollama (Local)', value: 'ollama' },
                                { label: 'LM Studio (Local)', value: 'lmstudio' },
                            ]}
                            width={160}
                        />
                    }
                />

                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                        <WorkbenchIcon name="codicon:info" size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">
                            Model Library
                        </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Download and manage embedding models for local document retrieval.
                        Recommended models: nomic-embed-text (768D), mxbai-embed-large (1024D).
                    </p>
                </div>
            </div>
        </SettingsCard>
    );
});