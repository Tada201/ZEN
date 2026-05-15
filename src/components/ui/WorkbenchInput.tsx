import React, { memo } from 'react';
import { cn } from "@/lib/utils/style";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

/**
 * WorkbenchInput - High-Density Workstation Input
 */
export type WorkbenchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChangeText?: (text: string) => void;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    icon?: string | React.ComponentType<any>;
    rightElement?: React.ReactNode;
};

export const WorkbenchInput = memo(React.forwardRef<HTMLInputElement, WorkbenchInputProps>(
    ({ className, onChangeText, onChange, icon: IconProp, rightElement, ...props }, ref) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange?.(e);
            onChangeText?.(e.target.value);
        };

        return (
            <div className="relative w-full group">
                {IconProp && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground/60 group-focus-within:text-primary transition-colors">
                        {typeof IconProp === 'string' ? (
                            <WorkbenchIcon name={IconProp} size={14} />
                        ) : (
                            <IconProp size={14} />
                        )}
                    </div>
                )}
                <input
                    ref={ref}
                    onChange={handleChange}
                    className={cn(
                        'h-9 w-full rounded-md bg-slate-950 border border-border px-3 text-xs text-foreground transition-all duration-200 outline-none hover:border-border/80 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/40',
                        IconProp && 'pl-9',
                        className
                    )}
                    {...props}
                />
                {rightElement && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                        {rightElement}
                    </div>
                )}
            </div>
        );
    }
));

WorkbenchInput.displayName = 'WorkbenchInput';
