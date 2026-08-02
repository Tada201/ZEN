import { Terminal, Clock, Play, CheckCircle2, AlertTriangle, Cpu } from "lucide-react";
import { CardShell } from "./CardShell";

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
        return "text-primary border-primary bg-primary/10";
      case "error":
        return "text-destructive border-destructive bg-destructive/10";
      default:
        return "text-success border-success bg-success/10";
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case "running":
        return <Play className="w-3.5 h-3.5 motion-safe:animate-spin" />;
      case "error":
        return <AlertTriangle className="w-3.5 h-3.5" />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5" />;
    }
  };

  return (
    <CardShell padded={false} className="w-full max-w-md flex flex-col p-5">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-border bg-muted text-primary-foreground">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest block">
              Step {stepNumber}{totalSteps ? ` of ${totalSteps}` : ""}
            </span>
            <h3 className="text-sm font-semibold text-primary-foreground leading-tight font-mono">
              {tool}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {duration !== undefined && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground">
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
        <div className="mb-3.5 p-3 rounded-xl bg-muted border border-border">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
            Agent Reasoning
          </span>
          <p className="text-[11px] text-primary-foreground leading-relaxed italic">
            "{reasoning}"
          </p>
        </div>
      )}

      <div className="space-y-2 text-[10px] font-mono">
        <div className="flex flex-col p-2.5 rounded-lg bg-card border border-border">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Terminal className="w-2.5 h-2.5 text-muted-foreground" /> Input Payload
          </span>
          <p className="text-primary-foreground leading-normal line-clamp-3 select-all whitespace-pre-wrap break-all">
            {input}
          </p>
        </div>

        {output && (
          <div className="flex flex-col p-2.5 rounded-lg bg-card border border-border">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Terminal className="w-2.5 h-2.5 text-muted-foreground" /> Result Output
            </span>
            <p className="text-primary-foreground leading-normal line-clamp-4 select-all whitespace-pre-wrap break-all">
              {output}
            </p>
          </div>
        )}
      </div>
    </CardShell>
  );
}
