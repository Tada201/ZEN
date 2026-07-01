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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-warning" />
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 dark:text-muted-foreground">Reasoning Config</span>
        </div>
        <div 
          onClick={() => setIsThinking(!isThinking)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest transition-colors",
            isThinking ? "text-warning" : "text-muted-foreground group-hover:text-muted-foreground"
          )}>
            {isThinking ? "Active" : "Off"}
          </span>
          <div className={cn(
            "w-8 h-4.5 rounded-full p-0.5 transition-all duration-300 relative",
            isThinking ? "bg-warning shadow-[0_0_10px_-2px_hsl(var(--primary) / 0.5)]" : "bg-muted dark:bg-muted"
          )}>
            <div className={cn(
              "w-3.5 h-3.5 rounded-full bg-card shadow-sm transition-transform duration-300 ease-spring",
              isThinking ? "translate-x-3.5" : "translate-x-0"
            )} />
          </div>
        </div>
      </div>

      <div className={cn("space-y-4 transition-opacity", !isThinking && "opacity-50 pointer-events-none")}>
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
              className="justify-start w-full bg-muted dark:bg-muted p-1 rounded-lg border border-border dark:border-border"
            >
              <ToggleGroupItem value="low" className="flex-1 text-[11px] h-7 data-[state=on]:bg-card dark:data-[state=on]:bg-muted data-[state=on]:shadow-sm">Low</ToggleGroupItem>
              <ToggleGroupItem value="medium" className="flex-1 text-[11px] h-7 data-[state=on]:bg-card dark:data-[state=on]:bg-muted data-[state=on]:shadow-sm">Medium</ToggleGroupItem>
              <ToggleGroupItem value="high" className="flex-1 text-[11px] h-7 data-[state=on]:bg-card dark:data-[state=on]:bg-muted data-[state=on]:shadow-sm">High</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* Token Budget - Anthropic Style */}
        {reasoningConfigType === 'budget' && (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Thinking Budget</span>
              <span className="text-muted-foreground/70 dark:text-foreground">{thinkingBudget.toLocaleString()} tokens</span>
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

        {/* Fallback/Generic message for reasoning models without tunable params in UI */}
        {reasoningConfigType === 'none' && (
          <div className="text-[10px] text-muted-foreground italic text-center py-2 px-4 bg-muted dark:bg-muted/60 rounded-lg">
            This model supports reasoning natively. Enabling it ensures the assistant uses its deep thinking capabilities for your request.
          </div>
        )}
      </div>
    </div>
  );
};
