import { Cpu } from 'lucide-react';
import { cn } from "@/lib/utils";

interface VoiceDiagnosticsPanelProps {
    appUptimeSecs: number;
    sttEngine: string;
    micStatus: 'inactive' | 'live' | 'error';
    amplitude: number;
    tokensPerSec: number;
    logLines: string[];
    whisperBackend?: string;
    whisperBackendDetail?: string;
}

export function VoiceDiagnosticsPanel({
    appUptimeSecs,
    sttEngine,
    micStatus,
    amplitude,
    tokensPerSec,
    logLines,
    whisperBackend = "unknown",
    whisperBackendDetail = "",
}: VoiceDiagnosticsPanelProps) {
    return (
        <div className="w-full bg-background/95 border border-border rounded-xl p-4 overflow-hidden text-[9px] font-mono text-muted-foreground flex flex-col gap-3 z-10">
            <div className="flex justify-between items-center text-muted-foreground border-b border-border pb-1">
                <span className="flex items-center gap-1.5"><Cpu size={10} /> TELEMETRY DIAGNOSTICS</span>
                <span>UPTIME: {Math.floor(appUptimeSecs / 60)}M {appUptimeSecs % 60}S</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex justify-between"><span>STT_ENGINE</span><span className="text-primary-foreground">{sttEngine.toUpperCase()}</span></div>
                <div className="flex justify-between"><span>STT_BACKEND</span><span className={cn(whisperBackend === 'cuda' || whisperBackend === 'vulkan' ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold')}>{whisperBackend.toUpperCase()}</span></div>
                <div className="flex justify-between"><span>LINK STATUS</span><span className={cn(micStatus === 'live' ? 'text-emerald-400 font-bold' : 'text-red-400')}>{micStatus.toUpperCase()}</span></div>
                <div className="flex justify-between"><span>AMP SIGNAL</span><span className="text-primary-foreground">{Math.min(100, Math.floor(amplitude * 250))}%</span></div>
                <div className="flex justify-between"><span>LATENCY</span><span className="text-primary-foreground">{tokensPerSec ? `${(1000 / tokensPerSec).toFixed(0)}ms` : '—'}</span></div>
            </div>
            {whisperBackendDetail && (
                <div className="truncate rounded border border-border bg-muted/40 px-2 py-1 text-[9px] text-muted-foreground">
                    {whisperBackendDetail}
                </div>
            )}
            <div className="h-px bg-border my-1" />
            <div className="flex flex-col gap-1 max-h-16 overflow-y-auto pr-1">
                {logLines.slice(-3).map((line, index) => <div key={index} className="truncate text-muted-foreground">{line}</div>)}
            </div>
        </div>
    );
}
