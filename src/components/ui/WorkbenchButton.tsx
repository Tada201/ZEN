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
            secondary: 'bg-white/[0.03] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white',
            outline: 'bg-transparent text-zinc-400 border border-white/[0.1] hover:bg-white/[0.03] hover:text-zinc-200',
            ghost: 'bg-transparent text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300 border-transparent',
            danger: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20',
            blue: 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20',
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
