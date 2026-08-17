# Skills System

Zen implements the agentskills.io `SKILL.md` standard: a folder-per-skill
convention with YAML frontmatter and three-stage progressive disclosure. The
agent sees a budget-capped *catalog* every turn; a skill's full body is loaded
only when it is invoked.

## Discovery

`SkillsManager` (`src-tauri/src/agent/skills/manager.rs`) scans two root kinds:

- **User** — `~/.zen/skills/<name>/SKILL.md` (`SkillScope::User`, lowest precedence)
- **Repo** — `.agents/skills/<name>/SKILL.md` walked from the workspace root down
  to cwd (`SkillScope::Repo`, wins over User on a name/path collision)

A skill directory is valid when the dir name is kebab-case and equals the
frontmatter `name`, and the frontmatter has a non-empty `description` (Codex
invariant). BFS scan is bounded to depth 6 and 2000 dirs per root.

Discovery resolves against the **chat's captured `workspace_root`, not the
process cwd** — in a packaged Tauri build the process cwd is the install dir, so
using it would find no skills. The workspace root is threaded through:

- `EnrichmentContext.workspace_root` → `SkillsCatalogMiddleware`
- `runner/loop.rs` (mention/slash preload) via `get_chat(...).workspace_root`
- `skill` agent tool via `skills::cwd_for_chat(app, chat_id)`
- `list_skills`/`load_skill`/`suggest_slash`/`parse_slash` commands via a
  `workspace_root` param + `resolve_cwd`

Caches expire after `SKILLS_CACHE_TTL` (5s) so authored/edited `SKILL.md` files
surface without an app restart — no filesystem watcher.

## Enabled/disabled

The runtime toggle is persisted as the setting `skill:<name>:enabled` and
mirrored into `SkillsManager::disabled_names` (hydrated on startup in `lib.rs`).
`enabled_skills_for_cwd` filters disabled skills out of every agent-reachable
path — catalog, slash autocomplete/parse, mention/slash preload, and the `skill`
tool. `skills_for_cwd`/`list` stay **unfiltered** so the registry UI can render
disabled skills with their toggle.

## Invocation (three paths, one dispatch)

1. **`/skill-name args`** slash command — `runner/loop.rs` parses the leading
   line, reads the body, expands `$ARGUMENTS_SUFFIX`/`$ARGUMENTS`, and pushes a
   `SkillInstructionsFragment`. Takes priority over a same-name `$mention`.
2. **`$skill-name`** mention — unambiguous mentions (exactly one matching skill)
   preload the body the same way. Dedupe is owned by a `seen` set shared with
   the slash path.
3. **`skill` tool** — `list` / `load` / `execute` actions for the model to pull
   a skill mid-turn.

All bodies pass through `prompt_safety::wrap_skill_body`: `SKILL.md` content is
untrusted, so it lands inside a tagged `<skill>` envelope with a system reminder
(IPI defence), never as raw prompt text.

## Prompt fragments

- `SkillsCatalogFragment` (System role) — the `## Skills` catalog block, rendered
  by `render_available_skills` under a 2%-of-context-window budget (8000-char
  fallback). Overflow degrades gracefully: drop descriptions, then drop
  lowest-precedence lines.
- `SkillInstructionsFragment` (User role) — a single invoked body, wrapped.

## Frontend

- `skillsApi` (`src/api/skillsApi.ts`) — all calls take `workspaceRoot?`.
- `useSlashCommand` — debounced `/` autocomplete popover in the composer.
- `/skills` (typed in the composer) and the plus-menu **Skills** action open
  `SkillsRegistryDialog` via `useSkillsRegistryStore`; the dialog lists skills
  grouped by scope with per-skill enable switches. Intercepted client-side in
  `useSendHandler` — it never reaches the model.

## Authoring from the UI

`SkillsRegistryDialog` hosts a create/edit form (`SkillEditorForm`). "New skill"
(footer) opens a blank form; the per-row pencil edits an existing skill (locked
name — renaming = a new folder; `system`-scope skills are read-only). The form
collects name, description, location (Workspace `.agents/skills/` or User
`~/.zen/skills/`, defaulting to Workspace when one is open), an
`allow_implicit_invocation` toggle, a requires-tools multi-select fed by the
live tool registry (`toolsApi.listToolMetadata`), optional invocation-syntax, an
arguments-mode helper that inserts `$ARGUMENTS`/`$ARGUMENTS_SUFFIX` into the
body, and the full body.

Saving calls the `save_skill` command, which validates the name with
`is_valid_skill_name`, resolves the target under the chosen root (rejecting any
path that escapes it), composes deterministic YAML frontmatter + body, writes
`SKILL.md`, and clears the discovery cache so the skill appears immediately. An
existing file returns a `skill-exists:` error so the form can offer an overwrite
confirm.

## Verification

- `cargo check --all-targets` (unit tests live beside each module:
  `discovery`, `types`, `render`, `injection`, `fragment`, `manager`).
- `npx tsc --noEmit` for the frontend surface.
