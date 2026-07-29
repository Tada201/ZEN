import { useState } from "react";
import { HelpCircle, Check, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PollOption {
  id: string;
  label: string;
  description?: string;
}

interface PollData {
  question: string;
  options: PollOption[];
  allowMultiple?: boolean;
  context?: string;
}

export function PollCard({ data }: { data: PollData }) {
  const question = data.question || "Choose an option";
  const options = data.options || [];
  const allowMultiple = !!data.allowMultiple;
  const context = data.context;

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const toggleOption = (id: string) => {
    if (submitted) return;
    if (allowMultiple) {
      setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    } else {
      setSelected({ [id]: true });
    }
  };

  const handleClear = () => {
    if (submitted) return;
    setSelected({});
  };

  const hasSelection = Object.values(selected).some(Boolean);

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex items-start gap-2.5 mb-3.5">
        <div className="p-1.5 rounded-lg border border-primary bg-primary/10 text-primary shrink-0 mt-0.5">
          <HelpCircle className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[9px] uppercase font-mono tracking-widest text-primary">
            {allowMultiple ? "Multiple Choice Poll" : "Single Choice Poll"}
          </span>
          <h3 className="text-sm font-semibold text-primary-foreground mt-0.5 leading-snug">{question}</h3>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {options.map((opt) => {
          const isSelected = !!selected[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              disabled={submitted}
              onClick={() => toggleOption(opt.id)}
              className={`flex items-start gap-3 w-full text-left p-3 rounded-xl border transition-all ${
                isSelected
                  ? "bg-primary/10 border-primary text-primary-foreground"
                  : "bg-muted border-border hover:bg-muted text-primary-foreground hover:text-primary-foreground"
              } ${submitted ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <div className="shrink-0 mt-0.5 text-primary">
                {allowMultiple ? (
                  isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-50" />
                ) : (
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-border"}`}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-semibold block">{opt.label}</span>
                {opt.description && (
                  <span className="text-[10px] text-muted-foreground block mt-0.5 leading-relaxed">{opt.description}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 mt-2">
        {context ? (
          <span className="text-[10px] text-muted-foreground leading-normal">{context}</span>
        ) : (
          <div />
        )}

        <div className="flex gap-2 shrink-0">
          {!submitted && hasSelection && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={handleClear}
              className="h-8 text-xs font-semibold text-primary-foreground hover:text-primary-foreground hover:bg-muted px-3"
            >
              Clear
            </Button>
          )}
          <Button
            size="sm"
            type="button"
            disabled={!hasSelection || submitted}
            onClick={() => setSubmitted(true)}
            className="h-8 text-xs font-semibold px-4"
          >
            {submitted ? (
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3" /> Submitted
              </span>
            ) : (
              "Submit Choice"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
