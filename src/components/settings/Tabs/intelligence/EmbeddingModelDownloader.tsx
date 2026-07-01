import { useState, useEffect, memo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchSettingRow } from '@/components/settings/ui/WorkbenchSettingRow';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface OllamaStatus {
    installed: boolean;
    running: boolean;
    models: string[];
    has_embedding_model: boolean;
}

interface DownloadProgress {
    status: string;
    total_bytes: number;
    downloaded_bytes: number;
    model_name: string;
}

const RECOMMENDED_MODELS = [
    {
        name: 'nomic-embed-text',
        size: '274 MB',
        dimensions: 768,
        description: 'Standard precision. High performance.',
        category: 'Balanced',
    },
    {
        name: 'mxbai-embed-large',
        size: '670 MB',
        dimensions: 1024,
        description: 'Maximum accuracy. Professional grade.',
        category: 'Accuracy',
    },
    {
        name: 'all-minilm',
        size: '45 MB',
        dimensions: 384,
        description: 'Minimal footprint. Resource optimized.',
        category: 'Lightweight',
    },
];

export const EmbeddingModelDownloader = memo(({
    provider
}: {
    provider: 'ollama' | 'lmstudio';
}) => {
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [downloadComplete, setDownloadComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isOllama = provider === 'ollama';
    const serviceName = isOllama ? 'Ollama' : 'LM Studio';
    const serviceUrl = isOllama ? 'https://ollama.com/download' : 'https://lmstudio.ai/';

    useEffect(() => {
        // TODO(config-wireup): add check_ollama_status/check_lmstudio_status Tauri
        // commands before showing real local embedding engine readiness.
        setOllamaStatus({
            installed: false,
            running: false,
            models: [],
            has_embedding_model: false,
        });
        setCheckingStatus(false);
    }, [provider]);

    useEffect(() => {
        const unlisten = listen<DownloadProgress>('ollama:download-progress', (event) => {
            setDownloadProgress(event.payload);
        });
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const checkStatus = async () => {
        // TODO(config-wireup): call the backend status command once it exists; the
        // default disconnected state is intentional for the current prototype tab.
        setCheckingStatus(false);
    };

    const downloadModel = async (modelName: string) => {
        if (!isOllama) {
            setError('Automated download only compatible with Ollama. For LM Studio, use their internal model manager.');
            return;
        }

        setDownloadingModel(modelName);
        setDownloadProgress(null);
        setDownloadComplete(false);
        setError(null);

        // TODO(config-wireup): add a download_embedding_model Tauri command with progress
        // events before enabling one-click model installation from this panel.
        setDownloadComplete(false);
        setDownloadingModel(null);
        setError(`Automated download not available from frontend. Use ${provider} CLI directly.`);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const getProgressPercent = () => {
        if (!downloadProgress || downloadProgress.total_bytes === 0) return 0;
        return Math.round((downloadProgress.downloaded_bytes / downloadProgress.total_bytes) * 100);
    };

    return (
        <div className="flex flex-col gap-6">
            <SettingsCard
                title="Model Library"
                subtitle="Embedding Models"
                description="Download and manage embedding models for local document retrieval and semantic search."
                icon="codicon:package"
            >
                {/* Service Status */}
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-bold text-foreground">{serviceName} Service</span>
                            <span className="text-[11px] text-muted-foreground">Local inference engine status</span>
                        </div>
                        <WorkbenchButton
                            variant="secondary"
                            onClick={checkStatus}
                            disabled={checkingStatus}
                            className="h-8 px-3 gap-2"
                        >
                            <WorkbenchIcon name="codicon:sync" size={14} className={cn(checkingStatus && "animate-spin")} />
                            <span className="text-[10px] font-extrabold uppercase">Poll Status</span>
                        </WorkbenchButton>
                    </div>

                    <div className="flex flex-col gap-3">
                        <WorkbenchSettingRow
                            label="Service Connection"
                            description={`${serviceName} connectivity`}
                            control={
                                <div className={cn(
                                    "flex items-center gap-2 px-3 py-1 rounded border",
                                    ollamaStatus?.running
                                        ? "bg-success/10 border-emerald-500/20"
                                        : "bg-destructive/10 border-destructive/20"
                                )}>
                                    <div className={cn("w-1.5 h-1.5 rounded-full", ollamaStatus?.running ? "bg-success" : "bg-destructive")} />
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", ollamaStatus?.running ? "text-success" : "text-destructive")}>
                                        {ollamaStatus?.running ? 'Connected' : 'Offline'}
                                    </span>
                                </div>
                            }
                        />

                        <WorkbenchSettingRow
                            label="Indexing Capability"
                            description="Local embedding engine readiness"
                            control={
                                <div className={cn(
                                    "flex items-center gap-2 px-3 py-1 rounded border",
                                    ollamaStatus?.has_embedding_model
                                        ? "bg-brand-purple/10 border-brand-purple/20"
                                        : "bg-muted/60 border-border"
                                )}>
                                    <WorkbenchIcon name="codicon:pulse" size={12} className={cn(ollamaStatus?.has_embedding_model ? "text-brand-purple" : "text-muted-foreground")} />
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", ollamaStatus?.has_embedding_model ? "text-brand-purple" : "text-muted-foreground")}>
                                        {ollamaStatus?.has_embedding_model ? 'Ready' : 'Pending'}
                                    </span>
                                </div>
                            }
                        />
                    </div>

                    {!ollamaStatus?.installed && (
                        <div className="p-4 bg-muted/40 border border-border rounded-xl flex flex-col gap-3">
                            <div className="flex gap-3 items-center">
                                <WorkbenchIcon name="codicon:warning" size={16} className="text-destructive" />
                                <p className="text-[11px] text-muted-foreground flex-1 leading-relaxed">
                                    {serviceName} binary not found. Handshake unavailable.
                                </p>
                            </div>
                            <WorkbenchButton
                                variant="secondary"
                                onClick={() => window.open(serviceUrl, '_blank')}
                                className="w-fit h-8 px-4 gap-2"
                            >
                                <span className="text-[10px] font-extrabold uppercase">Provision Binary</span>
                                <WorkbenchIcon name="codicon:link-external" size={12} />
                            </WorkbenchButton>
                        </div>
                    )}
                </div>

                {/* Model Catalog */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-bold text-foreground uppercase tracking-tight">Curated Model Catalog</span>
                        <span className="text-[10px] text-muted-foreground">Verified models for knowledge retrieval</span>
                    </div>

                    {RECOMMENDED_MODELS.map((model, idx) => {
                        const hasModel = ollamaStatus?.models.some(m => m.includes(model.name));
                        const isDownloading = downloadingModel === model.name;

                        return (
                            <div key={model.name}>
                                {idx > 0 && <div className="h-px bg-muted/50 my-1" />}
                                <div className="flex items-center justify-between py-3">
                                    <div className="flex flex-col gap-1 flex-1 text-left">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-bold text-foreground">{model.name}</span>
                                            <span className="text-[9px] font-black text-brand-purple bg-brand-purple/10 px-1.5 py-0.5 rounded border border-brand-purple/20 uppercase tracking-tighter">
                                                {model.category}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-tight m-0">{model.description}</p>
                                        <div className="flex gap-4 mt-1 items-center opacity-70">
                                            <div className="flex items-center gap-1.5">
                                                <WorkbenchIcon name="codicon:package" size={10} className="text-muted-foreground" />
                                                <span className="text-[10px] font-mono text-muted-foreground font-semibold uppercase">{model.size}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <WorkbenchIcon name="codicon:pulse" size={10} className="text-muted-foreground" />
                                                <span className="text-[10px] font-mono text-muted-foreground font-semibold uppercase">{model.dimensions}D</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {!hasModel ? (
                                            <WorkbenchButton
                                                variant={!isDownloading && isOllama ? "primary" : "secondary"}
                                                onClick={() => downloadModel(model.name)}
                                                disabled={isDownloading || !ollamaStatus?.running || !isOllama}
                                                className="h-8 px-4 gap-2"
                                            >
                                                {isDownloading ? (
                                                    <WorkbenchIcon name="codicon:sync" size={12} className="animate-spin" />
                                                ) : isOllama ? (
                                                    <WorkbenchIcon name="codicon:cloud-download" size={12} />
                                                ) : (
                                                    <WorkbenchIcon name="codicon:link-external" size={12} />
                                                )}
                                                <span className="text-[10px] font-black uppercase">
                                                    {isDownloading ? 'Pulling...' : isOllama ? 'Pull' : 'Manual'}
                                                </span>
                                            </WorkbenchButton>
                                        ) : (
                                            <div className="flex items-center gap-2 bg-success/10 px-3 py-1 rounded border border-emerald-500/20">
                                                <WorkbenchIcon name="codicon:check" size={12} className="text-emerald-500" />
                                                <span className="text-[10px] font-black text-success uppercase tracking-wider">Synced</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SettingsCard>

            {/* Progress & Notifications */}
            <AnimatePresence>
                {downloadingModel && downloadProgress && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -10 }}
                    >
                        <SettingsCard
                            title="Download Progress"
                            subtitle={downloadProgress.model_name}
                            description={`Processing: ${downloadProgress.status.toUpperCase()}`}
                            icon="codicon:cloud-download"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-[28px] font-black font-mono text-brand-purple leading-none">
                                        {getProgressPercent()}%
                                    </span>
                                </div>

                                <div className="h-2 bg-muted rounded-full overflow-hidden border border-border">
                                    <motion.div
                                        className="h-full bg-brand-purple shadow-[0_0_10px_hsl(var(--primary) / 0.3)]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${getProgressPercent()}%` }}
                                        transition={{ duration: 0.4, ease: "circOut" }}
                                    />
                                </div>

                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono font-bold text-muted-foreground">{formatBytes(downloadProgress.downloaded_bytes)}</span>
                                        <span className="text-[10px] text-foreground/80">/</span>
                                        <span className="text-[10px] font-mono font-bold text-muted-foreground">{formatBytes(downloadProgress.total_bytes)}</span>
                                    </div>
                                    <span className="text-[10px] font-black text-brand-purple/60 bg-brand-purple/10 px-2 py-0.5 rounded border border-brand-purple/10">OLLAMA-API-v1</span>
                                </div>
                            </div>
                        </SettingsCard>
                    </motion.div>
                )}

                {downloadComplete && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="flex items-center gap-4 p-4 bg-success/10 border border-emerald-500/20 rounded-xl"
                    >
                        <div className="bg-success p-1.5 rounded-full ring-4 ring-emerald-500/20">
                            <WorkbenchIcon name="codicon:check" size={14} className="text-foreground" />
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5 text-left">
                            <span className="text-[12px] font-bold text-foreground uppercase">Model Successfully Installed</span>
                            <p className="text-[10px] text-muted-foreground leading-tight m-0">The selected model is now available for local document indexing.</p>
                        </div>
                        <WorkbenchButton variant="ghost" size="icon" onClick={() => setDownloadComplete(false)} className="h-8 w-8 !p-0 hover:bg-success/20">
                            <WorkbenchIcon name="codicon:close" size={14} className="text-muted-foreground" />
                        </WorkbenchButton>
                    </motion.div>
                )}

                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="flex items-center gap-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl"
                    >
                        <div className="bg-destructive p-1.5 rounded-full ring-4 ring-red-500/20">
                            <WorkbenchIcon name="codicon:warning" size={18} className="text-foreground" />
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5 text-left">
                            <span className="text-[12px] font-bold text-red-100 uppercase">Download Failed</span>
                            <p className="text-[10px] text-destructive/60 leading-tight m-0">{error}</p>
                        </div>
                        <WorkbenchButton variant="ghost" size="icon" onClick={() => setError(null)} className="h-8 w-8 !p-0 hover:bg-destructive/20">
                            <WorkbenchIcon name="codicon:close" size={14} className="text-destructive" />
                        </WorkbenchButton>
                    </motion.div>
                )}
            </AnimatePresence>

            {!isOllama && (
                <SettingsCard
                    title="LM Studio Setup"
                    subtitle="Manual Configuration"
                    description="Instructions for setting up LM Studio with embedding models."
                    icon="codicon:book"
                >
                    <div className="flex flex-col gap-3">
                        {[
                            'Launch the LM Studio application',
                            'Download an embedding model (e.g. nomic-embed-text)',
                            'Enable the local inference server in settings',
                            'Refresh this view to confirm connection'
                        ].map((step, i) => (
                            <div key={i} className="flex gap-4 items-start text-left">
                                <div className="w-5 h-5 rounded bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
                                    <span className="text-[9px] font-black text-brand-purple font-mono">{i + 1}</span>
                                </div>
                                <p className="text-[12px] text-muted-foreground flex-1 leading-relaxed font-medium m-0">{step}</p>
                            </div>
                        ))}
                    </div>
                </SettingsCard>
            )}
        </div>
    );
});
