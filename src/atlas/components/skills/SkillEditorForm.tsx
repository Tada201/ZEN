import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  skillsApi,
  SKILL_EXISTS_PREFIX,
  type SkillMetadata,
  type SkillSaveInput,
} from "@/api/skillsApi";
import { toolsApi, type BackendToolMeta } from "@/api/toolsApi";
import { cn } from "@/lib/utils";

/** Mirrors backend `is_valid_skill_name`: kebab-case, 1-64 chars. */
function isValidSkillName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 64 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
  );
}

type ArgMode = "none" | "arguments" | "arguments_suffix";
const ARG_TOKEN: Record<Exclude<ArgMode, "none">, string> = {
  arguments: "$ARGUMENTS",
  arguments_suffix: "$ARGUMENTS_SUFFIX",
};

interface SkillEditorFormProps {
  /** When set, the form edits this skill (name locked). */
  editing?: SkillMetadata | null;
  workspaceRoot?: string | null;
  onCancel: () => void;
  onSaved: () => void;
}

const STARTER_BODY =
  "## Instructions\n\nDescribe what the agent should do when this skill runs.\n";

export function SkillEditorForm({
  editing,
  workspaceRoot,
  onCancel,
  onSaved,
}: SkillEditorFormProps) {
  const isEdit = !!editing;
  const hasWorkspace = !!workspaceRoot;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [body, setBody] = useState(STARTER_BODY);
  const [scope, setScope] = useState<"repo" | "user">(
    editing ? (editing.scope === "user" ? "user" : "repo") : hasWorkspace ? "repo" : "user",
  );
  const [allowImplicit, setAllowImplicit] = useState(
    editing?.allow_implicit_invocation ?? true,
  );
  const [requiresTools, setRequiresTools] = useState<string[]>(
    editing?.tools_required ?? [],
  );
  // The backend always fills invocation_syntax (defaults to `/name`); only
  // prefill the field when it's a real custom value so editing doesn't wipe it
  // and a default doesn't get frozen into explicit frontmatter.
  const [invocationSyntax, setInvocationSyntax] = useState(
    editing && editing.invocation_syntax !== `/${editing.name}`
      ? editing.invocation_syntax
      : "",
  );
  const [argMode, setArgMode] = useState<ArgMode>("none");
  const [tools, setTools] = useState<BackendToolMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Load the live tool registry for the requires-tools multi-select.
  useEffect(() => {
    toolsApi.listToolMetadata().then(setTools).catch(() => setTools([]));
  }, []);

  // On edit, hydrate the body from the saved SKILL.md (list metadata lacks it).
  useEffect(() => {
    if (!editing) return;
    skillsApi
      .load(editing.name, workspaceRoot ?? null)
      .then((r) => setBody(stripFrontmatter(r.content)))
      .catch(() => {});
  }, [editing, workspaceRoot]);

  // A pending overwrite is bound to a specific name+scope target; if either
  // changes, drop it so the user can't confirm-overwrite the wrong file.
  useEffect(() => {
    setPendingOverwrite(false);
    setError(null);
  }, [name, scope]);

  const nameError = useMemo(() => {
    if (!name) return null;
    return isValidSkillName(name)
      ? null
      : "kebab-case only: lowercase letters, digits, single dashes";
  }, [name]);

  const canSave =
    isValidSkillName(name) && description.trim().length > 0 && !saving;

  const insertToken = () => {
    if (argMode === "none") return;
    const token = ARG_TOKEN[argMode];
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}\n${token}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setBody((b) => b.slice(0, start) + token + b.slice(end));
  };

  const doSave = (overwrite: boolean) => {
    setSaving(true);
    setError(null);
    const input: SkillSaveInput = {
      name,
      description: description.trim(),
      body,
      scope,
      allowImplicitInvocation: allowImplicit,
      requiresTools,
      invocationSyntax: invocationSyntax.trim() || null,
      workspaceRoot: workspaceRoot ?? null,
      overwrite,
    };
    skillsApi
      .save(input)
      .then(() => onSaved())
      .catch((e) => {
        const msg = e?.toString() ?? "Failed to save skill";
        if (msg.includes(SKILL_EXISTS_PREFIX)) {
          setPendingOverwrite(true);
          setError("A skill with this name already exists here.");
        } else {
          setError(msg);
        }
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4">
      <Field label="Name" hint={isEdit ? "Locked — renaming makes a new skill." : "Folder + frontmatter identity."}>
        <Input
          value={name}
          disabled={isEdit}
          placeholder="my-skill"
          onChange={(e) => setName(e.target.value.trim())}
          aria-invalid={!!nameError}
        />
        {nameError && <p className="mt-1 text-[11px] text-destructive">{nameError}</p>}
      </Field>

      <Field label="Description" hint="Shown in the catalog and slash autocomplete.">
        <Textarea
          value={description}
          rows={2}
          placeholder="What this skill does and when to use it."
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Location">
        <div className="flex gap-2">
          <ScopePill
            active={scope === "repo"}
            disabled={!hasWorkspace || isEdit}
            label="Workspace"
            onClick={() => setScope("repo")}
          />
          <ScopePill
            active={scope === "user"}
            disabled={isEdit}
            label="User"
            onClick={() => setScope("user")}
          />
        </div>
        {!hasWorkspace && !isEdit && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Open a workspace to save a project skill.
          </p>
        )}
      </Field>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">Allow implicit invocation</span>
          <span className="block text-[11px] text-muted-foreground">Agent may auto-run this without the user typing /{name || "name"}.</span>
        </span>
        <Switch checked={allowImplicit} onCheckedChange={setAllowImplicit} className="shrink-0" />
      </label>

      <Field label="Requires tools" hint="Declared dependencies from the live tool registry.">
        <div className="grid max-h-32 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2">
          {tools.length === 0 && <p className="col-span-2 text-[11px] text-muted-foreground">No tools available.</p>}
          {tools.map((t) => {
            const checked = requiresTools.includes(t.id);
            return (
              <label key={t.id} className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    setRequiresTools((prev) =>
                      next ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                    )
                  }
                />
                <span className="truncate">{t.name}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field label="Invocation syntax" hint="Optional. Defaults to /name.">
        <Input
          value={invocationSyntax}
          placeholder={`/${name || "name"} <args>`}
          onChange={(e) => setInvocationSyntax(e.target.value)}
        />
      </Field>

      <Field label="Body" hint="Full SKILL.md content below the frontmatter.">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Arguments:</span>
          {(["none", "arguments", "arguments_suffix"] as ArgMode[]).map((m) => (
            <ScopePill
              key={m}
              active={argMode === m}
              label={m === "none" ? "None" : ARG_TOKEN[m]}
              onClick={() => setArgMode(m)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={argMode === "none"}
            onClick={insertToken}
          >
            Insert token
          </Button>
        </div>
        <Textarea
          ref={bodyRef}
          value={body}
          rows={8}
          className="font-mono text-xs"
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        {pendingOverwrite ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={saving}
            onClick={() => doSave(true)}
          >
            Overwrite existing
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!canSave}
            onClick={() => doSave(false)}
          >
            {isEdit ? "Save changes" : "Create skill"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ScopePill({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {label}
    </button>
  );
}

/** Drop a leading YAML frontmatter block so the editor shows only the body. */
function stripFrontmatter(content: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? content.slice(m[0].length).replace(/^\r?\n/, "") : content;
}
