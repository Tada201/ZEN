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
        active ? "bg-muted dark:bg-muted" : "hover:bg-muted dark:hover:bg-muted",
        disabled && "cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("w-4 h-4", active ? "text-foreground dark:text-foreground" : "text-muted-foreground group-hover/item:text-foreground/80 dark:group-hover/item:text-foreground")} />
        <span className={cn(
          active ? "text-foreground dark:text-foreground font-medium" : "text-muted-foreground/70 dark:text-muted-foreground",
          disabled && "text-muted-foreground dark:text-muted-foreground/70"
        )}>{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {onPin && (
          <div 
            onClick={(e) => { e.stopPropagation(); onPin?.(e); }}
            role="button"
            className={cn(
              "p-1 rounded-md opacity-0 group-hover/item:opacity-100 transition-all hover:bg-muted dark:hover:bg-muted cursor-pointer",
              isPinned ? "text-primary opacity-100" : "text-muted-foreground"
            )}
          >
            {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </div>
        )}
        {hasSubmenu && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground dark:text-muted-foreground" />}
      </div>
    </button>
  </div>
);
