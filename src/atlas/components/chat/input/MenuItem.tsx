import React from 'react';
import { ChevronRight, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItemProps {
  icon: any;
  label: string;
  hasSubmenu?: boolean;
  onClick?: () => void;
  onPin?: (e: React.MouseEvent) => void;
  active?: boolean;
  isPinned?: boolean;
  disabled?: boolean;
}

export const MenuItem = ({ icon: Icon, label, hasSubmenu, onClick, onPin, active, isPinned, disabled }: MenuItemProps) => (
  <div className={cn("relative group/item", disabled && "opacity-50 pointer-events-none")}>
    <button 
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm",
        active ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        disabled && "cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("w-4 h-4", active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 group-hover/item:text-zinc-700 dark:group-hover/item:text-zinc-300")} />
        <span className={cn(
          active ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-600 dark:text-zinc-400",
          disabled && "text-zinc-400 dark:text-zinc-600"
        )}>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {onPin && (
          <div 
            onClick={(e) => { e.stopPropagation(); onPin?.(e); }}
            role="button"
            className={cn(
              "p-1 rounded-md opacity-0 group-hover/item:opacity-100 transition-all hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer",
              isPinned ? "text-primary opacity-100" : "text-zinc-400"
            )}
          >
            {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </div>
        )}
        {hasSubmenu && <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />}
      </div>
    </button>
  </div>
);
