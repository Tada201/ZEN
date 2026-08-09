import React, { memo, useRef } from 'react';
import { Plus, Paperclip, Camera, ImageIcon, Lightbulb, Compass, Globe, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MenuItem } from './MenuItem';

interface PlusActionMenuProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pinnedActions: string[];
  togglePin: (id: string) => void;
  supportsReasoning: boolean;
  isThinking: boolean;
  setIsThinking: (val: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (val: boolean) => void;
  isWebSearch: boolean;
  setIsWebSearch: (val: boolean) => void;
  generativeUI: boolean;
  setGenerativeUI: (val: boolean) => void;
  onOpenSkills?: () => void;
  supportsImageGen?: boolean;
  isImageGenEnabled?: boolean;
  setIsImageGenEnabled?: (val: boolean) => void;
  compact?: boolean;
}

export const PlusActionMenu = memo(({
  isOpen, setIsOpen,
  onFileSelect,
  pinnedActions, togglePin,
  supportsReasoning, isThinking, setIsThinking,
  isDeepResearch, setIsDeepResearch,
  isWebSearch, setIsWebSearch,
  generativeUI, setGenerativeUI,
  onOpenSkills,
  isImageGenEnabled,
  setIsImageGenEnabled,
  compact = false,
}: PlusActionMenuProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={onFileSelect} 
        accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.csv,.xml,.yaml,.yml,.toml,.py,.rs,.go,.c,.cpp,.h"
      />
      <button 
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-label={isOpen ? "Close add menu" : "Open add menu"}
        title={isOpen ? "Close add menu" : "Open add menu"}
        className={cn(
          compact
            ? "p-1 rounded-md transition-all border flex items-center justify-center"
            : "mt-0.5 p-1.5 rounded-md transition-all border flex items-center justify-center",
          isOpen 
            ? "bg-muted dark:bg-muted border-border dark:border-border" 
            : "bg-transparent border-transparent hover:bg-muted dark:hover:bg-muted text-muted-foreground"
        )}
      >
        <Plus className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4", "transition-transform duration-200", isOpen && "rotate-45")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="absolute bottom-full left-0 mb-2 w-56 bg-card dark:bg-muted border border-border dark:border-border rounded-xl shadow-2xl z-30 p-1.5 text-foreground/80 dark:text-foreground"
            >
              <div className="space-y-0.5">
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Add Content</div>
                <MenuItem icon={Paperclip} label="Photos & Files" onClick={() => fileInputRef.current?.click()} />
                <MenuItem icon={Camera} label="Screenshot" />
                <MenuItem 
                  icon={ImageIcon} 
                  label="Create Image" 
                  active={isImageGenEnabled}
                  onClick={() => {
                    if (setIsImageGenEnabled) {
                      setIsImageGenEnabled(!isImageGenEnabled);
                    }
                    setIsOpen(false);
                  }}
                />

                <div className="h-px bg-muted dark:bg-muted my-1 mx-2" />
                
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Capabilities</div>
                
                {!pinnedActions.includes('thinking') && supportsReasoning && (
                  <MenuItem 
                    icon={Lightbulb} 
                    label="Thinking" 
                    active={isThinking}
                    onPin={() => togglePin('thinking')}
                    onClick={() => { setIsThinking(!isThinking); setIsOpen(false); }}
                  />
                )}
                
                {!pinnedActions.includes('research') && (
                  <MenuItem 
                    icon={Compass} 
                    label="Deep Research" 
                    active={isDeepResearch}
                    onPin={() => togglePin('research')}
                    onClick={() => { setIsDeepResearch(!isDeepResearch); setIsOpen(false); }}
                  />
                )}
                
                {!pinnedActions.includes('search') && (
                  <MenuItem 
                    icon={Globe} 
                    label="Web Search" 
                    active={isWebSearch}
                    onPin={() => togglePin('search')}
                    onClick={() => { setIsWebSearch(!isWebSearch); setIsOpen(false); }} 
                  />
                )}

                {!pinnedActions.includes('genui') && (
                  <MenuItem 
                    icon={Layout} 
                    label="Generative UI" 
                    active={generativeUI}
                    onPin={() => togglePin('genui')}
                    onClick={() => { setGenerativeUI(!generativeUI); setIsOpen(false); }} 
                  />
                )}
                
                <MenuItem 
                  icon={Layout} 
                  label="Manage Skills" 
                  onClick={() => { onOpenSkills?.(); setIsOpen(false); }} 
                />

                <div className="h-px bg-muted dark:bg-muted my-1 mx-2" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
