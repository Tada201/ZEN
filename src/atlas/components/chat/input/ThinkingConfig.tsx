import { Brain } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

interface ThinkingConfigProps {
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  reasoningConfigType: 'none' | 'effort' | 'budget';
  thinkingEffort: "low" | "medium" | "high";
  setThinkingEffort: (val: "low" | "medium" | "high") => void;
  thinkingBudget: number;
  setThinkingBudget: (val: number) => void;
  provider?: string;
}

function isThinkingEffort(value: string): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

export const ThinkingConfig = ({
  isThinking, setIsThinking,
  reasoningConfigType,
  thinkingEffort, setThinkingEffort,
  thinkingBudget, setThinkingBudget,
  provider
}: ThinkingConfigProps) => {
  const isGoogle = provider?.toLowerCase() === 'google' || provider?.toLowerCase() === 'gemini';
  const effortLabel = isGoogle ? "Thinking Level" : "Reasoning Effort";
  // 'none' models reason natively with no tunable parameter — the payload
  // builder reports enabled:false, so there is no on/off state to expose.
  const isTunable = reasoningConfigType === 'effort' || reasoningConfigType === 'budget';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-warning" />
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Reasoning Config</span>
        </div>
        {isTunable && (
          <button
            type="button"
            onClick={() => setIsThinking(!isThinking)}
            aria-pressed={isThinking}
            aria-label={isThinking ? "Disable reasoning" : "Enable reasoning"}
            className="flex items-center gap-2 cursor-pointer group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest transition-colors",
              isThinking ? "text-warning" : "text-muted-foreground group-hover:text-muted-foreground"
            )}>
              {isThinking ? "Active" : "Off"}
            </span>
            <div className={cn(
              "composer-control relative h-5 w-8 rounded-full p-0.5 transition-colors duration-200",
              isThinking ? "bg-warning text-warning-foreground" : "bg-muted"
            )}>
              <div className={cn(
                "h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out",
                isThinking ? "translate-x-3.5" : "translate-x-0"
              )} />
            </div>
          </button>
        )}
      </div>

      <div className={cn("space-y-3 transition-opacity", isTunable && !isThinking && "opacity-50 pointer-events-none")}>

        {/* Effort Selection - OpenAI Style */}
        {reasoningConfigType === 'effort' && (
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>{effortLabel}</span>
              <span className="text-warning">{thinkingEffort}</span>
            </div>
            <ToggleGroup 
              type="single" 
              value={thinkingEffort} 
              onValueChange={(v) => {
                if (isThinkingEffort(v)) {
                  setThinkingEffort(v);
                  setIsThinking(true);
                }
              }}
              className="justify-start w-full rounded-md border border-border bg-muted p-0.5"
            >
              <ToggleGroupItem value="low" className="composer-control h-7 min-h-0 flex-1 text-[11px] data-[state=on]:bg-card data-[state=on]:shadow-sm">Low</ToggleGroupItem>
              <ToggleGroupItem value="medium" className="composer-control h-7 min-h-0 flex-1 text-[11px] data-[state=on]:bg-card data-[state=on]:shadow-sm">Medium</ToggleGroupItem>
              <ToggleGroupItem value="high" className="composer-control h-7 min-h-0 flex-1 text-[11px] data-[state=on]:bg-card data-[state=on]:shadow-sm">High</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* Token Budget - Anthropic Style */}
        {reasoningConfigType === 'budget' && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Thinking Budget</span>
              <span className="text-foreground">{thinkingBudget.toLocaleString()} tokens</span>
            </div>
            <Slider 
              value={[thinkingBudget]} 
              min={1024} 
              max={32768} 
              step={1024}
              onValueChange={([v]) => {
                setThinkingBudget(v);
                setIsThinking(true);
              }}
              className="py-2"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground font-medium">
              <span>1K</span>
              <span>16K</span>
              <span>32K</span>
            </div>
          </div>
        )}

        {/* Informational note for models that reason natively with no tunable
            parameter — shown at full opacity; there is no toggle to dim. */}
        {reasoningConfigType === 'none' && (
          <div className="composer-meta rounded-md bg-muted px-2.5 py-1.5 text-center text-[10px] italic">
            This model reasons natively; reasoning depth isn't configurable from Zen.
          </div>
        )}
      </div>
    </div>
  );
};
