import React from 'react';
import { 
  X,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Tab Bar */}
      <div className="flex items-center bg-[#252526] border-b border-white/5 overflow-x-auto no-scrollbar group">
        <div className="flex h-10">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;
            
            return (
              <div
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-white/5 min-w-[120px] max-w-[200px] transition-all group/tab",
                  isActive 
                    ? "bg-[#1e1e1e] text-white" 
                    : "text-white/40 hover:bg-white/5 hover:text-white/60"
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
                      "p-0.5 rounded-md hover:bg-white/10 transition-all opacity-0 group-hover/tab:opacity-100 ml-auto",
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
            className="p-2 text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
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
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="h-full w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
