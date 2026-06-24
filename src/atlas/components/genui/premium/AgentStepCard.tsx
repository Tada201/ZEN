import { Terminal, Clock, Play, CheckCircle2, AlertTriangle, Cpu } from "lucide-react";

interface AgentStepData {
  stepNumber: number;
  totalSteps?: number | null;
  tool: string;
  input: string;
  output: string;
  status: "running" | "done" | "error" | string;
  duration?: number;
  reasoning?: string;
}

export function AgentStepCard({ data }: { data: AgentStepData }) {
  const stepNumber = data.stepNumber ?? 1;
  const totalSteps = data.totalSteps;
  const tool = data.tool || "tool_exec";
  const input = data.input || "";
  const output = data.output || "";
  const status = (data.status || "done").toLowerCase();
  const duration = data.duration;
  const reasoning = data.reasoning;

  const getStatusColor = (s: string) => {
    switch (s) {
      case "running":
        return "text-blue-400 border-blue-500/20 bg-blue-500/10 animate-pulse";
      case "error":
        return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      default:
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case "running":
        return <Play className="w-3.5 h-3.5 animate-spin" />;
      case "error":
        return <AlertTriangle className="w-3.5 h-3.5" />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-white/70">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest block">
              Step {stepNumber}{totalSteps ? ` of ${totalSteps}` : ""}
            </span>
            <h3 className="text-sm font-semibold text-white leading-tight font-mono">
              {tool}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {duration !== undefined && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-white/40">
              <Clock className="w-2.5 h-2.5" /> {duration}ms
            </span>
          )}
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusColor(status)}`}>
            {getStatusIcon(status)}
            <span>{status}</span>
          </span>
        </div>
      </div>

      {reasoning && (
        <div className="mb-3.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/30 block mb-1">
            Agent Reasoning
          </span>
          <p className="text-[11px] text-white/70 leading-relaxed italic">
            "{reasoning}"
          </p>
        </div>
      )}

      <div className="space-y-2 text-[10px] font-mono">
        <div className="flex flex-col p-2.5 rounded-lg bg-black/50 border border-white/[0.03]">
          <span className="text-[9px] uppercase tracking-wider text-white/30 mb-1 flex items-center gap-1">
            <Terminal className="w-2.5 h-2.5 text-white/20" /> Input Payload
          </span>
          <p className="text-white/80 leading-normal line-clamp-3 select-all whitespace-pre-wrap break-all">
            {input}
          </p>
        </div>

        {output && (
          <div className="flex flex-col p-2.5 rounded-lg bg-black/50 border border-white/[0.03]">
            <span className="text-[9px] uppercase tracking-wider text-white/30 mb-1 flex items-center gap-1">
              <Terminal className="w-2.5 h-2.5 text-white/20" /> Result Output
            </span>
            <p className="text-white/80 leading-normal line-clamp-4 select-all whitespace-pre-wrap break-all">
              {output}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
