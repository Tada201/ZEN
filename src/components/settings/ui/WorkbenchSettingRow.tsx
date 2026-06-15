import { memo } from 'react';

interface WorkbenchSettingRowProps {
    label: string;
    description?: string;
    control?: React.ReactNode;
    children?: React.ReactNode;
}

export const WorkbenchSettingRow = memo(({ label, description, control, children }: WorkbenchSettingRowProps) => {
    return (
        <div className="group flex flex-col gap-3 border-b border-border/50 px-1 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{label}</span>
                {description && <span className="max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</span>}
            </div>
            {control && <div className="w-full shrink-0 sm:w-auto">{control}</div>}
            {children}
        </div>
    );
});
