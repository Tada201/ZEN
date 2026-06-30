import React, { memo, useRef } from 'react';
import { Plus, Paperclip, Camera, ImageIcon, Lightbulb, Compass, Globe, Layout, Zap, ShieldOff } from 'lucide-react';
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
  isAuto: boolean;
  setIsAuto: (val: boolean) => void;
  isToolsDisabled: boolean;
  setIsToolsDisabled: (val: boolean) => void;
  onOpenSkills?: () => void;
  supportsImageGen?: boolean;
  isImageGenEnabled?: boolean;
  setIsImageGenEnabled?: (val: boolean) => void;
}

export const PlusActionMenu = memo(({
  isOpen, setIsOpen,
  onFileSelect,
  pinnedActions, togglePin,
  supportsReasoning, isThinking, setIsThinking,
  isDeepResearch, setIsDeepResearch,
  isWebSearch, setIsWebSearch,
  generativeUI, setGenerativeUI,
  isAuto, setIsAuto,
  isToolsDisabled, setIsToolsDisabled,
  onOpenSkills,
  isImageGenEnabled,
  setIsImageGenEnabled
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
          "mt-0.5 p-1.5 rounded-md transition-all border flex items-center justify-center",
          isOpen 
            ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700" 
            : "bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
        )}
      >
        <Plus className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-45")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-30 p-1.5 text-zinc-700 dark:text-zinc-300"
            >
              <div className="space-y-0.5">
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Add Content</div>
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

                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 mx-2" />
                
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Capabilities</div>
                
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

                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 mx-2" />
                
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Settings</div>
                <div className="px-3 py-2 flex items-center justify-between group hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer" onClick={() => setIsAuto(!isAuto)}>
                  <div className="flex items-center gap-3">
                    <Zap className={cn("w-4 h-4", isAuto ? "text-amber-500" : "text-zinc-500")} />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Auto Mode</span>
                  </div>
                  <div className={cn("w-7 h-4 rounded-full transition-all relative", isAuto ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-800")}>
                    <div className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform", isAuto ? "translate-x-3 bg-white dark:bg-zinc-900" : "translate-x-0 bg-zinc-400")} />
                  </div>
                </div>
                <div className="px-3 py-2 flex items-center justify-between group hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer" onClick={() => setIsToolsDisabled(!isToolsDisabled)}>
                  <div className="flex items-center gap-3">
                    <ShieldOff className={cn("w-4 h-4", isToolsDisabled ? "text-red-500" : "text-zinc-500")} />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Disable Tools</span>
                  </div>
                  <div className={cn("w-7 h-4 rounded-full transition-all relative", isToolsDisabled ? "bg-red-500" : "bg-zinc-200 dark:bg-zinc-800")}>
                    <div className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full transition-transform", isToolsDisabled ? "translate-x-3 bg-white" : "translate-x-0 bg-zinc-400")} />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
