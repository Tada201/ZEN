import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useUpdateStore } from '@/lib/stores/updateStore';
import {
    Info,
    RefreshCcw,
    Download,
    CheckCircle2,
    Github,
    Globe,
    Cpu,
    ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils/style';

function AboutBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-center gap-2 rounded border border-border bg-muted/50 px-3 py-1.5 text-muted-foreground">
            {icon}
            <span className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase">{text}</span>
        </div>
    );
}

export function AboutModal() {
    const aboutOpen = useUIStore(s => s.aboutModalOpen);
    const toggleAbout = useUIStore(s => s.toggleAboutModal);
    const {
        currentVersion,
        checkForUpdates,
        isChecking,
        updateAvailable,
        latestVersion,
        downloadAndInstallUpdate,
        isDownloading,
        downloadProgress,
    } = useUpdateStore();

    const [appVersion, setAppVersion] = useState(currentVersion || '0.1.0');

    useEffect(() => {
        const loadVersion = async () => {
            try {
                const pkg = await import('../../../package.json');
                setAppVersion(pkg.default.version || currentVersion || '0.1.0');
            } catch {
                // ignore
            }
        };
        loadVersion();
    }, [currentVersion]);

    return (
        <Dialog.Root open={aboutOpen} onOpenChange={toggleAbout}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                    {/* Header with Zen Branding */}
                    <div className="relative h-48 bg-muted/30 overflow-hidden flex items-center justify-center border-b border-border">
                        <div className="absolute inset-0 opacity-10 pointer-events-none"
                             style={{ backgroundImage: 'radial-gradient(var(--color-primary) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                        />

                        <div className="relative flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(167,139,250,0.15)]">
                                <Cpu size={40} className="text-primary" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-black tracking-[0.2em] text-foreground uppercase">ZEN</h2>
                                <p className="text-[10px] font-mono text-primary uppercase tracking-[0.4em] mt-1">Neural Interface</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-3 justify-center">
                            <AboutBadge icon={<Cpu size={12} />} text={`v${appVersion}`} />
                            <AboutBadge icon={<ShieldCheck size={12} />} text="Sandboxed" />
                            <AboutBadge icon={<Globe size={12} />} text="Local-First" />
                        </div>

                        {/* Description */}
                        <div className="space-y-4 text-center max-w-sm mx-auto">
                            <p className="text-xs text-muted-foreground leading-relaxed uppercase tracking-tight font-medium">
                                Professional-grade AI orchestration platform. High-performance neural link interface with local state persistence and premium ergonomics.
                            </p>

                            <div className="flex items-center justify-center gap-6 pt-2">
                                <a href="https://github.com/Gitlawb/ZEN" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                    <Github size={18} />
                                </a>
                                <a href="https://zen-ai.io" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                                    <Globe size={18} />
                                </a>
                            </div>
                        </div>

                        {/* Update Section */}
                        <div className="pt-6 border-t border-border space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Info size={14} className="text-primary opacity-60" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Update Engine</span>
                                </div>
                                <button
                                    onClick={() => checkForUpdates()}
                                    disabled={isChecking || isDownloading}
                                    className="text-[9px] font-bold uppercase tracking-widest text-primary hover:text-primary-glow transition-colors disabled:opacity-50"
                                >
                                    {isChecking ? 'Checking...' : 'Check now'}
                                </button>
                            </div>

                            <div className="rounded-lg bg-muted/30 border border-border p-4">
                                {updateAvailable ? (
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                <span className="text-[10px] font-bold text-foreground">Update Available: v{latestVersion}</span>
                                            </div>
                                            <p className="text-[9px] text-muted-foreground uppercase tracking-tight">New features and security enhancements are ready.</p>
                                        </div>
                                        <button
                                            onClick={() => downloadAndInstallUpdate()}
                                            disabled={isDownloading}
                                            className="px-4 py-2 rounded bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2"
                                        >
                                            {isDownloading ? (
                                                <>
                                                    <RefreshCcw size={12} className="animate-spin" />
                                                    {downloadProgress}%
                                                </>
                                            ) : (
                                                <>
                                                    <Download size={12} />
                                                    Update
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 py-1">
                                        <CheckCircle2 size={14} className="text-success opacity-60" />
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Core system is up to date</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-muted/30 px-8 py-4 border-t border-border flex items-center justify-between">
                        <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.2em]">© 2026 ZEN ORCHESTRATOR</span>
                        <Dialog.Close asChild>
                            <button className="text-[9px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
                                Close
                            </button>
                        </Dialog.Close>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
