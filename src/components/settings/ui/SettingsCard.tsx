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
        <section className={cn("rounded-2xl border border-white/5 bg-slate-950/40 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]", className)}>
            <div className="flex items-start gap-3 mb-5">
                {icon && (
                    <div className="h-9 w-9 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
                        <WorkbenchIcon name={icon} size={16} className="text-brand-purple" />
                    </div>
                )}
                <div className="flex flex-col gap-1 min-w-0">
                    {subtitle && <span className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-purple/80">{subtitle}</span>}
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-tight">{title}</h3>
                    {description && <p className="text-[11px] text-slate-500 leading-relaxed max-w-3xl">{description}</p>}
                </div>
            </div>
            {children}
        </section>
    );
});
