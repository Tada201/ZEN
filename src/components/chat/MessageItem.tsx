import { useState, memo } from "react";
import { 
  Bot, User, Zap, ChevronDown, MoreHorizontal, Copy, RefreshCw, AlertCircle, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/style";
import { Message, ArtifactData, Step } from "./types";
import { MarkdownContent } from "./MarkdownContent";
import { ToolCallCard } from "./ToolCallCard";
import { toast } from "sonner";

export const MessageItem = memo(function MessageItem({
  message,
  onOpenArtifact,
  onRetry,
  onOpenSettings,
  isStreaming: isStreamingProp,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: any, provider?: string) => void;
  isStreaming?: boolean;
  compact?: boolean;
}) {
  const isAssistant = message.role === "assistant";
  const [showToolCalls, setShowToolCalls] = useState(true);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success("Copied to clipboard");
  };

  const renderStep = (step: Step, index: number) => {
    switch (step.type) {
      case 'text':
        return (
          <MarkdownContent
            key={index}
            content={step.content}
            isStreaming={isStreamingProp && index === (message.steps?.length || 1) - 1}
            onOpenArtifact={onOpenArtifact}
          />
        );
      case 'reasoning':
        return (
          <div key={index} className="my-2">
            <MarkdownContent
              content={step.content}
              isThinking={true}
              isStreaming={isStreamingProp && index === (message.steps?.length || 1) - 1}
              onOpenArtifact={onOpenArtifact}
            />
          </div>
        );
      case 'tool_call':
        if (!step.toolCall) return null;
        return (
          <div key={index} className="my-2">
            <ToolCallCard 
              toolCall={step.toolCall} 
              onViewArtifact={onOpenArtifact} 
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "group flex w-full flex-col px-4 transition-colors relative",
        isAssistant ? (compact ? "bg-background py-2" : "bg-background py-4") : (compact ? "bg-muted/5 py-1" : "bg-muted/5 py-2"),
        message.status === 'error' && "bg-rose-500/5"
      )}
    >
      <div className={cn(
        "mx-auto flex w-full items-start gap-4",
        compact ? "max-w-full" : "max-w-[800px]",
        !isAssistant && "flex-row-reverse"
      )}>
        {/* Avatar */}
        <div className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-sm transition-all duration-300",
          isAssistant 
            ? message.status === 'error' 
              ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
              : "bg-primary/10 text-primary border-primary/20" 
            : "bg-muted text-muted-foreground border-border/50"
        )}>
          {isAssistant ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </div>

        {/* Content Area */}
        <div className={cn(
          "flex min-w-0 flex-col gap-2",
          isAssistant ? "flex-1" : "max-w-[85%] items-end"
        )}>
          <div className="relative w-full">
            {isAssistant ? (
              <div className={cn("space-y-4", compact && "space-y-2")}>
                {/* Model & Provider Badge */}
                {(message.model || message.provider) && (
                  <div className="flex items-center justify-between mb-2 select-none">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/5 border-primary/10 text-primary/60">
                        <Zap className="mr-1 h-3 w-3" />
                        {message.model || "Default"}
                        {message.provider && (
                          <span className="ml-1 opacity-40 border-l border-primary/20 pl-1 uppercase">
                            {message.provider}
                          </span>
                        )}
                      </Badge>
                      {message.status === 'error' && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Error
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Steps Rendering */}
                {message.steps && message.steps.length > 0 ? (
                  <div className="space-y-2">
                    {message.steps.map((step, idx) => renderStep(step, idx))}
                  </div>
                ) : (
                  <>
                    <MarkdownContent
                      content={message.content}
                      reasoning={message.reasoning}
                      isThinking={message.isThinking}
                      isStreaming={isStreamingProp}
                      onOpenArtifact={onOpenArtifact}
                    />

                    {/* Fallback Tool Calls if not in steps */}
                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div 
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 transition-colors"
                          onClick={() => setShowToolCalls(!showToolCalls)}
                        >
                          <ChevronDown className={cn("h-3 w-3 transition-transform", !showToolCalls && "-rotate-90")} />
                          {message.toolCalls.length} Tool Calls
                        </div>
                        {showToolCalls && (
                          <div className="space-y-2">
                            {message.toolCalls.map((tc) => (
                              <ToolCallCard key={tc.id} toolCall={tc} onViewArtifact={onOpenArtifact} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Error Block */}
                {message.status === 'error' && (
                  <div className="mt-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 space-y-3">
                    <div className="text-xs font-medium leading-relaxed">
                      {message.content || "An unexpected error occurred during processing."}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold uppercase border-rose-500/20 hover:bg-rose-500/10"
                        onClick={() => onRetry?.(message.id)}
                      >
                        <RefreshCw className="mr-1.5 h-3 w-3" />
                        Retry Message
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold uppercase hover:bg-rose-500/10"
                        onClick={() => onOpenSettings?.('providers')}
                      >
                        <Settings className="mr-1.5 h-3 w-3" />
                        Configure Provider
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-muted/50 px-4 py-2.5 text-sm text-foreground shadow-sm ring-1 ring-border/50 max-w-full break-words">
                {message.content}
              </div>
            )}
          </div>
        </div>

        {/* Hover Actions */}
        <div className={cn(
          "flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4",
          !isAssistant && "right-auto left-4"
        )}>
          <div className="flex bg-background/80 backdrop-blur-md border border-border/50 rounded-lg shadow-xl p-0.5">
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              title="Copy Message"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {isAssistant && (
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onRetry?.(message.id)}
                title="Retry"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
