import { Cpu, Zap, Activity } from 'lucide-react';

export function StatusBar() {
  return (
    <div className="flex items-center justify-between w-full h-full px-4 text-xs font-sans text-zinc-400 capitalize tracking-normal">
      {/* Left Section: Operational telemetry */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-zinc-500">
          <Activity size={12} className="text-zinc-500/80" />
          <span>Thinking: <span className="font-mono text-[11px] text-zinc-300 font-medium">Unlimited</span></span>
        </div>

        <div className="h-3 w-px bg-white/5" />

        <div className="flex items-center gap-2 text-zinc-500">
          <Zap size={12} className="text-zinc-500/80" />
          <span>Latency: <span className="font-mono text-[11px] text-zinc-300 font-medium">9ms</span></span>
        </div>

        <div className="h-3 w-px bg-white/5" />

        <div className="flex items-center gap-2 text-zinc-500">
          <Cpu size={12} className="text-zinc-500/80" />
          <span>NPU Load: <span className="font-mono text-[11px] text-zinc-300 font-medium">12.4%</span></span>
        </div>
      </div>

      {/* Right Section: System info */}
      <div className="flex items-center gap-2 text-zinc-600 font-medium text-[11px]">
        <span>Zen OS v2.0.4</span>
      </div>
    </div>
  );
}