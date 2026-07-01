import { useRef, useMemo, useEffect, useState, memo } from 'react';
import type { WidgetContext } from './types';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { Sparkline } from '@/components/shared/Sparkline';
import { useRenderLogger } from '@/hooks/useRenderLogger';

export const NetworkWidget = memo(function NetworkWidget({ context }: { context: WidgetContext }) {
    const { networkInterfaces } = context;
    useRenderLogger("NetworkWidget", { ifacesCount: networkInterfaces.length });
    const preferredIface = useSettingsStore((s) => (s.widgetSettings as any).preferredNetworkInterface as string | undefined);
    const lockedIfaceName = useRef<string | null>(null);

    // Track interface change for history reset
    const [currentIface, setCurrentIface] = useState<string | null>(null);

    // Filter and find the best active interface
    const activeIface = useMemo(() => {
        if (!networkInterfaces.length) return null;

        // 1. Try preferred interface from settings
        if (preferredIface) {
            const preferred = networkInterfaces.find(i => i.name === preferredIface);
            if (preferred) return preferred;
        }

        // 2. Try previously locked interface (for continuity during a session)
        if (lockedIfaceName.current) {
            const current = networkInterfaces.find(i => i.name === lockedIfaceName.current);
            if (current) return current;
        }

        // 3. Fallback to auto-selection logic
        const candidates = networkInterfaces.filter(i => {
            const name = i.name.toLowerCase();
            return !name.includes('lo') &&
                !name.includes('loopback') &&
                i.macAddress !== "00:00:00:00:00:00" &&
                i.macAddress !== "";
        });

        const sorted = (candidates.length > 0 ? candidates : networkInterfaces).sort((a, b) =>
            (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes)
        );

        const best = sorted[0];
        if (best) {
            lockedIfaceName.current = best.name;
        }
        return best;
    }, [networkInterfaces, preferredIface]);

    const historySize = 40;
    const [history, setHistory] = useState<{ tx: number[], rx: number[] }>({
        tx: Array(historySize).fill(0),
        rx: Array(historySize).fill(0)
    });

    useEffect(() => {
        if (!activeIface) return;

        // Reset history if interface name changed
        if (activeIface.name !== currentIface) {
            setCurrentIface(activeIface.name);
            setHistory({
                tx: Array(historySize).fill(0),
                rx: Array(historySize).fill(0)
            });
            return;
        }

        setHistory(prev => ({
            tx: [...prev.tx, activeIface.txSec].slice(-historySize),
            rx: [...prev.rx, activeIface.rxSec].slice(-historySize)
        }));
    }, [context, activeIface, currentIface]); // Accumulate on every poll

    if (!activeIface) {
        return (
            <div className="flex items-center justify-center h-24 bg-card/20 border border-border/40 rounded-sm">
                <span className="text-[10px] font-mono text-rose-500 italic">OFFLINE</span>
            </div>
        );
    }

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatBitrate = (bytesPerSec: number) => {
        const bits = bytesPerSec * 8;
        if (bits === 0) return '0 b/s';
        const k = 1000;
        const sizes = ['b/s', 'Kb/s', 'Mb/s', 'Gb/s'];
        const i = Math.floor(Math.log(bits) / Math.log(k));
        return parseFloat((bits / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col gap-3 p-1">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold text-muted-foreground tracking-wider">
                    {activeIface.name.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-violet-400/80">ONLINE</span>
            </div>

            {/* Throughput Charts */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 bg-card/60 border border-border/60 rounded-lg p-1.5">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-mono text-muted-foreground">SENT</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{formatBitrate(activeIface.txSec)}</span>
                    </div>
                    <div className="h-8">
                        <Sparkline data={history.tx} color="hsl(var(--primary))" height={32} />
                    </div>
                </div>

                <div className="flex flex-col gap-1 bg-card/60 border border-border/60 rounded-lg p-1.5">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-mono text-muted-foreground">RECV</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{formatBitrate(activeIface.rxSec)}</span>
                    </div>
                    <div className="h-8">
                        <Sparkline data={history.rx} color="hsl(var(--primary))" height={32} />
                    </div>
                </div>
            </div>

            {/* Total Traffic Bits */}
            <div className="grid grid-cols-2 gap-2 px-1">
                <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">TX TOTAL</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{formatBytes(activeIface.txBytes)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">RX TOTAL</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{formatBytes(activeIface.rxBytes)}</span>
                </div>
            </div>

            {/* Connection Metadata */}
            <div className="flex items-center justify-between px-1 pt-1 border-t border-border/60">
                <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[160px]">
                    {activeIface.ipAddresses.find(ip => !ip.includes(':')) || activeIface.ipAddresses[0] || '127.0.0.1'}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">NOMINAL</span>
            </div>
        </div>
    );
});
