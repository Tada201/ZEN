# Zen Phased Rebuild Plan

This plan reflects the current rebuild state. The goal is still incremental
stabilization, not a rewrite.

## Current Position

Zen is currently ready to move into **Phase 5: oversized module splitting**.

Phases 0-4 are no longer the active rebuild bottleneck. Phase 3 keeps a
documented legacy tool compatibility boundary, and Phase 4 keeps incremental
message/catch-block cleanup, but the core security, tool, typed IPC, and
frontend state-ownership contracts are in place.

## Phase 0: Architecture Contract

Status: mostly complete.

Completed:

- `RULES.md` defines the architecture contract.
- `AGENTS.md` tells agents to read `RULES.md` first.
- `AGENTS.md` tells agents to read the frontend contract before frontend work.
- Architecture docs live under `docs/architecture/`.
- CodeGraph usage is documented for agents.
- CI, backend test, runtime binary, and secret-artifact docs exist.
- Frontend architecture rules exist in `docs/architecture/frontend-rules.md`.

Remaining:

- Keep this plan current after each backend phase.
- Add architecture decision docs when new patterns are introduced.

## Phase 1: Security Boundary

Status: mostly complete, still needs coverage expansion.

Completed:

- `SecurityService` exists.
- Privileged tool execution is routed through policy checks.
- URL fetch has SSRF validation, DNS/IP checks, redirect validation, and body
  limits.
- Terminal execution has auditing and workspace-aware defaults.
- MCP HTTP is localhost-only for this phase.
- Document/file ingestion paths are workspace-bound.

Remaining:

- Review direct process/filesystem/network use in voice, RAG, terminal, and
  runtime resource code.
- Decide which direct uses become shared helpers versus documented exemptions.
- Expand denial/audit tests for non-tool privileged paths.

## Phase 2: Settings And Secrets

Status: mostly complete.

Completed:

- `SecretService` stores credentials in OS keyring using service `zen`.
- Normal settings expose only public settings and secret presence metadata.
- Plain settings secret migration exists.
- Public settings APIs redact secret-like keys.
- Secret writes/deletes are audited.

Remaining:

- Continue targeted reviews for new provider/GTSM/custom-token settings.
- Add platform-level manual validation for OS keyring behavior before release.

## Phase 3: Canonical Tool System

Status: complete with documented compatibility boundary.

Completed:

- `ToolService` is the canonical policy/execution boundary.
- Deep research, MCP, agent tool execution, and web fetch route through policy.
- Direct tool execution quality gates exist.
- Unknown agent tool ids are blocked by quality checks.
- Placeholder/no-op tool registrations were reduced.
- Tool ownership and migration rules are documented in
  `docs/architecture/tool-system.md`.
- Remaining v1/v2 tool surfaces are explicitly documented as a Phase 3.5
  compatibility boundary.

Follow-up:

- Ensure every production tool has metadata, risk level, permission policy, and
  tests or an exemption.
- Migrate legacy `src-tauri/src/agent/tools/*` tools into v2 only when touched
  or when a security issue requires it.

## Phase 3.5: Backend Consolidation

Status: complete for Phase 5 entry.

Goals:

- Finish backend-only cleanup before frontend restructure.
- Reduce ambiguous ownership around tools, runtime resources, voice, and large
  backend modules.
- Keep CI fast enough to run often.

Completed:

- `src-tauri/src/agent/runner/loop.rs` was brought below the Rust hard limit.
- Tool ownership, runtime resources, terminal execution, speech/TTS resource
  setup, and privileged-operation documentation are in place.
- Lightweight backend tests cover security/tool policy and runtime resources.
- `npm run quality:fast`, `npm run test:backend`, and
  `npm run secret:artifacts` are the active fast gates.

Exit criteria:

- Tool-system ownership is documented.
- Runtime resource helper exists and is used by Speech/TTS process setup.
- Runtime resource path resolution and atomic write tests exist.
- Runtime resource path/atomic-write coverage runs in the lightweight backend
  test gate.
- Remaining direct privileged operations are either routed or explicitly
  documented in `docs/architecture/privileged-operations.md`.
- Top backend oversized files have named split plans, and no active backend file
  exceeds the Rust hard limit without a current exemption.
- No new backend phase work increases architecture debt.

## Phase 4: Typed IPC And Frontend State

Status: complete for Phase 5 entry.

Goals:

- Remove raw `invoke` from components.
- Replace direct untyped Tauri event listeners with typed event wrappers.
- Consolidate duplicated frontend state ownership.
- Make backend contracts discoverable.

Completed:

- Raw frontend `invoke` calls are centralized through `src/api/tauriClient.ts`.
- `src/api/events.ts` provides the first typed event wrapper.
- Artifact and tool stream hooks use typed event payloads.
- Chat, agent, terminal, voice, task, and embedding event listeners route
  through typed event wrappers instead of raw `listen<any>`.
- Custom provider/API key surfaces return presence metadata and route secret
  writes through backend secret APIs.
- Chat store persistence no longer keeps server-owned sessions, archived
  sessions, folders, search results, or fetched messages. React Query owns those
  datasets; Zustand keeps active chat id, streaming flags, live message buffers,
  search UI state, and artifacts.
- Audio preferences now have one owner: `useSettingsStore`. The unused
  `useAudioStore` mirror was removed instead of keeping a second persisted
  audio preference path.
- Chat model selection now reads provider model discovery through a React Query
  catalog call instead of depending on `useSettingsStore.availableModels` or
  `fetchingModels`. Settings screens still own provider configuration and
  provider-settings catalog sync.
- Chat store no longer exposes compatibility mutators for server-owned sessions,
  archived sessions, folders, or server search results. It keeps only active
  chat id, search UI input state, artifacts, streaming flags, and live message
  buffers.
- Frontend IPC calls now reject with a normalized `IpcCommandError` from
  `src/api/tauriClient.ts`, including command name, stable error code, message,
  and raw payload. UI code can use `getIpcErrorMessage` instead of ad hoc
  `toString()` handling.
- Frontend architecture rules are documented.

Follow-up:

- Consolidate React Query versus Zustand ownership for messages where legacy
  compatibility fields still exist.
- Remove duplicate or compatibility-only message setters once all consumers use
  per-session runtime APIs directly.
- Continue migrating older catch blocks to `getIpcErrorMessage` as files are
  touched.

Exit criteria:

- Components use typed API wrappers.
- Components use typed event wrappers instead of raw `listen<any>`.
- One store owns each state domain.
- IPC errors have typed shapes and UI handling.

Phase 5 entry evidence:

- `rg -n "invoke\(" src -g "*.ts" -g "*.tsx"` returns no component-level raw
  invoke hits.
- `rg -n "listen<any>|event: any|listen\(" src -g "*.ts" -g "*.tsx"` returns no
  direct untyped listener hits.
- `useChatStore` no longer owns server session, folder, archived-session, or
  search-result collections.
- `src/api/tauriClient.ts` normalizes command failures into `IpcCommandError`.

## Phase 5: Split Oversized Modules

Status: backend hard-limit split complete; frontend hard-limit split remains.

Completed backend hard-limit targets:

- `src-tauri/src/agent/runner/loop.rs` was reduced below the Rust hard limit by
  extracting lifecycle, memory bootstrap, turn persistence, and tool
  authorization helpers.
- `src-tauri/src/canvas/session.rs` was reduced below the Rust hard limit by
  extracting session contracts and parser/color/time helpers.
- `src-tauri/src/agent/workflow.rs` was reduced below the Rust hard limit by
  extracting workflow contracts, events, metrics, result, and error types.
- `src-tauri/src/agent/swarm.rs` was reduced below the Rust hard limit by
  extracting swarm contracts, events, state, result, and error types.

Remaining backend warning-size targets:

- `src-tauri/src/canvas/session.rs`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/db/mod.rs`
- `src-tauri/src/agent/router.rs`
- `src-tauri/src/llm/anthropic.rs`
- `src-tauri/src/agent/plugins.rs`
- `src-tauri/src/agent/memory.rs`
- `src-tauri/src/agent/tools/progressive.rs`
- `src-tauri/src/tools/permission.rs`

Remaining frontend hard-limit targets:

- Run the frontend file-size gate and split any non-exempt TS/TSX files over
  500 lines.

Exit criteria:

- No non-exempt Rust file over 900 lines.
- No non-exempt TS/TSX app file over 500 lines.
- Exemptions have owners, reasons, split plans, and expiration milestones.

## Phase 6: Performance Budgets

Status: not started.

Goals:

- Reduce startup bundle and runtime overhead.
- Make performance regressions visible.

Known issues:

- Frontend production build emits large chunk warnings.
- Some backend paths still create per-request HTTP clients.
- List query caps/pagination need a focused audit.

## Phase 7: CI Ratchet

Status: started.

Completed:

- GitHub Actions CI and release workflows exist.
- Secret artifact guard exists.
- Runtime binary fetch/check scripts exist.
- Backend lightweight test gate exists.
- File-size gate exists with exemptions.
- Architecture gates for raw invoke, raw SQL, and direct tool execution exist.

Remaining:

- Full `cargo test --all-targets` still has a known Windows loader issue.
- `cargo clippy --all-targets` is not yet enforced.
- Dependency audit and bundle budget checks are not yet enforced.
- Full Tauri release build remains manual/deferred because compile time is high.

## Human Decisions Required

- Which preview features should be hidden versus finished?
- What bundle budget is acceptable for first release?
- Which local voice models should ship by default?
- Should remote MCP ever be supported, and with what authentication?
- Which backend oversized module should be split first if feature work competes
  for time?
