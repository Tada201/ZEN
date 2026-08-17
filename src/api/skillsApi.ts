import { callCommand } from "./tauriClient";

export type SkillScope = "user" | "repo" | "system";

export interface SkillMetadata {
  name: string;
  description: string;
  short_description?: string | null;
  scope: SkillScope;
  /**
   * Frontmatter-driven capability declared by the SKILL.md: whether the
   * skill may be invoked without the user typing `/<name>`. The runtime
   * switch in the UI binds to `enabled`, NOT to this field.
   */
  allow_implicit_invocation: boolean;
  invocation_syntax: string;
  tools_required: string[];
  /**
   * Runtime toggle. The backend derives this from the persisted
   * `skill:<name>:enabled` setting (falling back to the SkillsManager's
   * default-enabled state). The UI mutates it locally after `setEnabled`
   * so the switch reflects the saved value immediately.
   */
  enabled: boolean;
}

export interface SkillLoadResult {
  name: string;
  description: string;
  scope: SkillScope;
  path: string;
  content: string;
}

export type SlashSuggestionDto =
  | { kind: "skill"; name: string; description: string; invocation_syntax: string }
  | { kind: "builtin"; name: string; description: string; invocation_syntax: string };

export type SlashParseResult =
  | { kind: "not_command" }
  | { kind: "skill"; name: string; args: string }
  | { kind: "builtin"; name: string }
  | { kind: "unknown"; name: string };

export interface SkillSaveInput {
  name: string;
  description: string;
  body: string;
  scope: "repo" | "user";
  allowImplicitInvocation: boolean;
  requiresTools: string[];
  invocationSyntax?: string | null;
  workspaceRoot?: string | null;
  overwrite?: boolean;
}

/** Backend prefix on the "file exists" error so the UI can offer overwrite. */
export const SKILL_EXISTS_PREFIX = "skill-exists:";

export const skillsApi = {
  list: (workspaceRoot?: string | null) =>
    callCommand<SkillMetadata[]>("list_skills", { workspaceRoot: workspaceRoot ?? null }),
  load: (name: string, workspaceRoot?: string | null) =>
    callCommand<SkillLoadResult>("load_skill", {
      name,
      workspaceRoot: workspaceRoot ?? null,
    }),
  setEnabled: (name: string, enabled: boolean) =>
    callCommand<void>("set_skill_enabled", { name, enabled }),
  save: (input: SkillSaveInput) =>
    callCommand<string>("save_skill", {
      name: input.name,
      description: input.description,
      body: input.body,
      scope: input.scope,
      allowImplicitInvocation: input.allowImplicitInvocation,
      requiresTools: input.requiresTools,
      invocationSyntax: input.invocationSyntax ?? null,
      workspaceRoot: input.workspaceRoot ?? null,
      overwrite: input.overwrite ?? false,
    }),
  suggestSlash: (query: string, workspaceRoot?: string | null) =>
    callCommand<SlashSuggestionDto[]>("suggest_slash", {
      query,
      workspaceRoot: workspaceRoot ?? null,
    }),
  parseSlash: (input: string, workspaceRoot?: string | null) =>
    callCommand<SlashParseResult>("parse_slash", {
      input,
      workspaceRoot: workspaceRoot ?? null,
    }),
};
