## Planning Source-of-Truth

The `specs/` directory contains legacy planning artifacts from an earlier
architecture phase. Treat it as archival reference only: do not read it, use
it for current planning or architectural decisions, or update it unless the
user explicitly asks for a historical comparison. Use the current repository
code, `RULES.md`, the frontend/security contracts, and the active user request
as the source of truth.

<!-- SPECKIT START -->
The linked plan is retained for historical provenance only. Do not read it or
use it for current feature planning or architectural decisions; use the
repository source of truth described above instead.

## Codegraph Navigation
- Use the codegraph located in `graphify-out/` to explore code relationships, community hubs, and god nodes.
- Query and analyze the SQLite AST database located at `.codegraph/codegraph.db` (which tracks all code symbols, enums, structs, traits, calls, and imports) to perform high-precision code exploration and dependency resolution.
- When performing research or planning, utilize the codegraphs as primary resources to understand architectural connections and dependencies.
- You can query nodes, edges, and communities to identify core components and surprising connections before modifying or architecting new features.
<!-- SPECKIT END -->

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured through `.mcp.json`. CodeGraph is a tree-sitter parsed knowledge graph of symbols, edges, and files stored in `.codegraph/codegraph.db`.

### When To Prefer CodeGraph

Use CodeGraph for structural questions: what calls what, what would break, where a symbol is defined, signatures, ownership, architecture, and impact. Use native grep/read only for literal text searches or after CodeGraph has identified a specific file that must be inspected.

| Question | Tool |
|---|---|
| Where is X defined? | `codegraph_search` |
| What calls function Y? | `codegraph_callers` |
| What does Y call? | `codegraph_callees` |
| What would break if I changed Z? | `codegraph_impact` |
| Show Y's signature/source/docstring | `codegraph_node` |
| Give focused context for a task/area | `codegraph_context` |
| See several related symbols' source | `codegraph_explore` |
| What files exist under path/? | `codegraph_files` |
| Is the index healthy? | `codegraph_status` |

### Rules Of Thumb

- Answer directly; do not delegate exploration to a file-reading sub-agent. For "how does X work" or architecture questions, call `codegraph_context` first, then at most one focused `codegraph_explore` for the symbols it surfaces.
- Trust CodeGraph for structural results. Do not re-verify symbol relationships with grep unless the index reports staleness or the question is a literal text search.
- Do not grep first when looking up a symbol by name. Use `codegraph_search`.
- Do not chain repeated `codegraph_node` calls over many symbols. Use one `codegraph_explore` call with the relevant symbol/file names.
- Check `codegraph_status` when results look stale. If a response reports pending sync/staleness for specific files, read only those files directly.

### If `.codegraph/` Does Not Exist

Ask the user before initializing: "This project does not have CodeGraph initialized. Do you want me to run `codegraph init -i`?"

### MCP Initialization

This repo already has project-local MCP config in `.mcp.json`:

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

To initialize or repair CodeGraph MCP for an agent, prefer the official installer:

```bash
codegraph install --target=auto --location=global --yes
```

For Codex CLI specifically, CodeGraph prints this global config target:

```toml
[mcp_servers.codegraph]
command = "codegraph"
args = ["serve", "--mcp"]
```

Codex CLI uses the global `~/.codex/config.toml`; do not assume a project-local Codex config exists. Restart the agent session after changing MCP config.
<!-- CODEGRAPH_END -->

## Agent Rules
0. **Read RULES.md First**: Before planning or editing, read [RULES.md](RULES.md). It is the current architecture contract and phase rebuild guide for this codebase.
0.1. **Read Security.md for Risky Changes**: Before adding or upgrading a dependency, handling an antivirus detection, or introducing a network/media integration, read and follow [Security.md](Security.md). Dependency updates must prefer releases at least 30 days old; newer releases require a documented exception with provenance and rollback evidence.
0.2. **Backend Is A Cargo Workspace**: `src-tauri/` is a workspace — the `zen` app crate plus nine domain crates under `src-tauri/crates/`. Before any backend change, read the "Workspace Crate Map" section of [RULES.md](RULES.md) to find the owning crate. Two hard boundaries: no crate under `crates/` may depend on `tauri` or `keyring` (CI-enforced), and new backend behavior defaults to a crate rather than the app crate. The migration that produced this layout is recorded in [docs/architecture/history/BIG_MIGRATION.md](docs/architecture/history/BIG_MIGRATION.md) — historical reference only, not a planning document.
1. **Frontend Contract**: Before planning or editing frontend code under `src/`, read and follow [docs/architecture/frontend-rules.md](docs/architecture/frontend-rules.md). It defines product-surface, security, performance, UI-quality, and code-quality restrictions for the frontend.
2. **Design Grounding**: Before designing a new frontend surface or materially reshaping an existing one, read and apply [frontende-design.md](frontende-design.md). Use it to ground visual decisions in Zen's product context and existing system, prevent generic design drift, and keep each UI choice purposeful. For narrow maintenance changes, apply the existing local design patterns without inventing a new visual direction.
3. **Function over Form**: Prioritize utility and performance. Every unique animation or UI feature must serve a clear purpose and be useful. Avoid performance waste on purely decorative elements.
4. **Utilize .codegraph Rules**: Always consult `.agents/rules/codegraph.md` when querying the SQLite codegraph database to inspect schemas and find optimal SQL query templates.
5. **Concise Claude-style Responses**: Always consult and follow the guidelines in `.agents/rules/agents_response.md` to keep communication concise, direct, tool-first, and minimally verbose during task execution.

## Design Tokens (frontend consistency)

`src/styles/index.css` is the single source of truth for color, spacing, radius, and surface tokens. Prefer semantic tokens over raw values so themes, density, and radius presets keep working. `npm run lint:tokens` (also in `quality-check.ps1`) blocks new raw hex and off-scale spacing/radius; it is baselined, so only *new* drift fails.

- **Colors**: use `hsl(var(--token))` or the Tailwind semantic utilities (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`). Never hardcode hex in `.tsx` — it bypasses the theme and the eDEX/light presets.
- **Spacing**: stay on the 4px scale — legal steps (px): `0 2 4 6 8 10 12 16 20 24 28 32 36 40 48`. Use Tailwind steps (`p-2`, `gap-3`) or the semantic vars (`--space-inset-card`, `--space-stack`, `--zen-space-control`). No off-scale arbitrary values (`p-[7px]`, `gap-[13px]`); snap ties up.
- **Radius**: use `rounded-sm | rounded | rounded-lg | rounded-xl | rounded-full` — all derive from the runtime `--radius` preset. Avoid `rounded-md`/`rounded-2xl` where a ramp step fits, and never hardcode `rounded-[9px]`.
- **Surfaces**: reference `--surface-base/raised/overlay/sunken` for panel elevation instead of inventing local backgrounds.

If a raw value is genuinely intentional, re-baseline with `npm run lint:tokens -- --update` in the same commit.
