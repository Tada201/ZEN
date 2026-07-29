import { ArrowDownUp, Check, Copy, Cpu, HardDrive, History, Sliders, Trash2, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';

interface XTermTelemetryDrawerProps {
    metrics: {
        cpu: number;
        mem: number;
        rx: number;
        tx: number;
    };
    wordWrap: boolean;
    scrollLock: boolean;
    copiedActive: boolean;
    commandHistory: string[];
    onWordWrapChange: (checked: boolean) => void;
    onScrollLockChange: (checked: boolean) => void;
    onCopyLogs: () => void;
    onClear: () => void;
    onLoadCommand: (command: string) => void;
    onClose: () => void;
}

export function XTermTelemetryDrawer({
    metrics,
    wordWrap,
    scrollLock,
    copiedActive,
    commandHistory,
    onWordWrapChange,
    onScrollLockChange,
    onCopyLogs,
    onClear,
    onLoadCommand,
    onClose,
}: XTermTelemetryDrawerProps) {
    return (
        <div className="w-56 shrink-0 h-full border-l border-border bg-card flex flex-col overflow-y-auto select-none scrollbar-none z-10">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted">
                <div className="flex items-center gap-1.5">
                    <Sliders size={11} className="text-primary" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">TELEMETRY & CTRL</span>
                </div>
                <button 
                    onClick={onClose}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-all"
                >
                    <X size={11} />
                </button>
            </div>

            <div className="p-4 space-y-4 border-b border-border">
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block select-none">SYSTEM TELEMETRY</span>
                <div className="space-y-2 select-none">
                    <div className="flex justify-between text-[8px] font-mono text-muted-foreground">
                        <span className="flex items-center gap-1"><Cpu size={9} /> CPU LOAD</span>
                        <span className="text-primary font-bold">{metrics.cpu}%</span>
                    </div>
                    <Progress value={metrics.cpu} className="h-1.5 bg-muted" />
                </div>

                <div className="space-y-2 select-none">
                    <div className="flex justify-between text-[8px] font-mono text-muted-foreground">
                        <span className="flex items-center gap-1"><HardDrive size={9} /> SHELL MEM</span>
                        <span className="text-primary font-bold">{metrics.mem} MB</span>
                    </div>
                    <Progress value={(metrics.mem / 256) * 100} className="h-1.5 bg-muted" />
                </div>

                <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground select-none">
                    <span className="flex items-center gap-1"><ArrowDownUp size={9} /> SPEED NET</span>
                    <span className="text-muted-foreground">
                        RX <strong className="text-success font-semibold">{metrics.rx} KB/s</strong> | TX <strong className="text-primary font-semibold">{metrics.tx} KB/s</strong>
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-3.5 border-b border-border select-none">
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">CONSOLE ACTIONS</span>
                <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-muted border border-border text-[9px] font-mono text-muted-foreground transition-all">
                    <span>Word Wrap Logs</span>
                    <Switch checked={wordWrap} onCheckedChange={onWordWrapChange} />
                </div>

                <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-muted border border-border text-[9px] font-mono text-muted-foreground transition-all">
                    <span>Scroll Lock Alert</span>
                    <Switch checked={scrollLock} onCheckedChange={onScrollLockChange} />
                </div>

                <button
                    onClick={onCopyLogs}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-muted hover:bg-muted border border-border text-[9px] font-mono text-muted-foreground hover:text-foreground transition-all press"
                >
                    <span>Export Log History</span>
                    {copiedActive ? (
                        <Check size={11} className="text-success" />
                    ) : (
                        <Copy size={11} className="text-muted-foreground" />
                    )}
                </button>

                <button
                    onClick={onClear}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-muted hover:bg-destructive hover:text-destructive-foreground hover:border-destructive border border-border text-[9px] font-mono text-muted-foreground transition-all press"
                >
                    <span>Clear Screen Buffer</span>
                    <Trash2 size={11} className="text-muted-foreground group-hover:text-destructive-foreground" />
                </button>
            </div>

            <div className="p-4 space-y-3 select-none flex-grow bg-muted">
                <div className="flex items-center gap-1.5">
                    <History size={11} className="text-muted-foreground" />
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">COMMAND HISTORY</span>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-none pr-1">
                    {commandHistory.length > 0 ? (
                        commandHistory.map((cmd, idx) => (
                            <button
                                key={idx}
                                onClick={() => onLoadCommand(cmd)}
                                className="w-full text-left truncate px-3.5 py-2 rounded-full bg-muted hover:bg-primary/10 hover:border-primary border border-border text-[9.5px] font-mono text-muted-foreground hover:text-primary transition-all select-none press"
                                title="Click to load command"
                            >
                                {cmd}
                            </button>
                        ))
                    ) : (
                        <div className="text-[8px] font-mono text-muted-foreground italic select-none text-center py-4">
                            No recent commands
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
