interface XTermStatusFooterProps {
    hasActiveSession: boolean;
    cols: number;
    rows: number;
}

export function XTermStatusFooter({ hasActiveSession, cols, rows }: XTermStatusFooterProps) {
    return (
        <div className="h-6 flex items-center justify-between px-4 bg-background border-t border-border shrink-0 select-none">
            <div className="flex items-center gap-3">
                <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                    ENCODE: UTF-8
                </span>
                <div className="w-[1px] h-2.5 bg-border" />
                <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                    BAUD: 115200 BD
                </span>
                {hasActiveSession && (
                    <>
                        <div className="w-[1px] h-2.5 bg-border" />
                        <span className="text-[7.5px] font-mono text-muted-foreground/75 uppercase tracking-widest">
                            GRID: {cols}x{rows}
                        </span>
                    </>
                )}
            </div>
            <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                SHELL CORE v1.2-TAURI
            </span>
        </div>
    );
}
