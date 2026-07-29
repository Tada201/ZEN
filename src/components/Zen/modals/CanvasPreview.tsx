import { useEffect, useState } from 'react';
import { Pencil, X, Grid3X3, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface CanvasPreviewProps {
    onClose?: () => void;
}

export function CanvasPreview({ onClose }: CanvasPreviewProps) {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 350);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background" onClick={onClose} />

            {/* Modal Panel */}
            <div className={cn(
                "relative w-full max-w-4xl h-[65vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden",
                isReady ? "animate-in zoom-in-95 fade-in duration-300" : "opacity-0"
            )}>
                {/* Header Bar */}
                <div className="h-10 flex items-center justify-between px-5 bg-muted border-b border-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_6px_var(--color-primary-glow)]" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Vector Canvas</span>
                        <div className="w-[1px] h-3 bg-border" />
                        <span className="text-[9px] font-mono text-muted-foreground">READY</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Canvas Area */}
                <div className="relative flex-1 bg-muted overflow-hidden">
                    {/* Center Icon */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary flex items-center justify-center">
                            <Pencil size={36} className="text-primary" />
                        </div>
                    </div>

                    {/* Grid Overlay */}
                    <div
                        className="absolute inset-0 opacity-[0.04] pointer-events-none"
                        style={{
                            backgroundImage: `
                                linear-gradient(var(--color-primary) 1px, transparent 1px),
                                linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)
                            `,
                            backgroundSize: '48px 48px'
                        }}
                    />

                    {/* HUD Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary pointer-events-none" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary pointer-events-none" />

                    {/* Status Badges */}
                    <div className="absolute top-5 left-5 flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border">
                            <Grid3X3 size={10} className="text-primary" />
                            <span className="text-[9px] font-bold text-foreground uppercase tracking-widest">Vector Mode</span>
                        </div>
                    </div>

                    <div className="absolute top-5 right-5 text-right">
                        <div className="px-2.5 py-1 rounded-md bg-card border border-border">
                            <div className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Stream: Active</div>
                            <div className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Engine: Composite</div>
                        </div>
                    </div>

                    {/* Center Status */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border">
                        <CircleDot size={8} className="text-primary animate-pulse" />
                        <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Drawing Enabled</span>
                    </div>
                </div>

                {/* Footer Bar */}
                <div className="h-8 flex items-center justify-between px-5 bg-muted border-t border-border shrink-0">
                    <div className="flex items-center gap-4">
                        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Resolution: Auto</span>
                        <div className="w-[1px] h-2.5 bg-border" />
                        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Format: SVG</span>
                    </div>
                    <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">v1.0</span>
                </div>
            </div>
        </div>
    );
}