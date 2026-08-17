import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppDialog } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { skillsApi, type SkillMetadata } from "@/api/skillsApi";
import { useSkillsRegistryStore } from "@/lib/stores/skillsRegistryStore";
import { cn } from "@/lib/utils";
import { SkillEditorForm } from "./SkillEditorForm";

interface SkillsRegistryDialogProps {
  /** The chat's captured workspace root — skills resolve against it. */
  workspaceRoot?: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  repo: "Workspace",
  user: "User",
  system: "System",
};

const SCOPE_ORDER: Record<string, number> = { repo: 0, user: 1, system: 2 };

/**
 * Skills registry: the `/skills` surface. Lists every discovered SKILL.md
 * (workspace `.agents/skills/` and user `~/.zen/skills/`), shows its
 * description + invocation syntax, and hosts the runtime enable toggle
 * (persisted as `skill:<name>:enabled`; disabled skills leave the catalog
 * and the slash autocomplete).
 */
export function SkillsRegistryDialog({ workspaceRoot }: SkillsRegistryDialogProps) {
  const isOpen = useSkillsRegistryStore((s) => s.isOpen);
  const close = useSkillsRegistryStore((s) => s.close);
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = list view; {skill} = edit; {skill:null} = create. */
  const [editor, setEditor] = useState<{ skill: SkillMetadata | null } | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    skillsApi
      .list(workspaceRoot ?? null)
      .then((items) => setSkills(items))
      .catch((e) => setError(e?.toString() ?? "Failed to load skills"))
      .finally(() => setIsLoading(false));
  }, [workspaceRoot]);

  useEffect(() => {
    if (isOpen) load();
    else setEditor(null);
  }, [isOpen, load]);

  const grouped = useMemo(() => {
    const sorted = [...skills].sort(
      (a, b) =>
        (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
        a.name.localeCompare(b.name),
    );
    const groups: { scope: string; items: SkillMetadata[] }[] = [];
    for (const skill of sorted) {
      const last = groups.at(-1);
      if (last && last.scope === skill.scope) last.items.push(skill);
      else groups.push({ scope: skill.scope, items: [skill] });
    }
    return groups;
  }, [skills]);

  const toggle = useCallback((name: string, next: boolean) => {
    setSkills((prev) =>
      prev.map((s) => (s.name === name ? { ...s, enabled: next } : s)),
    );
    skillsApi.setEnabled(name, next).catch(() => {
      // Revert the optimistic switch on failure and tell the user, so the row
      // never silently disagrees with the persisted state.
      setSkills((prev) =>
        prev.map((s) => (s.name === name ? { ...s, enabled: !next } : s)),
      );
      toast.error(`Could not ${next ? "enable" : "disable"} "${name}"`);
    });
  }, []);

  return (
    <AppDialog
      open={isOpen}
      onOpenChange={(next) => (next ? load() : close())}
      title={editor ? (editor.skill ? "Edit skill" : "New skill") : "Skills"}
      description={
        editor
          ? "Author a SKILL.md: name, description, invocation params, and body."
          : "SKILL.md folders discovered in the workspace and user directories. The agent sees the catalog each turn; a skill's full body loads only when invoked."
      }
      footer={
        editor ? null : (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              Add skills as <span className="font-mono">.agents/skills/&lt;name&gt;/SKILL.md</span> (workspace) or{" "}
              <span className="font-mono">~/.zen/skills/&lt;name&gt;/SKILL.md</span> (user).
            </p>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={load}>
              Refresh
            </Button>
            <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => setEditor({ skill: null })}>
              <Plus size={13} />
              New skill
            </Button>
          </div>
        )
      }
    >
      {editor ? (
        <SkillEditorForm
          editing={editor.skill}
          workspaceRoot={workspaceRoot}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      ) : (
        <>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {isLoading && skills.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Loading skills…</p>
          )}
          {!isLoading && !error && skills.length === 0 && (
            <div className="space-y-2 px-1 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No skills detected</p>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                Create a folder with a SKILL.md (YAML frontmatter with{" "}
                <span className="font-mono">name</span> and{" "}
                <span className="font-mono">description</span>) and it will appear
                here, in slash autocomplete, and in the agent's skill catalog.
              </p>
            </div>
          )}
          <div className="max-h-[50vh] space-y-4 overflow-y-auto">
            {grouped.map((group) => (
              <section key={group.scope} className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {SCOPE_LABEL[group.scope] ?? group.scope}
                </h4>
                <ul className="space-y-2">
                  {group.items.map((skill) => (
                    <li
                      key={skill.name}
                      className={cn(
                        "rounded-lg border border-border bg-card px-3 py-2.5",
                        !skill.enabled && "opacity-60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {skill.name}
                            </span>
                            {!skill.allow_implicit_invocation && (
                              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                manual only
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {skill.description}
                          </p>
                          <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                            {skill.invocation_syntax}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {skill.scope !== "system" && (
                            <button
                              type="button"
                              onClick={() => setEditor({ skill })}
                              aria-label={`Edit skill ${skill.name}`}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={(next) => toggle(skill.name, next)}
                            aria-label={`Toggle skill ${skill.name}`}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </AppDialog>
  );
}
