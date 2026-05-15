import React, { useRef } from 'react';
import { ArrowUp, Paperclip, Search, Globe, Shield } from 'lucide-react';
import { cn } from '../../lib/utils/style';

interface UnifiedInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading?: boolean;
}

/**
 * Floating, glass-morphic input bar.
 * Designed for a premium, agent-first interaction experience.
 */
export function UnifiedInput({ input = '', handleInputChange, handleSubmit, isLoading }: UnifiedInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[800px] px-6 z-50">
      <form 
        onSubmit={handleSubmit}
        className="glass-panel flex flex-col rounded-[26px] p-2 pr-3 shadow-2xl ring-1 ring-primary/5 transition-all focus-within:ring-primary/20 focus-within:shadow-primary/10"
      >
        <div className="flex items-end gap-2">
          {/* Tool shortcuts */}
          <div className="flex flex-col gap-1 pb-1.5 pl-1">
             <button type="button" className="p-1.5 rounded-full hover:bg-muted text-muted-foreground/60 hover:text-primary transition-colors">
               <Paperclip size={18} />
             </button>
          </div>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="Ask anything or trigger OSINT search..."
            className="flex-1 max-h-[200px] py-3 px-1 bg-transparent border-none focus:ring-0 text-[14.5px] placeholder:text-muted-foreground/40 resize-none outline-none"
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              "p-2 rounded-full transition-all duration-200 shrink-0 mb-1",
              input.trim() 
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105 active:scale-95" 
                : "bg-muted text-muted-foreground/30"
            )}
          >
            <ArrowUp size={20} />
          </button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-4 px-3 py-1.5 mt-1 border-t border-border/10">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50">
             <Globe size={12} />
             <span>Web Enabled</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50">
             <Search size={12} />
             <span>OSINT Active</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-emerald-500/50">
             <Shield size={12} />
             <span>Local-First Vault</span>
          </div>
        </div>
      </form>
    </div>
  );
}
