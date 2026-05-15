import { Message } from 'ai';
import { ThoughtBlock } from './ThoughtBlock';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/utils/style';

interface ChatTimelineProps {
  messages: Message[];
  isLoading?: boolean;
}

/**
 * Message timeline for the agentic chat.
 * Renders user messages, assistant responses, and reasoning/tool blocks.
 */
export function ChatTimeline({ messages = [], isLoading }: ChatTimelineProps) {
  return (
    <div className="flex flex-col gap-6 p-6 pb-32">
      {messages.map((message, i) => (
        <div 
          key={message.id} 
          className={cn(
            "flex flex-col max-w-[85%] animate-fade-in-up",
            message.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
          )}
        >
          {/* Message Bubble */}
          <div className={cn(
            "px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed shadow-sm",
            message.role === 'user' 
              ? "bg-primary text-primary-foreground rounded-tr-none" 
              : "bg-card border border-border/50 text-foreground rounded-tl-none glass-panel"
          )}>
            {message.content}
          </div>

          {/* Reasoning / Tools (Simplified Mocking for now) */}
          {message.role === 'assistant' && i === messages.length - 1 && isLoading && (
            <div className="w-full mt-2">
              <ThoughtBlock content="Analyzing telemetry data streams..." isThinking={true} />
              <ToolCallCard toolCall={{ id: 'mock-1', name: 'adsb.search', input: { callsign: 'VN123' }, output: '', status: 'running' }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
