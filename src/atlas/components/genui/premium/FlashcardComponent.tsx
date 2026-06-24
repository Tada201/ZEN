import { useState } from "react";
import { HelpCircle, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlashcardData {
  front: string;
  back: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard" | string;
  deck?: string;
  hint?: string;
}

export function FlashcardComponent({ data }: { data: FlashcardData }) {
  const front = data.front || "Question";
  const back = data.back || "Answer";
  const topic = data.topic || "General";
  const difficulty = (data.difficulty || "medium").toLowerCase();
  const deck = data.deck;
  const hint = data.hint;

  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const getDifficultyColor = (d: string) => {
    switch (d) {
      case "easy":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
      case "hard":
        return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      default:
        return "text-amber-400 border-amber-500/20 bg-amber-500/10";
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg flex flex-col min-h-[220px] justify-between relative overflow-hidden group">
      {/* Card Header metadata */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest truncate">
            {deck ? `${deck} · ` : ""}{topic}
          </span>
        </div>

        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 ${getDifficultyColor(difficulty)}`}>
          {difficulty}
        </span>
      </div>

      {/* Main Flashcard Content Area */}
      <div className="flex-1 flex flex-col justify-center py-4 text-center">
        {!flipped ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary/70 mb-1 flex items-center justify-center gap-1">
              <HelpCircle className="w-3 h-3" /> Question
            </h4>
            <p className="text-sm font-semibold text-white leading-relaxed font-sans">
              {front}
            </p>
            {hint && (
              <div className="mt-2.5">
                {showHint ? (
                  <p className="text-[10px] text-white/40 italic leading-normal">
                    Hint: {hint}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowHint(true)}
                    className="text-[9px] text-primary/60 hover:text-primary hover:underline font-mono"
                  >
                    Reveal Hint
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200">
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-1">
              Answer & Explanation
            </h4>
            <p className="text-sm font-bold text-white leading-relaxed font-sans">
              {back}
            </p>
          </div>
        )}
      </div>

      {/* Flip controls */}
      <div className="flex justify-center mt-3 pt-3.5 border-t border-white/[0.06]">
        <Button
          size="sm"
          type="button"
          onClick={() => {
            setFlipped(!flipped);
            setShowHint(false);
          }}
          className="h-8 text-xs font-semibold px-4 flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{flipped ? "Show Question" : "Reveal Answer"}</span>
        </Button>
      </div>
    </div>
  );
}
