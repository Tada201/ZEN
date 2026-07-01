import { memo } from 'react';
import { motion } from 'framer-motion';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchSwitch } from '@/components/settings/ui/WorkbenchSwitch';
import { cn } from '@/lib/utils';

interface SkillCardProps {
  skill: {
    id: string;
    name: string;
    description: string;
    invocation_syntax: string;
    enabled: boolean;
    capabilities: string[];
  };
  onToggle: (id: string) => void;
}

export const SkillCard = memo(({ skill, onToggle }: SkillCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={cn(
        "rounded-xl border-2 transition-all duration-300",
        skill.enabled
          ? "bg-muted/60 border-brand-purple/20"
          : "bg-muted/40 border-border opacity-60"
      )}
    >
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-[14px] font-bold text-foreground">{skill.name}</h3>
            <span className="text-[11px] font-mono text-brand-purple">{skill.invocation_syntax}</span>
          </div>
          <WorkbenchSwitch
            checked={skill.enabled}
            onCheckedChange={() => onToggle(skill.id)}
          />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">{skill.description}</p>

        {skill.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-2 py-3 border-t border-border/50">
            {skill.capabilities.map(cap => (
              <div
                key={cap}
                className="px-2 py-0.5 rounded bg-card border border-border"
              >
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                  {cap}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border/80">
          <WorkbenchButton variant="secondary" className="flex-1 h-8 gap-2">
            <WorkbenchIcon name="codicon:play" size={10} className="text-emerald-500" />
            <span className="text-[11px] font-black uppercase">Execute</span>
          </WorkbenchButton>
          <WorkbenchButton variant="outline" className="h-8 w-10 border-border hover:border-border">
            <WorkbenchIcon name="codicon:edit" size={12} className="text-muted-foreground" />
          </WorkbenchButton>
          <WorkbenchButton
            variant="outline"
            className="h-8 w-10 border-border hover:border-destructive/30 group/trash"
          >
            <WorkbenchIcon
              name="codicon:trash"
              size={12}
              className="text-muted-foreground group-hover:text-destructive transition-colors"
            />
          </WorkbenchButton>
        </div>
      </div>
    </motion.div>
  );
});