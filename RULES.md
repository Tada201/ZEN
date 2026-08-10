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
5. Do not add SQL outside `src-tauri/src/db/queries/*`.
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
  -> Tauri commands
  -> backend services
  -> domain modules
  -> infrastructure and db queries
```

Allowed dependency direction is down the stack only. Lower layers must not import
or know about higher layers.

## Backend Ownership

### Commands

Tauri commands are adapters only. They may:

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

Services own workflows. Examples:

- `ChatService`: sending messages, streaming lifecycle, chat persistence
- `ToolService`: tool lookup, permission preflight, execution, audit events
- `ProviderService`: provider construction, model discovery, provider health
- `SettingsService`: non-secret preferences only
- `SecretService`: API keys and credentials only
- `SecurityService`: permission checks and audit logging

### Domain Modules

Domain modules implement domain behavior, not app-wide orchestration. Examples:

- `agent`
- `tools`
- `mcp`
- `rag`
- `terminal`
- `canvas`
- `gtsm`

Domain modules may expose capabilities to services. They must not bypass
services for privileged work.

### Infrastructure

Infrastructure modules own low-level adapters:

- database queries
- filesystem
- HTTP clients
- keychain or Stronghold
- audit logs
- event bus

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
- New lazy-loaded surfaces, overlays, menus, cards, tool rows, side panels,
  composer modes, and empty/loading states must participate in the same motion
  choreography instead of introducing one-off CSS animation classes.
- Motion must be controlled by Zen's user-owned animation preference and shared
  tokens. Do not read the operating system reduced-motion preference directly,
  and do not create a second motion policy.
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

The chat timeline must not become a raw execution log.

- Render tool calls, agent actions, and subagent work as concise summaries by
  default.
- Do not display raw internal JSON, full tool arguments, provider payloads,
  prompt bodies, stdout/stderr dumps, stack traces, event metadata, or full
  subagent transcripts in the normal timeline.
- Put technical payloads behind an explicit diagnostic disclosure only when
  useful for failures, approvals, or audits.
- Keep approvals and errors visible and actionable in user language.
- Hide successful completed tool cards from the main timeline after chat
  completion and on reload; persisted tool data is for audit/details surfaces,
  not a trailing chat card.
- Group parallel/multi-tool execution into one compact execution row unless the
  user expands details.
- Subagent output belongs in a delegation summary or dedicated agents panel; it
  must not flood the parent chat.

## Database Rules

- SQL lives only in `src-tauri/src/db/queries/*`.
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
- `cargo check --all-targets`
- `cargo clippy --all-targets`
- `cargo test --all-targets`
- dependency audit
- bundle size report
- file size check

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

- security policy
- tool architecture
- settings/secrets behavior
- streaming behavior
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
