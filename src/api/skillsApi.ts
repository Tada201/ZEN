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

export const skillsApi = {
  list: () => callCommand<SkillMetadata[]>("list_skills"),
  load: (name: string) => callCommand<SkillLoadResult>("load_skill", { name }),
  setEnabled: (name: string, enabled: boolean) =>
    callCommand<void>("set_skill_enabled", { name, enabled }),
  suggestSlash: (query: string) =>
    callCommand<SlashSuggestionDto[]>("suggest_slash", { query }),
  parseSlash: (input: string) =>
    callCommand<SlashParseResult>("parse_slash", { input }),
};
