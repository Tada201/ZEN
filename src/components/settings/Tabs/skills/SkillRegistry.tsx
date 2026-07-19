import { memo, useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SkillCard } from "./SkillCard";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { skillsApi, SkillMetadata } from "@/api/skillsApi";

interface SkillRegistryProps {
  // Kept for compat with parent — actual data comes from skillsApi.
  skills?: SkillMetadata[];
  loading?: boolean;
  onToggle?: (id: string) => void;
}

export const SkillRegistry = memo(({ skills: propSkills, onToggle: propOnToggle }: SkillRegistryProps) => {
  const [skills, setSkills] = useState<SkillMetadata[]>(propSkills ?? []);
  const [loading, setLoading] = useState(propSkills === undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (propSkills !== undefined) return;
    let cancelled = false;
    setLoading(true);
    void skillsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        setSkills(res);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [propSkills]);

  const handleToggle = useCallback(
    async (id: string) => {
      // Find the skill BEFORE mutating so we know the current `enabled`
      // (NOT `allow_implicit_invocation` — that field is a separate
      // frontmatter-derived capability and must not be conflated with the
      // runtime toggle). Fail closed if the entry is somehow gone.
      const target = skills.find((s) => s.name === id);
      if (!target) return;
      const nextEnabled = !target.enabled;
      try {
        await skillsApi.setEnabled(id, nextEnabled);
        // Patch the local list immediately so the switch reflects the
        // saved value before the next IPC refresh. `allow_implicit_invocation`
        // stays unchanged because it is a SKILL.md frontmatter declaration.
        setSkills((prev) =>
          prev.map((s) => (s.name === id ? { ...s, enabled: nextEnabled } : s))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      propOnToggle?.(id);
    },
    [skills, propOnToggle],
  );

  if (loading) {
    return (
      <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4">
        <WorkbenchIcon name="codicon:loading" size={32} className="animate-spin text-brand-purple" />
        <p className="text-[11px] text-muted-foreground italic">Synchronizing skill registry...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="col-span-full py-12 flex flex-col items-center justify-center gap-2 text-center">
        <p className="text-[11px] text-destructive">Failed to load skills: {error}</p>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 p-12 rounded-2xl border border-dashed border-border bg-card/20">
        <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center shadow-lg">
          <WorkbenchIcon name="codicon:book" size={28} className="text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-[14px] font-bold text-foreground uppercase tracking-tight">No Skills Detected</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md">
            Add <code className="text-brand-purple font-mono bg-brand-purple/5 px-1 rounded">SKILL.md</code> files to{" "}
            <code className="text-brand-purple font-mono bg-brand-purple/5 px-1 rounded">.agents/skills/</code> in your workspace
            or <code className="text-brand-purple font-mono bg-brand-purple/5 px-1 rounded">~/.zen/skills/</code> for user-wide skills.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <AnimatePresence mode="popLayout">
        {skills.map((skill) => (
          <SkillCard
            key={skill.name}
            skill={skill}
            onToggle={handleToggle}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
