import { Terminal, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TerminalData {
  shell: string;
  cwd: string;
  command: string;
  output: string;
  stderr?: string;
  exitCode: number;
  duration?: string;
}

export function TerminalCard({ data }: { data: TerminalData }) {
  const shell = data.shell || "bash";
  const cwd = data.cwd || "~";
  const command = data.command || "";
  const output = data.output || "";
  const stderr = data.stderr || "";
  const exitCode = data.exitCode ?? 0;
  const duration = data.duration;

  const isSuccess = exitCode === 0;

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card overflow-hidden shadow-lg flex flex-col font-mono text-[10px]">
      {/* Terminal Titlebar Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold text-primary-foreground tracking-wider">
            {shell} · {cwd}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {duration && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" /> {duration}
            </span>
          )}
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${
            isSuccess
              ? "text-emerald-400 border-emerald-500 bg-emerald-500/10"
              : "text-rose-400 border-rose-500 bg-rose-500/10"
          }`}>
            {isSuccess ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
            <span>Exit {exitCode}</span>
          </span>
        </div>
      </div>

      {/* Terminal Content Box */}
      <div className="p-4 bg-card min-h-[100px] max-h-72 overflow-y-auto flex flex-col gap-1.5 whitespace-pre font-mono leading-relaxed select-all">
        {/* Command string line */}
        <div className="flex items-center gap-2 text-primary font-bold">
          <span className="text-muted-foreground shrink-0">$</span>
          <span className="overflow-x-auto whitespace-pre font-mono">{command}</span>
        </div>

        {/* Output lines */}
        {output && (
          <div className="text-primary-foreground overflow-x-auto whitespace-pre font-mono">
            {output}
          </div>
        )}

        {/* Stderr lines */}
        {stderr && (
          <div className="text-rose-400/90 overflow-x-auto whitespace-pre font-mono">
            {stderr}
          </div>
        )}
      </div>
    </div>
  );
}
