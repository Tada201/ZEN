import { memo } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
    title: string;
    subtitle?: string;
    description?: string;
    icon?: string;
    children: React.ReactNode;
    className?: string;
}

export const SettingsCard = memo(({ title, subtitle, description, icon, children, className }: SettingsCardProps) => {
    return (
        <section className={cn("min-w-0", className)}>
            <div className="flex items-start gap-2.5 border-b border-border/70 pb-2.5">
                {icon && (
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                        <WorkbenchIcon name={icon} size={16} className="text-primary" />
                    </div>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                    {subtitle && <span className="text-xs font-medium text-primary">{subtitle}</span>}
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    {description && <p className="max-w-3xl text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
                </div>
            </div>
            <div className="divide-y divide-border/70">
                {children}
            </div>
        </section>
    );
});
