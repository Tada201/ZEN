import React from 'react';
import { cn } from "@/lib/utils/style";

export interface WorkbenchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'blue';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
    loading?: boolean;
}

/**
 * WorkbenchButton - High-Density Workstation Button
 * Provides consistent styling across the Zen interface.
 */
export const WorkbenchButton = React.forwardRef<HTMLButtonElement, WorkbenchButtonProps>(
    ({ className, variant = 'secondary', size = 'md', loading, children, ...props }, ref) => {
        const variants = {
            primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
            secondary: 'bg-muted/50 text-foreground border border-border hover:bg-muted hover:text-foreground',
            outline: 'bg-transparent text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground',
            ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground border-transparent',
            danger: 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20',
            blue: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
        };

        const sizes = {
            xs: 'h-7 px-2 text-[10px] rounded-md gap-1.5',
            sm: 'h-8 px-3 text-[11px] rounded-md gap-2',
            md: 'h-9 px-4 text-xs rounded-lg gap-2',
            lg: 'h-10 px-6 text-sm rounded-xl gap-2.5',
            icon: 'h-8 w-8 p-0 flex items-center justify-center rounded-md',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shrink-0 cursor-pointer',
                    variants[variant],
                    sizes[size],
                    className
                )}
                disabled={loading}
                {...props}
            >
                {loading ? (
                    <div className="h-3 w-3 border-2 border-current border-t-transparent animate-spin rounded-full shrink-0" />
                ) : null}
                {children}
            </button>
        );
    }
);

WorkbenchButton.displayName = 'WorkbenchButton';
