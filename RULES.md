# Zen Architecture Rules

This file is the first place every agent and developer should read before changing
the codebase. It is intentionally strict. Zen is powerful enough that loose
conventions will turn into security bugs, duplicate systems, and slow feature
work.

## Current Architecture Verdict

Zen is a recoverable prototype-platform codebase. It has useful modules and a
working build, but it currently has too many privileged systems, parallel
abstractions, oversized files, and feature surfaces that look more complete than
they are.

The rebuild goal is not a rewrite. The goal is one obvious path for every
responsibility.

## Non-Negotiable Rules

1. Do not add business logic to Tauri commands.
2. Do not call tools directly from features; use the canonical tool service.
3. Do not access secrets through normal settings.
4. Do not use raw `invoke`; add or use a typed frontend API wrapper.
5. Do not add SQL outside `src-tauri/crates/zen-db/src/queries/*`.
6. Do not add privileged behavior without routing through the security service.
7. Do not create a second registry, manager, store, or mapping layer for an
   existing domain.
8. Do not use `dangerouslySetInnerHTML` without a documented sanitizer or
   sandbox boundary.
9. Do not add preview UI without feature maturity metadata.
10. Do not exceed file size limits without a documented exemption.

## Target Layering

```txt
Frontend UI
  -> typed frontend API wrappers
  -> Tauri commands            (src-tauri/src/commands/*, app crate only)
  -> app services              (src-tauri/src/services/*, app crate only)
  -> domain crates             (src-tauri/crates/zen-*)
  -> infrastructure            (zen-db queries, zen-core ports)
```

Allowed dependency direction is down the stack only. Lower layers must not import
or know about higher layers. Since the workspace migration this direction is
**compiler-enforced**: a domain crate physically cannot reach `crate::commands`
or `AppState`, because those symbols do not exist in its dependency graph.

### Workspace Crate Map

`src-tauri/` is a Cargo workspace: the `zen` app crate plus nine domain crates
under `src-tauri/crates/`.

| Crate | Owns |
|---|---|
| `zen-core` | Shared error types (`ZenError`) and the host-agnostic ports/traits other crates depend on |
| `zen-db` | SQLite pool, migrations, models, and **every** SQL statement (`queries/*`) |
| `zen-security` | Risk classification, approval policy, permission decisions, audit events, secret redaction, SSRF-safe URL validation |
| `zen-tools` | Tool contracts (`Tool`, `AgentTool`), the catalog registry, the discovery manager, and tool risk defaults |
| `zen-llm` | Provider construction, wire encoders, streaming, reasoning capability resolution |
| `zen-mcp` | MCP config/discovery/consent and the client transport |
| `zen-rag` | Document ingestion, chunking, vector store, conversation store |
| `zen-media` | Speech/TTS runtimes, hardware probe, subprocess manager, runtime resources |
| `zen-agent` | The agent loop: runner, orchestrator, router, event bus, skills, agent types, context |
| `zen` (app) | Tauri commands, app services, leaf tool executors, window/tray/host wiring |

Two rules keep this map honest:

1. **No crate under `crates/` may depend on `tauri` or `keyring`.** Host coupling
   and OS-keyring access stay in the app crate. This is CI-enforced (per-crate
   manifest deny set plus a boundary grep). Crates that need a host reach it
   through a generic parameter (`zen_tools::Tool<A>`) or a `zen-core` port.
2. **Resist adding code to the app crate.** New backend behavior defaults to an
   existing domain crate, or a new one. The app crate should only grow adapters:
   a command that deserialises and calls one service method, a service that
   sequences crate calls, or a tool executor that needs `AppHandle`. If new code
   has no reason to touch `AppHandle`, `AppState`, or a Tauri window, it belongs
   in a crate.

Because zen-tools and zen-agent are generic over the host, the app crate holds
**host-binding type aliases** (for example
`pub type ToolRegistry = zen_tools::registry::ToolRegistry<tauri::AppHandle>;`).
These are not migration leftovers — they are the seam. Rust has no trait
aliases, so `impl` and `dyn` positions must spell the generic path
(`zen_tools::Tool<tauri::AppHandle>`) while struct and type positions use the
alias.

## Backend Ownership

### Commands

Tauri commands are adapters only. They live in the app crate and nowhere else.
They may:

- validate/deserialise request shape
- call one service method
- convert errors into IPC-safe errors
- return a response

They may not:

- contain business workflows
- run SQL
- execute tools directly
- access secrets directly
- implement permission decisions
- construct providers ad hoc

### Services

Services own workflows. App-crate services (`src-tauri/src/services/*`) own the
workflows that genuinely need the host; the rest is owned by a crate.

- `ToolService` (app): tool lookup, permission preflight, execution, audit — it
  needs `AppHandle` to emit approval events
- `SecretService` (app): API keys and credentials; owns the OS keyring, which is
  why it cannot move to a crate
- `SettingsService` (app): non-secret preferences only
- `CheckpointService`, `DocumentService`, `TerminalService`, `UsageService`,
  `MediaService` (app): host-bound workflows
- `SecurityService` (`zen_security::service`): permission checks and audit
  logging
- Provider construction and model discovery (`zen_llm`)

### Domain Crates

Domain crates implement domain behavior, not app-wide orchestration. They may
expose capabilities to services and must not bypass `SecurityService` for
privileged work. When a domain crate needs something only the app can provide
(a window, a keyring entry, an event emitter), it declares a port in `zen-core`
or takes a generic host parameter; the app crate supplies the adapter.

### Infrastructure

Infrastructure modules own low-level adapters:

- database queries (`zen-db`)
- filesystem
- HTTP clients (`zen-llm`, `zen-mcp`; never in `zen-core`)
- keychain (app crate only)
- audit logs (`zen-security`)
- event bus (`zen-agent`)

Business rules do not belong here.

## Tool System Rules

Zen must have one canonical tool architecture.

Every tool must provide:

- stable id
- display metadata
- input schema
- risk level
- permission policy
- execution implementation
- tests or a documented exemption

Required flow:

```txt
agent / MCP / UI request
  -> ToolService
  -> SecurityService permission check
  -> ToolRegistry lookup
  -> tool execution
  -> audit event
```

Forbidden:

- constructing tools directly inside feature modules
- bypassing permission checks for "internal" features
- maintaining parallel v1/v2 registries indefinitely
- registering no-op tools as if they are production-ready

## Security Rules

All privileged operations must pass through `SecurityService` or its successor.

Privileged operations include:

- shell command execution
- process spawning
- file reads and writes
- opening arbitrary paths
- network fetches
- MCP tool calls
- secret reads
- provider calls that use credentials
- rendering untrusted HTML/SVG

Rules:

- CSP must not be `null` in production.
- MCP HTTP must bind to localhost by default.
- Remote MCP requires explicit user opt-in and authentication.
- API keys must not be stored in localStorage or plain SQLite.
- UI may store `hasKey`, never raw secret values except transient edit state.
- URL fetch must use parsed URL, DNS/IP validation, redirect validation, and
  response size limits.
- Terminal execution must default to user confirmation unless explicitly inside a
  documented trusted mode.
- Every privileged action must emit an audit event.
- Never log full provider response bodies or credentials.

## Settings And Secrets

Settings and secrets are different domains.

Settings may include:

- theme
- active provider id
- active model id
- UI preferences
- safe provider base URLs
- feature toggles

Secrets include:

- provider API keys
- custom provider auth tokens
- weather/map API keys
- MCP auth tokens
- anything named key, token, secret, credential, or password

Rules:

- `SettingsService` must not be the long-term store for secrets.
- `SecretService` must own secret read/write/delete.
- Persisted settings may include secret presence metadata only.
- Custom provider configs must separate public config from auth material.

## Frontend Rules

### Premium Motion UX Contract

Zen is a modern workbench, so UI motion is part of the interaction contract,
not an optional polish pass. When creating or changing a component or feature:

- Treat related components as one motion system. Coordinate the parent surface,
  its children, adjacent panels, and surrounding layout so they enter, exit, and
  resize as one intentional sequence rather than as independent snapshots.
- Every user-visible state, visibility, layout, loading, navigation, or feedback
  change must use the shared motion system in `src/lib/motion.ts`, or document
  why it must remain instantaneous. Avoid abrupt mounts, unmounts, height jumps,
  icon swaps, and panel snaps.
- Use stable keys and coordinated enter/exit/layout transitions. Preserve the
  visual relationship between a trigger and the surface it opens; never animate
  a child independently in a way that makes its parent or neighboring content
  jump.
- Use motion to communicate continuity, hierarchy, progress, and causality.
  Prefer short, calm fades, fades with small positional movement, and measured
  layout transitions. Do not add bounce, shake, or decorative pulse merely to
  make a surface feel lively.
- Streaming content is the exception to per-update animation: do not animate
  every token or delta. Animate the message/card mount and meaningful state
  changes, then let the content stream steadily inside the stable surface.
  Exception: a single lightweight trailing cursor or caret at the active
  streaming edge is permitted (CSS-only, no React re-renders for blink).
- New lazy-loaded surfaces, overlays, menus, cards, tool rows, side panels,
  composer modes, and empty/loading states must participate in the same motion
  choreography instead of introducing one-off CSS animation classes.
- Motion must be controlled by Zen's user-owned animation preference and shared
  tokens. Respect the OS `prefers-reduced-motion` setting as the default when
  the user has not explicitly configured the in-app preference; the in-app
  toggle overrides the OS setting once set. Do not create a second parallel
  motion policy or read additional OS media queries beyond reduced-motion.
- Before shipping, inspect the full transition path at normal, loading, error,
  empty, reload, narrow-layout, and animation-disabled states. A component is
  not motion-complete if it looks smooth in isolation but causes a neighboring
  component to snap or reflow.

### State Ownership

Use one owner per state type:

- server state: query hooks or typed IPC API wrappers
- persistent preferences: settings store
- ephemeral UI state: UI store
- chat runtime state: chat store

If two stores own the same field, stop and consolidate.

### Typed IPC

No raw command strings scattered in components.

Bad:

```ts
invoke("send_message", payload)
```

Good:

```ts
chatApi.sendMessage(request)
```

All frontend API wrappers must define request and response types.

### Rendering Untrusted Content

- Markdown, Mermaid, SVG, HTML snippets, and model-generated content are
  untrusted.
- Use text rendering by default.
- Use a sanitizer or sandbox for HTML/SVG.
- `dangerouslySetInnerHTML` requires a comment naming the sanitizer or sandbox.

### Chat Timeline Rendering

The chat timeline must not become a raw execution log, but it must remain an
honest progress surface that answers "what is the agent doing now?" at a glance.

- Render tool calls, agent actions, and subagent work as concise summaries by
  default. Show a brief tool-announce intent (verb + target) when a tool begins,
  and a one-line outcome when it completes.
- Agent phase indicators (Thinking, Searching, Editing, Waiting for approval,
  Done) are always permitted in the timeline as lightweight status rows or
  badges. These are not execution noise — they are user-facing progress.
- Do not display raw internal JSON, full tool arguments, provider payloads,
  prompt bodies, stdout/stderr dumps, stack traces, event metadata, or full
  subagent transcripts in the normal timeline.
- Put technical payloads behind an explicit diagnostic disclosure only when
  useful for failures, approvals, or audits.
- Keep approvals and errors visible and actionable in user language.
- After chat completion and on reload, collapse successful completed tool cards
  to a single-line summary (verb + target + status) in the timeline. Full tool
  output belongs behind an explicit disclosure. Do not leave expanded tool cards
  trailing below the final answer, but do preserve a visible collapsed summary
  so users can audit what the agent did without opening a separate surface.
- Group parallel/multi-tool execution into one compact execution row unless the
  user expands details.
- Subagent output belongs in a delegation summary or dedicated agents panel; it
  must not flood the parent chat.

## Database Rules

- SQL lives only in `src-tauri/crates/zen-db/src/queries/*`.
- List queries require `LIMIT` and pagination or a documented cap.
- Migrations must be idempotent and measured.
- JSON columns should use typed JSON wrappers where practical.
- Services compose queries; queries do not run business workflows.

## File Size Limits

Hard limits:

- Rust warning: 700 lines
- Rust hard fail: 900 lines
- TS/TSX warning: 350 lines
- TS/TSX hard fail: 500 lines

These apply to the whole workspace: the app crate **and** every crate under
`src-tauri/crates/`.

Allowed exemptions must be listed in `docs/architecture/exemptions.md` with:

- file path
- owner
- reason
- split plan
- expiration date or milestone

## Feature Maturity

Every major feature must declare one status:

- `prototype`: dev-only or hidden
- `preview`: visible but clearly not complete
- `partial`: usable with documented missing pieces
- `production`: wired, tested, documented, and supported

Preview UI must not pretend to be production behavior.

## Testing And CI Rules

Minimum gates:

- `npm run build`
- TypeScript typecheck
- `cargo check --workspace --all-targets`
- `cargo clippy --workspace --all-targets`
- `cargo test --workspace --all-targets`
- `cargo deny check` (crate dependency + license audit)
- workspace boundary check: no crate depends on `tauri` or `keyring`
- dependency audit
- bundle size report
- file size check (app crate + `crates/**`)

`cargo test --workspace` cannot run on a Windows dev box — tauri-linked test
binaries abort with `STATUS_ENTRYPOINT_NOT_FOUND`. Locally, verify with
`cargo test -p <crate>` per crate plus `cargo check -p zen --all-targets`; CI is
the only place the whole-workspace test run is meaningful.

New privileged code requires tests for:

- allowed path
- denied path
- audit event
- malformed input

Feature verifier scripts are product contracts, not snapshots of old file
layouts. When logic moves between modules, update the verifier to check the new
owner module or observable behavior in the central test run. Do not keep brittle
exact-string assertions against files that no longer own the behavior.

## Documentation Rules

New architecture patterns require docs. Update the relevant file under
`docs/architecture/` when adding or changing:

- security policy (owned by `zen-security`)
- tool architecture (owned by `zen-tools`)
- settings/secrets behavior (app-crate services; keyring stays app-side)
- streaming behavior (owned by `zen-llm`)
- agent loop, event bus, delegation (owned by `zen-agent`)
- database schema or queries (owned by `zen-db`)
- RAG/ingestion (owned by `zen-rag`)
- media runtimes (owned by `zen-media`)
- frontend state ownership
- IPC contracts
- feature maturity

## Phase Rebuild Order

1. Phase 0: rules, docs, audit baseline, CI visibility.
2. Phase 1: security boundary and secret separation.
3. Phase 2: canonical tool system.
4. Phase 3: typed IPC and frontend state cleanup.
5. Phase 4: split oversized modules.
6. Phase 5: performance budgets and lazy loading.
7. Phase 6: test and lint ratchet.

Do not skip Phase 1 and Phase 2 to add new features. That is how the current
mess propagates.

## Tauri v2 Window Permissions and Capability Rules
- When adding or renaming any window label (e.g. `splashscreen`), you **must** register it inside the capability configuration JSON file under `src-tauri/capabilities/default.json` (inside the `"windows"` array block). 
- If a window is omitted from capability configurations, Tauri v2's IPC router will block all frontend command invocations (`invoke`) and event listeners (`listen`) silently, causing the interface to freeze or fail without native crash messages.
- Always provide watchdog fail-safes (e.g. `setTimeout` fallback intervals) inside independent webview scripts to guarantee window execution completes and transfers focus in development environments.
