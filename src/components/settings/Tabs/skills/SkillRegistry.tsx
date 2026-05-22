import { memo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SkillCard } from './SkillCard';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { UnderConstructionBanner } from '@/components/settings/ui/UnderConstructionBanner';

interface Skill {
    id: string;
    name: string;
    description: string;
    invocation_syntax: string;
    enabled: boolean;
    capabilities: string[];
}

interface SkillRegistryProps {
    skills: Skill[];
    loading: boolean;
    onToggle: (id: string) => void;
}

export const SkillRegistry = memo(({ skills, loading, onToggle }: SkillRegistryProps) => {
    if (loading) {
        return (
            <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4">
                <WorkbenchIcon name="codicon:loading" size={32} className="animate-spin text-brand-purple" />
                <p className="text-[11px] text-zinc-400 italic">Synchronizing skill registry...</p>
            </div>
        );
    }

    if (skills.length === 0) {
        return (
            <div className="space-y-6 col-span-full">
                <UnderConstructionBanner
                    featureName="Skills Registry"
                    description="The Skills Registry automatically indexes tactical skills defined inside .agents/skills/ in your workspace. You will be able to toggle them, inspect capability manifests, and load customized logic structures."
                />
                <div className="flex flex-col items-center gap-6 p-12 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                        <WorkbenchIcon name="codicon:book" size={28} className="text-zinc-400" />
                    </div>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h3 className="text-[14px] font-bold text-zinc-200 uppercase tracking-tight">No Tactical Modules Detected</h3>
                        <p className="text-[11px] text-zinc-400 leading-relaxed max-w-md">
                            Tactical modules extend agent capabilities with specialized logic. Ensure <code className="text-brand-purple font-mono bg-brand-purple/5 px-1 rounded">SKILL.md</code> definitions exist in active workspace volumes.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
                {skills.map((skill) => (
                    <SkillCard
                        key={skill.id}
                        skill={skill}
                        onToggle={onToggle}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
});