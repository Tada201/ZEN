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
        <section className={cn("space-y-2", className)}>
            <div className="mb-2 flex items-start gap-3">
                {icon && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <WorkbenchIcon name={icon} size={16} className="text-primary" />
                    </div>
                )}
                <div className="flex flex-col gap-1 min-w-0">
                    {subtitle && <span className="text-xs font-medium text-primary">{subtitle}</span>}
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    {description && <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p>}
                </div>
            </div>
            <div className="space-y-2">
                {children}
            </div>
        </section>
    );
});
