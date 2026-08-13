import { memo } from 'react';

interface WorkbenchSettingRowProps {
    label: string;
    description?: string;
    control?: React.ReactNode;
    children?: React.ReactNode;
}

export const WorkbenchSettingRow = memo(({ label, description, control, children }: WorkbenchSettingRowProps) => {
    return (
        <div className="group flex min-h-12 flex-col gap-2.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-medium text-foreground">{label}</span>
                {description && <span className="max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</span>}
            </div>
            {control && <div className="w-full shrink-0 sm:w-auto">{control}</div>}
            {children}
        </div>
    );
});
