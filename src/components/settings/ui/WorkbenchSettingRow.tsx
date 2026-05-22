import { memo } from 'react';

interface WorkbenchSettingRowProps {
    label: string;
    description?: string;
    control?: React.ReactNode;
    children?: React.ReactNode;
}

export const WorkbenchSettingRow = memo(({ label, description, control, children }: WorkbenchSettingRowProps) => {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-bold text-white">{label}</span>
                {description && <span className="text-[11px] text-zinc-500 leading-relaxed">{description}</span>}
            </div>
            {control && <div className="shrink-0">{control}</div>}
            {children}
        </div>
    );
});
