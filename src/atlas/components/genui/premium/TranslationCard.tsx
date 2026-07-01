import { ArrowRight } from "lucide-react";

interface TranslationData {
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  romanization?: string;
  alternatives?: string[];
  confidence?: "high" | "medium" | "low" | string;
}

export function TranslationCard({ data }: { data: TranslationData }) {
  const sourceText = data.sourceText || "";
  const sourceLang = data.sourceLang || "Source";
  const targetText = data.targetText || "";
  const targetLang = data.targetLang || "Target";
  const romanization = data.romanization;
  const alternatives = data.alternatives || [];
  const confidence = data.confidence;

  const getConfidenceColor = (c: string) => {
    switch (c.toLowerCase()) {
      case "high":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
      case "low":
        return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      default:
        return "text-amber-400 border-amber-500/20 bg-amber-500/10";
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-primary-foreground/40 uppercase tracking-widest">
            {sourceLang}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-primary-foreground/30" />
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
            {targetLang}
          </span>
        </div>
        
        {confidence && (
          <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getConfidenceColor(confidence)}`}>
            {confidence} Match
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary-foreground/20 mb-1">
            Original Text
          </span>
          <p className="text-sm font-medium text-primary-foreground/70 leading-relaxed font-sans">
            {sourceText}
          </p>
        </div>

        <div className="flex flex-col pt-3.5 border-t border-border/[0.06]">
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary/60 mb-1">
            Translation
          </span>
          <p className="text-base font-bold text-primary-foreground leading-relaxed font-sans">
            {targetText}
          </p>
          {romanization && (
            <p className="text-[11px] font-mono text-primary/70 mt-1 italic">
              {romanization}
            </p>
          )}
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="mt-5 pt-3.5 border-t border-border/[0.06]">
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary-foreground/20 block mb-2">
            Alternative Translations
          </span>
          <ul className="space-y-1.5 list-none pl-0">
            {alternatives.map((alt, idx) => (
              <li key={idx} className="text-[11px] text-primary-foreground/50 leading-relaxed pl-3 relative before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-card/10">
                {alt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
