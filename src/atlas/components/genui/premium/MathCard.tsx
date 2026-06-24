import { Sigma, Award } from "lucide-react";

interface MathStep {
  description: string;
  expression: string;
  latex?: string;
}

interface MathData {
  expression: string;
  result: string;
  latex?: string;
  steps: MathStep[];
  domain?: string;
}

export function MathCard({ data }: { data: MathData }) {
  const expression = data.expression || "";
  const result = data.result || "";
  const steps = data.steps || [];
  const domain = data.domain || "Mathematics";

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary/70">
            {domain} Solver
          </span>
          <h3 className="text-sm font-semibold text-white mt-0.5 leading-snug">
            {expression}
          </h3>
        </div>
        <Sigma className="w-5 h-5 text-white/20" />
      </div>

      {steps.length > 0 && (
        <div className="mb-4 space-y-3.5">
          <span className="text-[9px] uppercase font-mono tracking-widest text-white/20 block">
            Step-by-step Working
          </span>
          <div className="space-y-3 pl-4 relative before:absolute before:left-2 before:top-2.5 before:h-[calc(100%-16px)] before:w-px before:bg-white/[0.06]">
            {steps.map((step, idx) => (
              <div key={idx} className="relative flex flex-col gap-0.5">
                <span className="absolute -left-[20px] top-1 w-2.5 h-2.5 rounded-full border border-white/20 bg-black shrink-0" />
                <span className="text-[11px] text-white/40 leading-normal font-sans">
                  {step.description}
                </span>
                <span className="text-xs font-semibold font-mono text-white/80 mt-0.5 leading-snug">
                  {step.expression}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-bold text-white/50">Final Answer</span>
        </div>
        <span className="text-sm font-bold text-emerald-400 font-mono">
          {result}
        </span>
      </div>
    </div>
  );
}
