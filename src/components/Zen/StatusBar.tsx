import { Lock, Globe, Satellite, Cpu, Zap, Activity } from 'lucide-react';

export function StatusBar() {
  return (
    <div className="flex items-center justify-between w-full h-full px-2 text-[10px] font-mono tracking-wider uppercase">
      {/* Left Section: Security & Network */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-[hsl(160_84%_39%)]">
          <Lock size={10} />
          <span className="font-bold">SECURE CHANNEL</span>
        </div>

        <div className="h-3 w-px bg-white/5" />

        <div className="flex items-center gap-2 text-muted-foreground">
          <Globe size={10} />
          <span>OSINT_NET: <span className="text-primary font-bold">LINK_ESTABLISHED</span></span>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Satellite size={10} />
          <span>SATELLITE: <span className="text-foreground">PAL-07</span></span>
        </div>
      </div>

      {/* Right Section: System Metrics */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu size={10} />
          <span>NPU LOAD: <span className="text-foreground">12.4%</span></span>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap size={10} />
          <span>LATENCY: <span className="text-[hsl(160_84%_39%)]">9ms</span></span>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity size={10} />
          <span>THINKING_BUDGET: <span className="text-foreground">UNLIMITED</span></span>
        </div>

        <div className="h-3 w-px bg-white/5" />

        <div className="text-primary font-black tracking-[0.2em] opacity-80">
          ZEN_OS v2.0.4-STABLE
        </div>
      </div>
    </div>
  );
}