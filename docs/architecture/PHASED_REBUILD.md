# Zen Phased Rebuild Plan

This plan turns the audit findings into an ordered stabilization program. The
goal is to make future feature work faster by removing ambiguity first.

## Phase 0: Architecture Contract

Status: started.

Goals:

- Publish hard architecture rules in `RULES.md`.
- Make future agents read the rules first.
- Establish current build and audit baseline.
- Define the target layering before more feature work lands.

Exit criteria:

- `RULES.md` exists and is linked from `AGENTS.md`.
- Architecture docs directory exists.
- Current critical risks are listed in a maintained report.
- Build/check commands are documented.

## Phase 1: Security Boundary

Goals:

- Introduce a central `SecurityService`.
- Route shell, file, network, MCP, and secret access through it.
- Add audit events for privileged actions.
- Replace informal per-tool permission checks with one policy gateway.

Work items:

- Define `SecurityService` API.
- Add `PermissionRequest`, `PermissionDecision`, and `AuditEvent` types.
- Move SSRF validation out of ad hoc regex-only checks.
- Require MCP auth before remote access.
- Add command execution policy modes: deny, ask, trusted workspace.

Exit criteria:

- No privileged operation bypasses `SecurityService`.
- MCP is localhost-only unless explicitly configured otherwise.
- Privileged paths have denial tests.

## Phase 2: Settings And Secrets

Goals:

- Split non-secret settings from credential storage.
- Remove API keys from localStorage and plain SQLite persistence.
- Store only secret presence metadata in normal settings.

Work items:

- Add `SecretService`.
- Pick backend: Stronghold, OS keychain, or encrypted credential store.
- Migrate provider keys out of settings.
- Split custom provider public config from `apiKey`.
- Update provider execution to resolve secrets at runtime.

Exit criteria:

- No persisted API keys in frontend localStorage.
- No provider keys in plain settings rows.
- UI can display `hasKey` without loading raw key values.

## Phase 3: Canonical Tool System

Goals:

- Make one tool trait, one registry, one execution path.
- Remove direct tool construction from features.
- Make MCP, agent, and UI tool calls share the same policy.

Work items:

- Choose the canonical `Tool` trait.
- Mark old tool system deprecated.
- Add a migration table for each tool.
- Route deep research and MCP through `ToolService`.
- Remove no-op registered tools or mark them `preview`.

Exit criteria:

- There is one documented path for adding a tool.
- Every registered tool has metadata, permission policy, and tests or exemption.
- No feature calls `.execute()` on a tool directly.

## Phase 4: Typed IPC And Frontend State

Goals:

- Remove raw `invoke` from components.
- Consolidate duplicated frontend state ownership.
- Make backend contracts discoverable by new developers and agents.

Work items:

- Create `src/api/*Api.ts` wrappers.
- Define request/response types for each command.
- Move command names out of components.
- Audit duplicate ownership of model/provider/theme/settings fields.
- Remove silent catches from user-visible flows.

Exit criteria:

- Components use API wrappers, not raw command strings.
- One store owns each state domain.
- IPC errors have typed shapes and UI handling.

## Phase 5: Split Oversized Modules

Goals:

- Reduce hidden coupling in large files.
- Make ownership obvious by filename and module boundary.

Priority targets:

- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/runner/tool_dispatch.rs`
- `src/components/workbench/CesiumMapRenderer.tsx`
- `src/atlas/components/chat/AssistantMessage.tsx`
- `src-tauri/src/canvas/session.rs`

Exit criteria:

- No non-exempt Rust file over 900 lines.
- No non-exempt TS/TSX app file over 500 lines.
- Exemptions are documented with expiration milestones.

## Phase 6: Performance Budgets

Goals:

- Reduce startup bundle and runtime overhead.
- Make performance regressions visible in CI.

Work items:

- Lazy-load Mermaid, math, syntax highlighting, charts, maps, and editors.
- Add Rollup manual chunks for heavy dependencies.
- Add bundle budget checks.
- Share HTTP clients in Rust instead of creating per-request clients.
- Add pagination or caps to all list queries.

Exit criteria:

- Initial JS gzip target: 700 KB.
- Initial JS gzip hard ceiling: 1 MB.
- Large dependency additions require justification.

## Phase 7: CI Ratchet

Goals:

- Convert quality from opinion into enforcement.
- Ratchet warnings without blocking the rebuild on day one.

Work items:

- Fix `cargo test --all-targets` runtime failure.
- Make `cargo clippy --all-targets` pass without `-D warnings`.
- Add selected deny lints.
- Add file-size checker.
- Add dependency audit.
- Add rule checks for raw `invoke`, raw SQL, and unsafe HTML injection.

Exit criteria:

- CI blocks new violations.
- Existing debt is tracked by explicit exemptions.
- New code cannot silently increase architecture debt.

## Human Decisions Required

These cannot be solved by agents alone:

- Which secret backend should be used?
- Should MCP remote access exist at all?
- What command execution modes are acceptable?
- Which tool system is canonical?
- Which preview features should be hidden versus finished?
- What bundle budget is acceptable for the first production release?
- Which features are truly production-critical?
