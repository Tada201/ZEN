import React from 'react';
import { 
  X,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { motionDurations, motionEasings, useReducedMotion } from '@/lib/motion';

export type TabType = 'editor' | 'preview' | 'explorer' | 'settings';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  icon: any;
  closable?: boolean;
}

interface TabSystemProps {
  tabs: Tab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onTabClose?: (id: string) => void;
  onTabAdd?: () => void;
  children: React.ReactNode;
}

export function TabSystem({ 
  tabs, 
  activeTabId, 
  onTabChange, 
  onTabClose,
  onTabAdd,
  children 
}: TabSystemProps) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="h-full flex flex-col bg-editor-surface">
      {/* Tab Bar */}
      <div className="flex items-center bg-editor-elevated border-b border-border/5 overflow-x-auto no-scrollbar group">
        <div className="flex h-10">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;
            
            return (
              <div
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-border/5 min-w-[120px] max-w-[200px] transition-all group/tab",
                  isActive 
                    ? "bg-editor-surface text-primary-foreground" 
                    : "text-primary-foreground/40 hover:bg-card/5 hover:text-primary-foreground/60"
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
                )}
                
                <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "opacity-50")} />
                <span className="text-[12px] font-medium truncate select-none">{tab.title}</span>
                
                {tab.closable !== false && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose?.(tab.id);
                    }}
                    className={cn(
                      "p-0.5 rounded-md hover:bg-card/10 transition-all opacity-0 group-hover/tab:opacity-100 ml-auto",
                      isActive && "opacity-100"
                    )}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        
        {onTabAdd && (
          <button 
            onClick={onTabAdd}
            className="p-2 text-primary-foreground/20 hover:text-primary-foreground/60 hover:bg-card/5 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTabId}
            initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -5 }}
            transition={reducedMotion ? { duration: 0 } : {
              duration: motionDurations.fast,
              ease: motionEasings.standard,
            }}
            className="h-full w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
