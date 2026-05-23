import { cn } from '@/lib/utils';

export interface TerminalOutput {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  result?: string;
}

interface TerminalWidgetProps {
  output: TerminalOutput | null | undefined;
  command: string;
}

export function TerminalWidget({ output, command }: TerminalWidgetProps) {
  const safeOutput = output || {};
  return (
    <div className="bg-black/40 font-mono text-[12.5px] leading-relaxed">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rose-500/30" />
          <div className="w-2 h-2 rounded-full bg-amber-500/30" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
        </div>
        <div className="text-[10px] text-white/20 tracking-widest uppercase">bash — exit {safeOutput.exitCode ?? 0}</div>
      </div>
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-2">
          <span className="text-white/20">$</span>
          <span className="text-cyan-400/80">{command}</span>
        </div>
        <div className={cn(
          "mt-1.5",
          safeOutput.exitCode === 0 ? "text-white/40" : "text-rose-400/60"
        )}>
          {safeOutput.stdout || safeOutput.stderr || safeOutput.result || 'Done.'}
        </div>
      </div>
    </div>
  );
}
