# Zen Phased Rebuild Plan

This plan reflects the current rebuild state. The goal is still incremental
stabilization, not a rewrite.

## Current Position

Zen is currently in **Phase 3.5: backend consolidation before frontend
restructure**.

Phases 0-3 are no longer greenfield work. They are mostly implemented, with
specific backend cleanup still required before moving heavily into frontend state
and UI structure.

## Phase 0: Architecture Contract

Status: mostly complete.

Completed:

- `RULES.md` defines the architecture contract.
- `AGENTS.md` tells agents to read `RULES.md` first.
- Architecture docs live under `docs/architecture/`.
- CodeGraph usage is documented for agents.
- CI, backend test, runtime binary, and secret-artifact docs exist.

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

Status: mostly complete, not fully collapsed.

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

Remaining:

- Ensure every production tool has metadata, risk level, permission policy, and
  tests or an exemption.
- Migrate legacy `src-tauri/src/agent/tools/*` tools into v2 only when touched
  or when a security issue requires it.

## Phase 3.5: Backend Consolidation

Status: active.

Goals:

- Finish backend-only cleanup before frontend restructure.
- Reduce ambiguous ownership around tools, runtime resources, voice, and large
  backend modules.
- Keep CI fast enough to run often.

Current work items:

- Add tests for runtime resource path resolution and atomic writes.
- Split the highest-risk oversized backend module:
  `src-tauri/src/agent/runner/loop.rs`.
- Continue splitting oversized backend modules with named ownership.
- Keep `npm run quality:fast`, `npm run test:backend`, and
  `npm run secret:artifacts` passing.

Exit criteria:

- Tool-system ownership is documented.
- Runtime resource helper exists and is used by Speech/TTS process setup.
- Remaining direct privileged operations are either routed or explicitly
  documented in `docs/architecture/privileged-operations.md`.
- Top backend oversized files have named split plans.
- No new backend phase work increases architecture debt.

## Phase 4: Typed IPC And Frontend State

Status: not started as a main phase.

Goals:

- Remove raw `invoke` from components.
- Consolidate duplicated frontend state ownership.
- Make backend contracts discoverable.

Exit criteria:

- Components use typed API wrappers.
- One store owns each state domain.
- IPC errors have typed shapes and UI handling.

## Phase 5: Split Oversized Modules

Status: started only as exemptions and quality gates.

Priority backend targets:

- `src-tauri/src/canvas/session.rs`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/tools/progressive.rs`
- `src-tauri/src/agent/workflow.rs`
- `src-tauri/src/agent/swarm.rs`
- `src-tauri/src/db/mod.rs`

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
