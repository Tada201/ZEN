import { memo } from 'react';

interface WorkbenchSettingRowProps {
    label: string;
    description?: string;
    control?: React.ReactNode;
    children?: React.ReactNode;
}

export const WorkbenchSettingRow = memo(({ label, description, control, children }: WorkbenchSettingRowProps) => {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3 hover:bg-white/[0.04] transition-colors group">
            <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-bold text-white group-hover:text-zinc-100 transition-colors">{label}</span>
                {description && <span className="text-[10px] text-zinc-500 leading-relaxed">{description}</span>}
            </div>
            {control && <div className="shrink-0">{control}</div>}
            {children}
        </div>
    );
});
