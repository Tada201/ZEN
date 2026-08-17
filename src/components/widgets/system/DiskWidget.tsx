import { memo } from "react";
import { useRenderLogger } from '@/hooks/useRenderLogger';
import type { WidgetContext } from './types';

export const DiskWidget = memo(function DiskWidget({ context }: { context: WidgetContext }) {
    const { disks } = context;
    useRenderLogger("DiskWidget", { diskCount: disks.length });

    if (disks.length === 0) {
        return (
            <div className="flex items-center justify-center h-24 bg-card/20 border border-border/40 rounded-sm">
                <span className="text-[10px] font-mono text-muted-foreground italic">STORAGE VOLUMES OFFLINE</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-1">
            {disks.map((disk, i) => {
                if (!disk) return null;
                const tSpace = Number(disk.totalSpace ?? 0);
                const aSpace = Number(disk.availableSpace ?? 1); // Avoid div by zero
                const used = tSpace - aSpace;
                const percent = (used / (tSpace || 1)) * 100;
                const isAlert = percent > 90;
                
                // Safe drive letter/name calculation
                const driveLetter = (disk.mountPoint || "").split(':')[0] || (disk.name || "DISK").slice(0, 1) || 'D';

                return (
                    <div key={i} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-bold text-muted-foreground">
                                    {driveLetter}:
                                </span>
                                <span className="text-[9px] font-mono text-muted-foreground px-1 border border-border rounded bg-muted/50">
                                    {disk.isRemovable ? 'REMOVABLE' : 'FIXED'}
                                </span>
                            </div>
                            <span className={`text-[10px] font-mono font-bold ${isAlert ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {Math.round(percent)}%
                            </span>
                        </div>

                        <div className="h-1 bg-card rounded-full overflow-hidden border border-border/25">
                            <div
                                className={`h-full transition-all duration-500 rounded-full ${isAlert ? 'bg-destructive/60' : 'bg-primary/60'}`}
                                style={{ width: `${percent}%` }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-1 mt-1">
                            <div className="flex justify-between">
                                <span className="text-[9px] font-mono text-muted-foreground">USED</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{(used / 1024 / 1024 / 1024).toFixed(1)}GB</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[9px] font-mono text-muted-foreground">FREE</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{(aSpace / 1024 / 1024 / 1024).toFixed(1)}GB</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[9px] font-mono text-muted-foreground">TOTAL</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{(tSpace / 1024 / 1024 / 1024).toFixed(0)}GB</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[9px] font-mono text-muted-foreground">MOUNT</span>
                                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[80px]" title={disk.mountPoint || "Unknown"}>
                                    {disk.mountPoint || "N/A"}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});
