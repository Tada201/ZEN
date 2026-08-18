import React from 'react';
import { ChevronRight, Pin, PinOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  hasSubmenu?: boolean;
  onClick?: () => void;
  onPin?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  isPinned?: boolean;
  disabled?: boolean;
}

export const MenuItem = ({
  icon: Icon,
  label,
  hasSubmenu,
  onClick,
  onPin,
  active,
  isPinned,
  disabled,
}: MenuItemProps) => (
  <div className={cn("group/item relative flex items-center", disabled && "opacity-50")}>
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-composer-action="true"
      className={cn(
        "composer-menu-item text-[13px]",
        active ? "composer-menu-item--active" : "",
        disabled && "cursor-not-allowed",
        onPin && "pr-1",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "truncate",
            active ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </span>
      {hasSubmenu && (
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
    {onPin && (
      <button
        type="button"
        aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
        title={isPinned ? `Unpin ${label}` : `Pin ${label}`}
        disabled={disabled}
        onClick={onPin}
        className={cn(
          "composer-control composer-control--icon absolute right-1 rounded p-0.5",
          "opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100",
          isPinned ? "text-primary opacity-100" : "text-muted-foreground",
        )}
      >
        {isPinned ? (
          <PinOff aria-hidden="true" className="h-3 w-3" />
        ) : (
          <Pin aria-hidden="true" className="h-3 w-3" />
        )}
      </button>
    )}
  </div>
);
