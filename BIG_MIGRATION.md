# BIG_MIGRATION.md — Zen Rust Workspace Migration Plan

Status: PLANNED · Owner: Zen maintainers · Created: 2026-08-22
Scope: `src-tauri/` backend only. **No frontend (`src/`) changes are part of this plan.**

Source of truth references: [RULES.md](RULES.md) · [Security.md](Security.md) ·
[docs/architecture/](docs/architecture/) · this document.

---

## 1. Why

RULES.md already mandates a layering (`commands → services → domain → infra`,
down-the-stack only) and a Phase 4 "split oversized modules" step. Today that
layering is convention-only: nothing stops `agent/` from importing
`crate::commands::AppState` upward — and it does, 25+ times. Converting
`src-tauri` into a **Cargo workspace** makes those rules compile errors instead
of review-time hopes, parallelizes compilation of heavy dependency clusters,
and enables per-crate test scoping.

Reference model: OpenAI's `codex-rs` workspace (protocol → core → surfaces),
adopted incrementally ("peel off reusable pieces in reviewable increments"),
scaled to Zen's reality: one UI surface, so ~9 crates, not 130.

## 2. Current-state audit (measured 2026-08-22)

Single crate `zen` (lib name `tauri_app_lib`), edition 2021, Tauri v2.
~77K lines of Rust across 276 files under `src-tauri/src`.

| Module | Files | Lines | Notes |
|---|---|---|---|
| agent | 80 | 27,250 | runner/orchestrator/deep_research/swarm/skills/middleware/tools |
| services | 47 | 10,906 | incl. gtsm/, speech_service/, tts_service/ |
| commands | 35 | 8,517 | ~200 Tauri commands registered in lib.rs (630 lines) |
| llm | 20 | 6,657 | anthropic / openai_compat / ollama providers |
| tools | 16 | 6,594 | manager.rs registry + permission.rs policy |
| mcp | 22 | 5,363 | client/config/consent/discovery |
| db | 22 | 4,823 | sqlx pool, migrations, queries/* (migrations inline in db/mod.rs:96-97) |
| canvas | 10 | 2,603 | never leaves the app crate in this migration (split-only in Phase 12) |
| rag | 8 | 2,003 | lancedb stores + embeddings |
| browser | 5 | 806 | webview2-com COM interop, stays in app crate |
| search | 2 | 526 | stays in app crate |
| terminal | 1 | 469 | portable-pty, stays in app crate |
| models/utils | 4 | 176 | trivial |

### 2.1 Layering violations found (evidence)

Upward imports from domain into adapter/UI state layers — all illegal under
RULES.md's direction rule, all legal to the compiler today. Grouped by
replacement strategy (context handle vs port vs service-handle):

**(a) `AppState` reach-throughs** (→ replace with `AgentContext` fields):
- `agent/**`: `agent/clarification.rs:8`, `agent/deep_research/engine.rs:11`,
  `agent/deep_research/mod.rs:80`, `agent/orchestrator/execution.rs:280,307`,
  `agent/middleware/system_prompt.rs:87,189,467`, `agent/middleware/skills.rs:34`,
  `agent/skills/manager.rs:173`, `agent/runner/loop.rs:21,136,212`,
  `agent/runner/background.rs:113,373,434`, `agent/runner/escalation.rs:1027`,
  `agent/runner/memory_bootstrap.rs:107`, `agent/runner/tool_dispatch.rs:427,491,573,876`,
  `agent/runner/voice_display.rs:3`,
  `agent/tools/{child_runner,browser_tools,fs_tools,graph_session,search_files,session_memory_tools,spawn_tools,task_tools,terminal_tools}.rs`
- `tools/**` (8 files — discovered in review, must be resolved before Phase 5):
  `tools/image_tool.rs:8`, `tools/sys_metrics.rs:5-6`, `tools/terminal_tools.rs:7`,
  `tools/documents.rs:9`, `tools/mod.rs:16`, `tools/patch.rs:11`, `tools/write.rs:13`,
  plus `agent/tools/routing_tools.rs:108`

**(b) Command-layer helper calls from domain** (→ move logic core behind a
context handle; not literal AppState imports):
- `agent/orchestrator/loop.rs:40,467` and `agent/runner/loop.rs:281` call
  `crate::commands::wait_for_chat_resume(...)`

**(c) Direct services imports from domain** (→ depend on traits instead):
- `agent/**` → `crate::services::{gtsm, goal, permissions, tool, McpDiscoveryService}`
  (`agent/middleware/system_prompt.rs:92`, `agent/runner/tool_dispatch.rs:16,694`,
  `agent/runner/tool_pipeline.rs:3`, `agent/tools/{map_tools,routing_tools,osint_tools,task_tools}.rs`)
- `llm/registry.rs:9` → `crate::services::{SecretService, SettingsService}`

### 2.2 Oversized files (>700 warn / >900 hard-fail per RULES.md)

| File | Lines | Destination crate |
|---|---|---|
| src-tauri/src/agent/tools/spawn_tools.rs | 1,593 | zen-agent |
| src-tauri/src/llm/openai_compat/stream.rs | 1,474 | zen-llm |
| src-tauri/src/agent/deep_research/phases.rs | 1,421 | zen-agent |
| src-tauri/src/tools/permission.rs | 1,411 | zen-security |
| src-tauri/src/agent/runner/loop.rs | 1,337 | zen-agent |
| src-tauri/src/services/tool.rs | 1,321 | app (service shell) |
| src-tauri/src/agent/runner/helpers.rs | 1,188 | zen-agent |
| src-tauri/src/agent/runner/tool_dispatch.rs | 1,186 | zen-agent |
| src-tauri/src/agent/runner/escalation.rs | 1,052 | zen-agent |
| src-tauri/src/db/mod.rs | 959 | zen-db |
| src-tauri/src/llm/anthropic.rs | 946 | zen-llm |
| src-tauri/src/tools/manager.rs | 928 | zen-tools |
| src-tauri/src/canvas/session.rs | 828 | app (later) |
| src-tauri/src/commands/chat/send.rs | 882 | app |
| src-tauri/src/agent/tools/fs_tools.rs | 787 | zen-agent |
| src-tauri/src/agent/event_bus.rs | 775 | zen-core (port) + app (bridge) |
| src-tauri/src/llm/ollama.rs | 759 | zen-llm |
| src-tauri/src/services/mcp_config.rs | 761 | zen-mcp |
| src-tauri/src/agent/runner/voice_display.rs | 733 | zen-agent |
| src-tauri/src/agent/router.rs | 715 | zen-agent |
| src-tauri/src/agent/runner/context_breakdown.rs | 710 | zen-agent |
| src-tauri/src/services/speech_service/mod.rs | 702 | zen-media |

### 2.3 Heavy dependency clusters (single manifest today)

| Cluster | Deps | Natural home |
|---|---|---|
| ML models | candle-core, candle-transformers, candle-nn, tokenizers | zen-media |
| Vector DB | lancedb, arrow-array, arrow-schema | zen-rag |
| Web crawl/scrape | spider, scraper | zen-rag (ingestion) |
| Audio/VAD | rodio, cpal, hound, webrtc-vad | zen-media |
| Terminal PTY | portable-pty | app (initially) |
| HTTP server | axum, tower-http | app (MCP local server) |
| DB | sqlx (sqlite) | zen-db |
| Windows interop | webview2-com, windows COM FFI | app (browser preview) |
| Secrets | keyring (windows-native) | app service impl behind trait |

Other facts: `policy-tests/` is a standalone cargo project nested inside
src-tauri with its own Cargo.toml/target/Cargo.lock (double compilation);
`tests/agentic_test.rs` is an integration test in the app crate;
`.cargo/audit.toml` config exists; `rust-toolchain.toml` at repo root;
profiles live in the crate manifest today (must move to workspace root).

## 3. Target architecture

```
src-tauri/                     workspace root + Tauri composition root
├── Cargo.toml                 [workspace] members = [".", "crates/*", "policy-tests"]
│                              [workspace.dependencies] · profiles · resolver = "2"
├── src/                       app crate "zen": lib.rs boot, AppState, commands/,
│                              services composition, canvas/browser/search/terminal
├── crates/
│   ├── zen-core/              error, shared types, event contracts, trait seams
│   ├── zen-db/                sqlx pool, migrations, queries/*
│   ├── zen-security/          permission model, risk levels, audit events
│   ├── zen-tools/             Tool trait, registry, metadata, tool catalog
│   ├── zen-llm/               provider clients + streaming
│   ├── zen-mcp/               MCP client, config, consent, discovery
│   ├── zen-rag/               lancedb stores, embeddings, ingestion pipeline
│   ├── zen-media/             audio capture/VAD/TTS + candle model runtime
│   └── zen-agent/             runner loop, orchestrator, sub-agents, deep research
└── policy-tests/              joins the workspace (single lock/target)
```

### 3.1 Allowed dependency edges (compiler-enforced after migration)

```
zen-app(src-tauri) ──→ ALL crates (composition root; the only tauri consumer)

zen-agent    → zen-{core, tools, llm, mcp, security, db}   (+ ports for rag/search/media)
zen-mcp      → zen-{core, security, db, tools}
zen-llm      → zen-core            (wire DTOs incl. ToolInfo/ProviderConfig live in core)
zen-tools    → zen-{core, security}
zen-security → zen-{core, db}
zen-rag      → zen-{core, db}
zen-media    → zen-core
zen-db       → zen-core
```

Hard rules (CI-guarded):

1. No crate under `crates/` may depend on `tauri` (any version). Domain logic
   receives ports/trait objects; only the app crate touches tauri types.
2. Dependencies point down the stack only. `zen-core` depends on nothing above
   serde/tokio/tracing/thiserror/uuid/chrono.
3. New subsystems default to new crates ("resist adding code to zen-app").
4. Every phase ends green: check+clippy+test on `--workspace --all-targets`,
   plus `npm run build` unchanged.

### 3.2 Crate mapping (source → destination)

| Source module | Destination crate |
|---|---|
| src/error.rs (+ shared result helpers) | zen-core |
| src/models/, cross-domain DTO types, event payload contracts | zen-core |
| src/db/** | zen-db |
| src/tools/permission.rs + services/permissions.rs + security.rs + secret_policy.rs (policy core) | zen-security |
| src/tools/** (manager.rs, definitions, metadata) minus permission.rs | zen-tools |
| src/llm/** | zen-llm |
| src/mcp/** + services/mcp_*.rs (logic cores) | zen-mcp |
| src/rag/** | zen-rag |
| services/speech_service/, tts_service/, audio/voice stacks | zen-media |
| src/agent/** | zen-agent |
| services/gtsm/, canvas, browser, search, terminal, commands, AppState, lib.rs | stay in app crate |

Services keep their *composition* role in the app crate (they own AppHandle
and wire concrete impls into trait seams); their *logic cores* move down.

### 3.3 Cross-crate DTO ownership (review finding)

Shared wire/domain types used by 2+ crates live in `zen-core` — specifically:
`ToolInfo` (historically duplicated across `llm/{anthropic,chat,ollama,openai_compat}`;
since Phase 2 defined once at `zen-core/src/types.rs:12`, with all llm sites
consuming it via re-export),
`llm/mod.rs:87,228`), a `ProviderConfig` **DTO** (the persistence model stays
in zen-db; app converts at the boundary), event payloads, and risk/approval
enums consumed by UI-facing types. Rule of thumb: if two crates would need it,
it belongs in core; persistence shapes stay in db.

### 3.4 Known cross-crate coupling to resolve (review findings)

These edges exist today inside the single crate and block naive extraction:

| Coupling | Evidence | Resolution |
|---|---|---|
| tools ↔ agent (circular!) | `tools/manager.rs:7,165,814-817` wraps `agent::tools::ToolRegistry`; `tools/mod.rs:216,271,333` store `Arc<dyn agent::tools::AgentTool>`; `tools/web_fetch.rs:13` | Phase 5 pre-task: unify V1/V2 registries — canonical `AgentTool` trait + registry moves into zen-tools first |
| mcp → tools | `mcp/mod.rs:22-23,124-126`, `mcp/tool_schema.rs:113-166` use `{url_safety, ToolRegistry, ToolAnnotations, RiskLevel}` | url_safety → zen-security (Phase 4); zen-mcp depends on zen-tools (Phase 8) |
| mcp constructs concrete services | `mcp/env.rs:138-140`, `mcp/elicit.rs:278-292` build SecretService/SecurityService/SettingsService | Phase 6: construction inversion — services passed in as traits |
| agent → rag/search/media | `agent/runner/background.rs:476` (ConversationVector), `agent/runner/config.rs:85` (cosine_similarity), `agent/tools/progressive.rs:130,419` (WebSearchTool) | Phase 6 ports: `VectorStorePort`, `WebSearchPort`, `ProcessPort`; rag/search impls provided by app |
| llm → tools/db | ToolInfo imports (above) + `llm/registry.rs:6` (`db::models::ProviderConfig`) | §3.3 DTO rule: both types' shared shape into zen-core |

## 4. Guiding principles for every phase

1. **One phase = one green build.** Never stack phases. Each ends with the full
   gate suite passing and a git tag `migration/phase-NN-done`.
2. **Move, don't rewrite.** Code moves between crates as-is; behavior changes
   and file splits are separate, explicit tasks inside the same phase.
3. **Traits before extraction.** A crate is only extractable once its upward
   dependencies are expressed as traits defined in zen-core.
4. **No tauri in crates/.** If code needs to emit events or read state, it takes
   a port (`dyn EventSink`, context structs); the app crate implements ports.
5. **Compiler is the reviewer.** After each move, `cargo check --workspace`
   errors list every missed call site — fix them mechanically, don't redesign.
6. **One relocation doctrine everywhere:** every extraction re-exports moved
   symbols from their old path (`pub use zen_db::...` in app's `db` module) so
   call sites — including `tests/agentic_test.rs`, which imports
   `tauri_app_lib::{commands::AppState, db::models, llm::*, agent::*}` — keep
   compiling unchanged. Shims are deleted in Phase 14 in one sweep.
7. **Cold builds are expected.** After Phase 0's clean and after every crate
   extraction, the first full build is slow. On this MSVC/win32 box expect a
   multi-minute full rebuild per phase; warm rebuilds still improve vs today.
   Enable Windows Long Paths if deep `crates/<name>/src/...` nesting hits the
   260-char limit.
8. **Toolchain governance is unchanged:** `rust-toolchain.toml` at repo root
   governs the nested workspace automatically; nothing to configure.

## 5. Verification command reference (the gate suite)

```powershell
cargo metadata --no-deps --format-version 1 > $null          # workspace valid
cargo check    --workspace --all-targets                     # compiles
cargo clippy   --workspace --all-targets -- -D warnings      # lint clean
cargo test     --workspace                                   # unit + integration
npm run build                                                # frontend untouched gate
cargo tree -p <crate> | Select-String tauri                  # must be EMPTY for crates/*
```

CI additionally runs dependency audit and file-size checks per RULES.md.

## 6. Rollback doctrine

- Tag before every phase: `migration/phase-NN-start` (or rely on previous
  phase's `-done` tag).
- If a phase cannot reach green within its session, revert to the last `-done`
  tag: `git reset --hard migration/<last>-done` (no merge commits mid-migration).
- The app must remain fully functional at every phase boundary. There is no
  "half-migrated" resting state other than completed phases.

---

## Phase 0 — Baseline & safety net

**Goal:** capture the exact starting point; reclaim disk; make rollback trivial.

**Prerequisites:** none.

**Tasks**
- [x] Ensure the working tree is clean: baseline committed as `0a89f6b`
      `chore: pre-migration baseline` (2026-08-22; only 3 changed files
      remained at execution: two stale plan docs deleted + this file added).
      Junk cleanup in the same pass: `src-tauri/nul`, `.review-diff.tmp`,
      `src-tauri/src/db/queries.rs.bak` (all untracked/gitignored).
- [x] Create rollback tag `pre-workspace-migration` (local; pushed with the
      phase tags at the end of Phase 1).
- [x] Delete `src-tauri/target/` (measured 40 GB at execution; plan said
      ~45.3 GB).
- [x] Delete stray `src-tauri/src/db/queries.rs.bak`.
- [x] Record baseline metrics into Appendix A (filled 2026-08-22).
- [x] **Event-contract snapshot mechanism**: `event-snapshot` cargo feature
      implemented in `src/agent/event_snapshot.rs`; taps in
      `AgentEvent::emit_via` (both branches) + `EventBus::bridge_to_tauri`.
      Compiles to an inlined no-op when off. **Baseline fixture pending**:
      local `cargo test` executables abort with STATUS_ENTRYPOINT_NOT_FOUND
      (known environmental DLL issue on the dev box — builds fine, execution
      aborts), so the capture must run on CI or a healthy machine; procedure
      + diff commands in `test/fixtures/README.md`.
- [x] Create/refresh `docs/architecture/exemptions.md`: refreshed against
      measured counts — 27 backend files >700 lines (13 hard-fail), each
      entry expires at its migration phase; 3 stale entries closed.
- [x] CI audit: `.github/workflows/ci.yml` is `workflow_dispatch`-only
      (manual by design, noted in-file). When run it covers: frontend build +
      `npm test` + bundle budget, clippy `--all-targets -D warnings`,
      `cargo test --bin zen`, policy tests (`test:backend`),
      `quality:fast` (includes file-size gate, `$rustLimit = 900`), cargo +
      npm audit. Gaps vs Section 5: no push/PR trigger (intentional),
      `cargo test --workspace` only becomes meaningful after Phase 1,
      separate `cargo check` step intentionally dropped (clippy covers it).
      Additionally this phase fixed pre-existing clippy debt (17 warnings +
      1 deny-level `invalid_regex` error) so the `-D warnings` gate can pass
      at all — commit `6e823db`.

**Extra Phase 0 scope (user-directed)**: frozen pre-migration reference
snapshot committed at `Zen_rs_old/` (4.1 MB, 285 files, from the
`pre-workspace-migration` tag; excluded from codegraph + graphify indexing;
deleted at Phase 14) and temporary migration banners added to RULES.md +
AGENTS.md (always cross-check Zen_rs_old during the migration).

**Verification gates**
- `git describe --tags` returns `pre-workspace-migration`.
- `Test-Path src-tauri/target` is False.
- Appendix A tables filled in.

**Rollback:** nothing to roll back; Phase 0 only adds tags/docs.

**Risk:** Low. Cold rebuild afterwards is expected (~full dep compile).

---

## Phase 1 — Workspace scaffolding (zero behavior change)

**Goal:** src-tauri becomes a Cargo workspace root containing exactly one real
member (itself) plus policy-tests. No source files move yet.

**Prerequisites:** Phase 0 done.

**Tasks**
- [x] Edit `src-tauri/Cargo.toml`: `[workspace]` added with
      `members = [".", "policy-tests"]`, `resolver = "2"`, and the
      `[workspace.dependencies]` table (serde, serde_json, tokio, tokio-util,
      tracing, tracing-subscriber, thiserror, uuid, chrono, sqlx, reqwest,
      futures, async-trait, anyhow). **Deviation:** `crates/*` could not be
      pre-added — this Cargo version rejects member globs matching no package
      directory ("failed to read crates/*/Cargo.toml"); the glob joins in
      Phase 2 when zen-core exists. Versions live in the workspace table;
      per-member feature sets stay at the member (`{ workspace = true,
      features = [...] }`) so policy-tests' narrower tokio/reqwest features
      are preserved exactly (no feature unification).
- [x] Convert matching `[dependencies]` entries to `{ workspace = true }`
      (14 in zen, 5 in policy-tests).
- [x] `[profile.*]` blocks kept verbatim in the root manifest (it was already
      the root-to-be): dev opt-level 0 / incremental false / debug 1;
      dev.package."*" opt-level 1; release z/lto/strip/codegen-units 1.
- [x] (see deviation above — `crates/*` deferred to Phase 2)
- [x] Delete stale `policy-tests/Cargo.lock`, `policy-tests/target/`
      (manifest never declared its own workspace); it builds as a member.
      Root `Cargo.lock` diff: +13 lines (the member entry only — zero
      dependency version churn, R4 feature-unification risk did not
      materialize).
- [x] Lib name `tauri_app_lib`, edition 2021, all features unchanged;
      `crate-type = ["staticlib","cdylib","rlib"]` app-crate-only.
- [x] Tauri build machinery pinned to the composition root: `build.rs`,
      `tauri.conf.json`, `capabilities/`, `gen/`, `resources/` are referenced
      only from the app member (only one package existed to reference them).
- [ ] Sanity-run the app (`npm run tauri dev`): **deferred to the user's
      manual visual gate** — no interactive GUI session in the execution
      environment. Mechanical evidence in lieu: all workspace targets
      compile (check/clippy/test --no-run green), frontend build green.

**Verification gates**
- [x] Gate suite green: `cargo check --workspace --all-targets` ✅,
      `cargo clippy --workspace --all-targets -- -D warnings` ✅,
      `cargo test --workspace --no-run` ✅ (all 4 test targets build),
      `npm run build` ✅. Full `cargo test --workspace` execution is
      blocked locally by the pre-existing STATUS_ENTRYPOINT_NOT_FOUND
      loader issue (identical pre- and post-migration) — CI must confirm.
- [x] `cargo metadata` lists zen + zen-policy-tests as workspace members.
- [x] Exactly one target dir (`src-tauri/target`), one Cargo.lock.
- `cargo tree -p <crate> | tauri` guard: N/A until Phase 2 creates crates/*.

**Rollback:** `git checkout pre-workspace-migration -- src-tauri/Cargo.toml policy-tests`.

**Risk:** Low-Medium. Manifest surgery can surprise (feature unification);
mitigated by identical dep versions and immediate full-gate run.

---

## Phase 2 — Extract `zen-core`

**Goal:** create the leaf crate holding error types, shared domain types, event
payload contracts, and the trait seams everything else will depend on. This
phase DEFINES seams; adoption happens in later phases.

**Prerequisites:** Phase 1.

**Tasks**
- [x] **Pre-task (review finding #2) — extended in execution:** error.rs
      carried not only `Database(#[from] sqlx::Error)` but also
      `Http(#[from] reqwest::Error)` and `Other(#[from] anyhow::Error)`, plus
      an upward `From<agent::swarm::SwarmError>` impl. All split in this
      phase: `zen_core::error::ZenError` is DB/HTTP/tauri-agnostic
      (`Database(String)`, `Http(HttpError)`, `Other(String)`); the app's
      `src/error.rs` re-exports core + owns boundary helpers
      (`db_err`/`http_err`/`other_err`) and the swarm `From` impl.
      `HttpError` carries `{message, status, timeout, connect}` signals
      because the subagent retry classifier (spawn_tools.rs) consumed
      `reqwest::Error` internals (`status()/is_timeout()/is_connect()`) —
      classification behavior is preserved byte-for-byte.
      Conversion sweep: 262 db `.await?` sites (sed + compiler-discriminated;
      6 non-sqlx sites reverted), ~30 llm reqwest sites, 4 terminal anyhow
      sites, 3 `needless_question_mark` lint follow-ups. zen-db (Phase 3)
      takes over the sqlx `#[from]` sugar with its own error type.
- [x] Create `src-tauri/crates/zen-core`. Deps kept BELOW the plan ceiling
      (serde + derive, serde_json, thiserror, async-trait — only what is
      used; tokio/tracing/uuid/chrono join when contents need them; note
      `async-trait` was already consumed at extraction time for the port
      traits).
      NO reqwest, NO sqlx, NO tauri (tree-verified).
- [x] `src/error.rs` → `zen-core/src/error.rs` (post-split); app re-exports
      `pub use zen_core::error::{AppError, AppResult, ZenError, ZenResult};`
      so all 79 error-importing files compile untouched.
- [x] models audit: `models/` holds only `SystemMetrics` (consumed by app
      commands/hardware service AND the future zen-tools sys-metrics tool →
      moved). `ToolInfo` (was tools/mod.rs — single def, llm re-used via
      `crate::tools::ToolInfo`) and `ProviderConfig` (was db/models.rs —
      already a pure wire DTO, zero sqlx derives) moved verbatim; old paths
      re-export. No single-consumer types were moved.
- [x] Ports defined in `zen-core/src/ports.rs`: `EventSink`, `SecretStore`,
      `SettingsStore`, `AuditSink` + `AuditEvent` DTO. Adoption is Phase 6.
- [x] Shared sink bundle defined: `CoreSinks` (Arc'd trait objects) — the
      shape Phase 6 threads as `AgentContext`.
- [x] `publish = false`, literal edition 2021.

**Verification gates**
- [x] `cargo tree -p zen-core` dependency subtree contains no
      tauri/sqlx/reqwest (the initial "1 match" was the `src-tauri` path
      string in the header line — dep lines: 0 matches).
- [x] Gate suite green: `cargo check --workspace --all-targets` ✅,
      `cargo clippy --workspace --all-targets -- -D warnings` ✅,
      `cargo test --workspace --no-run` ✅ (5 test executables, including
      zen-core's own — which RUNS locally: the STATUS_ENTRYPOINT_NOT_FOUND
      issue is specific to tauri-linked test binaries, not cargo test
      itself), `npm run build` ✅, `cargo metadata` members:
      zen, zen-core, zen-policy-tests.

**Rollback:** remove crate + reverts of the two moved files.

**Risk:** Low. Mostly additive; moves are re-exported.

---

## Phase 3 — Extract `zen-db`

**Goal:** all SQLite ownership under one crate. Cleanest first extraction:
RULES.md already forbids SQL outside db/queries.

**Prerequisites:** Phase 2 (zen-core exists).

**Tasks**
- [x] Moved `src/db/**` → `crates/zen-db/src/**` (36 files, 5,458 lines).
      The 959-line `db/mod.rs` was split DURING the move — not carried
      across: `pool.rs` (pool construction + connect policy), `error.rs`
      (crate-local Error + `into_zen()` boundary conversion + `db_err`),
      `migrations/` (runner + 11 step files, one per schema area), and the
      20 `queries/` modules + `models.rs` moved verbatim modulo import
      rewrites (`crate::error::db_err` → `crate::db_err`,
      `crate::db::models::` → `crate::models::`,
      `crate::llm::ReasoningCapability` → `zen_core::ReasoningCapability`).
      App side kept whole via §4.6 shim: `src/db/mod.rs` is now 5 lines
      (`pub use zen_db::{init_pool, models, queries};`) — audited first that
      all 87 app consumers use only those 3 symbols.
- [x] zen-db deps: zen-core, sqlx, tokio, tracing, serde_json + serde/derive,
      uuid, chrono, thiserror (models derive needs). NO tauri, NO reqwest
      (tree-verified — the single `grep tauri` match is the `src-tauri`
      path string in the zen-core path-dep line, same false positive as
      Phase 2).
- [x] Call sites: NOT rewritten — relocation doctrine §4.6 (shim above).
      `crate::db::` paths in the app compile unchanged; shim deleted in
      Phase 14 with the rest.
- [x] Migrations: runner lives in zen-db and stays invoked from app boot
      (via `init_pool` → `run_migrations`); ordering of the 17 step fns +
      the 2 inline post-steps (`init_session_permissions`,
      `migrate_legacy_trace_rows`) preserved; `AGENTS.md` rule 0.2 says
      cross-check `Zen_rs_old/` if ordering is doubted.
- [x] Pagination audit (RULES.md caps): 9 `fetch_all` statements without
      explicit LIMIT — all pre-existing, verbatim-moved: chat-scoped fetches
      (bounded by chat membership), backup/export helpers (must be full
      sets by definition), and bounded lookups (settings keys, usage
      buckets). No new unbounded query introduced by the move.
- [x] **Execution additions (deviations):**
      1. **Reasoning DTOs relocated to zen-core**: db/models.rs derives on
         `ReasoningCapability`, which lived in `src/llm/reasoning/mod.rs`.
         The whole DTO family (ReasoningSupport…ResolvedReasoningRequest)
         is tauri/reqwest-free and moved verbatim to
         `zen-core/src/reasoning.rs`; app module re-exports
         (`pub use zen_core::reasoning::*`) so llm/encoder call sites
         compile untouched.
      2. **WAL fix (pre-existing latent bug found by the moved tests)**:
         `journal_mode=WAL` was a post-connect PRAGMA in the old runner —
         sqlx pooled connections don't keep pragma-set journal mode, so
         FRESH databases silently ran in rollback-journal mode (production
         DBs were converted long ago, masking it). Fixed at the source:
         `.journal_mode(SqliteJournalMode::Wal)` on `SqliteConnectOptions`
         in pool.rs; the pragma block is kept in the runner verbatim for
         the non-WAL pragmas.
      3. **add_message → BEGIN IMMEDIATE**: its deferred `pool.begin()` +
         INSERT was a read→write lock upgrade that bypasses the busy
         handler (SQLITE_BUSY under a concurrent writer). Converted to the
         repo's established explicit-tx pattern (precedent:
         update_message, artifacts). This is what the busy-writer test
         exercises.
      4. **The busy-writer test had never executed before**: local runs
         were blocked by STATUS_ENTRYPOINT_NOT_FOUND (tauri-linked exes)
         and CI runs `--bin zen` only. As a pure crate, zen-db's tests now
         RUN locally — the test failed initially (findings above) and
         passes after both fixes.
      5. gtsm.rs telemetry fns returned `anyhow::Result`; converted to
         `ZenResult` (command layer already stringified via
         `.map_err(|e| ZenError::Internal(e.to_string()))` — rendered
         messages identical).

**Verification gates**
- [x] `cargo test -p zen-db` green: **5/5 passed** (including the previously
      never-executed busy-writer + WAL-mode assertions; 4 were failing
      before the WAL + BEGIN IMMEDIATE fixes — the move surfaced real
      behavior, not test drift).
- [x] Gate suite green: `cargo check --workspace --all-targets` ✅,
      `cargo clippy --workspace --all-targets -- -D warnings` ✅,
      `cargo test --workspace --no-run` ✅ (6 test executables incl.
      zen-db's own), `npm run build` ✅ (frontend untouched by this
      phase), `cargo metadata` members: zen, zen-core, zen-db,
      zen-policy-tests. `cargo tree -p zen-db` tauri/reqwest guard: 0
      real matches (path-string false positive documented). Full
      `cargo test --workspace` execution remains CI-gated by the
      pre-existing local loader issue (unchanged); "app boots and
      reads/writes DB normally" rides on the same CI/manual visual gate.

**Rollback:** git revert phase commit range.

**Risk:** Low. Verified during review: no sqlx macros in use (migrations are
inline SQL at db/mod.rs:96-97), so no offline-mode concerns.

---

## Phase 4 — Extract `zen-security`

**Goal:** permission model, risk levels, audit-event contracts, and privileged-
operation checks live in one auditable crate.

**Prerequisites:** Phases 2–3.

**Tasks**
- [ ] Move policy cores into zen-security:
      - `src/tools/permission.rs` (1,411 lines) → split DURING move:
        `risk.rs` (risk levels/classification), `policy.rs` (rules engine),
        `approval.rs` (decision types).
      - `services/permissions.rs` logic core → `checks.rs`.
      - `services/security.rs` logic core (SecurityService internals that don't
        need AppHandle) → `service.rs`; AppHandle-bound wrapper stays in app.
      - `services/secret_policy.rs` classification rules → `secrets.rs`.
- [ ] zen-security deps: zen-core, zen-db (for persisted decisions), serde,
      tracing, chrono. NO tauri, NO keyring (keyring impl stays in app behind
      `SecretStore`).
- [ ] Route all audit emissions through `AuditSink` port; app provides impl.
- [ ] Move `tools/url_safety` logic into zen-security (`url_safety.rs`) —
      Phase 8's mcp modules consume it from there (review finding #8).
- [ ] Update app call sites mechanically (`crate::tools::permission::X` →
      `zen_security::...`).

**Verification gates**
- Existing permission/security unit tests moved & green: `cargo test -p zen-security`.
- RULES.md privileged-path test quad (allowed/denied/audit/malformed) present
  for moved logic.
- Gate suite green.

**Rollback:** revert commit range.

**Risk:** Medium. Security-critical code; move-only, zero logic edits; diff
review must show pure relocation (use `git log --follow -p` spot checks).

---

## Phase 5 — Extract `zen-tools`

**Goal:** one canonical tool architecture crate: Tool trait, registry,
metadata, tool catalog definitions.

**Prerequisites:** Phases 2–4 (tools depend on security risk/approval types).

**Tasks**
- [ ] **Pre-task A (review finding #1 — blocking): resolve the tools ↔ agent
      circular coupling.** Today `tools/manager.rs:7` imports
      `agent::tools::ToolRegistry` as the V1 registry and `tools/mod.rs:216,271,333`
      store `Arc<dyn agent::tools::AgentTool>`. Before zen-tools can exist:
      move the canonical `AgentTool` trait + V1 registry into `zen-tools`
      (`agent_tool.rs`, `registry.rs`), re-point `src/agent/tools/*` to it via
      shim (§4.6), and delete the parallel-registry duplication (RULES.md
      forbids indefinite v1/v2 registries). No behavior change.
- [ ] **Pre-task B:** inventory and resolve the 8 `AppState` sites under
      `src/tools/**` (§2.1 group a): `image_tool.rs:8`, `sys_metrics.rs:5-6`,
      `terminal_tools.rs:7`, `documents.rs:9`, `mod.rs:16`, `patch.rs:11`,
      `write.rs:13`. Tools needing AppState become app-implemented `Tool`s
      (stay in app); pure tools move.
- [ ] Move remaining `src/tools/**` except `permission.rs` (gone) and any
      stay-behind executors from Pre-task B: manager.rs (928 lines) → split
      into `registry.rs` + `manager.rs` during move.
- [ ] Every tool keeps the RULES.md contract fields (stable id, display
      metadata, input schema, risk level, permission policy, execution impl).
- [ ] zen-tools deps: zen-core, zen-security, serde, serde_json,
      jsonschema (as already used), async-trait, tracing. NO tauri, NO reqwest.
- [ ] Tool executors that need fs/shell/network declare capability traits
      (`FsPort`, `ProcessPort`, `HttpPort`) defined in zen-core; concrete impls
      remain in app until Phase 6 wires them. Registry accepts externally-
      implemented tools so entangled executors can lag behind safely.

**Verification gates**
- `cargo test -p zen-tools` green; tool metadata listing command output
  identical pre/post (snapshot the list in Phase 0 appendix).
- Gate suite green.

**Rollback:** revert commit range.

**Risk:** Medium. Registry is load-bearing for chat+agent paths.

---

## Phase 6 — Seam inversion sweep (kill AppState reach-throughs)

**Goal:** eliminate every upward import from domain code so zen-llm/zen-mcp/
zen-agent become extractable. This is the keystone phase: it converts the 25+
`crate::commands::AppState` / `AppHandle.state::<AppState>()` sites in
`agent/**` and the services imports in `llm/registry.rs` into injected ports.

**Prerequisites:** Phases 2–5 (ports exist in zen-core).

**Tasks**
- [ ] Build an inventory table in this file (Appendix B) listing every upward
      import site from Section 2.1, its replacement strategy, and status.
- [ ] Introduce `AgentContext` (app-crate struct or zen-core struct of trait
      objects): `event_sink: Arc<dyn EventSink>`, `secrets: Arc<dyn SecretStore>`,
      `settings: Arc<dyn SettingsStore>`, `audit: Arc<dyn AuditSink>`,
      plus typed handles for tool service/registry, db pool, workspace root.
      Assembled ONCE in app boot; threaded through runner/orchestrator
      constructors instead of `AppHandle`.
- [ ] Replace each `self.app.try_state::<AppState>()` / `.state::<AppState>()`
      site with context fields. No behavior change per site.
- [ ] `llm/registry.rs`: depend on `SecretStore`/`SettingsStore` traits.
- [ ] Event emission: replace direct `app.emit(...)` inside domain code with
      `EventSink`; app impl bridges to tauri emitter (keeps event names/payloads
      byte-identical — frontend contract untouched).
- [ ] `wait_for_chat_resume` and similar command-layer helpers called by agent:
      move their logic cores into a service reachable via context handle.
- [ ] Add media seams too (review finding #6): ~9 AppHandle/emit sites under
      `services/speech_service|tts_service` get the same treatment — speech/tts
      logic cores take `EventSink` + `ProcessPort`; app wires them. Required
      before Phase 10 can run tauri-free.
- [ ] Construction inversion for MCP (review finding #8): `mcp/env.rs:138-140`
      and `mcp/elicit.rs:278-292` construct concrete SecretService/
      SecurityService/SettingsService — pass trait objects in from app instead.
- [ ] Add rag/search ports for Phase 11 (review finding #5): define
      `VectorStorePort`, `WebSearchPort` in zen-core; agent sites
      (`runner/background.rs:476`, `runner/config.rs:85`,
      `tools/progressive.rs:130,419`) consume the ports; app implements them
      over zen-rag/search.
- [ ] After the sweep, grep guards must come up empty:
      `rg "commands::AppState" src/agent src/llm src/mcp src/tools src/services/speech_service src/services/tts_service`
      and `rg "AppHandle" src/agent` → no matches outside adapter files listed
      as approved exceptions in Appendix B.

**Verification gates**
- Gate suite green; full chat + agent smoke pass (send message, run one tool,
  approve/deny, sub-agent spawn) — manual test script recorded in Appendix C.
- Zero upward-import matches (grep guard above).
- Event payload parity: diff against the Phase 0 event-snapshot fixture
  (`test/fixtures/event-snapshot-baseline.jsonl`).

**Rollback:** revert commit range; seams are additive so partial revert is safe
per-site (each site is an independent commit ideally).

**Risk:** High (touches agent loop plumbing). Mitigate: mechanical 1:1 site
replacements, small commits, no logic edits mixed in.

---

## Phase 7 — Extract `zen-llm`

**Goal:** all provider clients and streaming under one crate; heavy HTTP/SSE
code stops rebuilding on unrelated changes.

**Prerequisites:** Phase 6 (registry uses SecretStore/SettingsStore traits).

**Tasks**
- [ ] Move `src/llm/**` → `crates/zen-llm/src/**`.
- [ ] Split during move (RULES.md hard-fail files):
      - openai_compat/stream.rs (1,474) → `openai_compat/{stream_events.rs,
        stream_accumulator.rs, sse_parse.rs}`
      - anthropic.rs (946) → `anthropic/{client.rs, mapping.rs}` or client+events
      - ollama.rs (759) → `ollama/{client.rs, stream.rs}` if natural split exists.
- [ ] zen-llm deps: zen-core (incl. `ToolInfo`/`ProviderConfig` DTOs per §3.3 —
      no direct zen-tools/zen-db deps), reqwest (native-tls features as today),
      tokio, tokio-tungstenite (if used here), futures, serde_json, tracing,
      tiktoken-rs/tokenizers if token counting lives here today (verify owner).
- [ ] Provider registry keyed off traits; model discovery endpoints unchanged.

**Verification gates**
- Wiremock-based provider tests move into the crate and stay green
  (`cargo test -p zen-llm`).
- Manual streaming smoke against one real provider (record which).
- Gate suite green.

**Rollback:** revert commit range.

**Risk:** Medium. Streaming edge cases; rely on existing wiremock suites.

---

## Phase 8 — Extract `zen-mcp`

**Goal:** MCP client/config/consent/discovery logic isolated behind security
checks that already live in zen-security.

**Prerequisites:** Phases 4, 7.

**Tasks**
- [ ] Move `src/mcp/**` logic cores + `services/mcp_config.rs` (761 → split:
      config parsing vs persistence), `mcp_consent.rs`, `mcp_discovery.rs`,
      `mcp_adapter.rs` cores.
- [ ] zen-mcp deps: zen-core, zen-security (incl. url_safety from Phase 4),
      zen-tools (`ToolRegistry`/`ToolAnnotations` consumed at mcp/mod.rs:22-23,124-126
      and tool_schema.rs:113-166), reqwest/jsonschema as used, tokio,
      tracing. NO tauri. Local HTTP server bits that bind localhost stay in app
      unless cleanly separable (RULES.md: bind localhost default).
- [ ] Consent/approval flows call zen-security approval types; elicitation
      events go through EventSink.

**Verification gates**
- MCP unit tests green in-crate; connect to at least one stdio server manually.
- Gate suite green.

**Rollback:** revert commit range.

**Risk:** Medium. OAuth/token flows must keep Security.md constraints intact.

---

## Phase 9 — Extract `zen-rag`

**Goal:** vector stores, embeddings, document ingestion pipeline isolated;
lancedb+arrow stop recompiling with everything else.

**Prerequisites:** Phases 2 AND 3 (required — review finding #7:
`rag/hybrid_backend.rs:21` imports `crate::db::queries`, so zen-rag depends on
zen-db).

**Tasks**
- [ ] Move `src/rag/**` → zen-rag: lancedb_store, conversation_store,
      embedding providers, VectorStore trait.
- [ ] Decide ingestion home: document parsing stack currently spans services
      (attachment/document). Move *pure parsing/extraction* libs usage
      (calamine, zip, infer, text-splitter, pdf-inspector, scraper/spider if
      crawl-fed) into zen-rag `ingest/`; keep attachment orchestration in app.
- [ ] zen-rag deps: zen-core, zen-db (hybrid_backend uses db queries),
      lancedb, arrow-*, text-splitter (+tiktoken feature),
      calamine, quick-xml, zip, infer, scraper/spider as actually used,
      reqwest, tokio, zen-core. NO tauri.

**Verification gates**
- Ingest a test document end-to-end; query returns vectors (manual script).
- `cargo test -p zen-rag`; gate suite green.

**Rollback:** revert commit range.

**Risk:** Medium-Low. Mostly self-contained today.

---

## Phase 10 — Extract `zen-media`

**Goal:** audio/VAD/TTS/whisper-model runtime isolated; candle cluster gets a
stable home and stops inflating unrelated rebuilds.

**Prerequisites:** Phase 2 AND Phase 6 media-seam completion (review finding
#6: speech/tts cores carry ~9 AppHandle sites; they must consume EventSink/
ProcessPort before the crate can be tauri-free).

**Tasks**
- [ ] Move `services/speech_service/` (702 → split mod), `tts_service/`, voice/
      audio stacks, whisper/candle runtime wrappers → zen-media.
- [ ] Process management dependency (`process_manager`) becomes a port
      (`ProcessPort`) implemented by app.
- [ ] zen-media deps: candle-core/transformers/nn, tokenizers, rodio, cpal,
      hound, webrtc-vad, image (if used here), sysinfo? (verify), zen-core.
- [ ] Hardware detection handoff stays orchestrated by app (hardware service
      passes info in constructors as today's `with_process_manager` pattern).

**Verification gates**
- Transcribe + speak smoke tests (manual script); device listing commands OK.
- Gate suite green.

**Rollback:** revert commit range.

**Risk:** Low-Medium. Feature-gated native deps; Windows-first validation.

---

## Phase 11 — Extract `zen-agent`

**Goal:** the crown jewels — runner loop, orchestrator, deep research, swarm,
middleware, skills — in their own crate, fully UI-agnostic.

**Prerequisites:** Phase 6 MUST be 100% complete (zero AppState reach-throughs),
Phases 5,7,8 done (agent depends on tools/llm/mcp crates).

**Tasks**
- [ ] Move `src/agent/**` → `crates/zen-agent/src/**` preserving submodule
      layout (agents/, deep_research/, middleware/, orchestrator/, runner/,
      skills/, swarm/, tools/).
- [ ] Split hard-fail files DURING the move (do not carry them across):
      - tools/spawn_tools.rs (1,593) → spawn/{registry.rs, handlers.rs}
      - deep_research/phases.rs (1,421) → deep_research/phases/{mod.rs, phase_*.rs}
      - runner/loop.rs (1,337) → runner/{turn_loop.rs, step_exec.rs}
      - runner/helpers.rs (1,188) → runner/support/{...} by topic
      - runner/tool_dispatch.rs (1,186) → runner/dispatch/{router.rs, executors.rs}
      - runner/escalation.rs (1,052) → runner/escalation/{policy.rs, flow.rs}
      - tools/fs_tools.rs (787) → fs/{read_tools.rs, write_tools.rs}
      - event_bus.rs (775): port type → zen-core (already defined), bus impl →
        zen-agent or app bridge per ownership decision in Phase 6.
      - router.rs (715), context_breakdown.rs (710), voice_display.rs (733):
        split or justify exemption entries.
- [ ] zen-agent deps: zen-{core,tools,llm,mcp,security,db}, tokio, futures,
      serde_json, tracing, async-recursion. NO tauri, NO reqwest (LLM I/O goes
      through zen-llm types). rag/search/media access flows through the
      Phase 6 ports (`VectorStorePort`, `WebSearchPort`, `ProcessPort`) —
      not direct crate deps.
- [ ] Sub-agent spawning uses context handles only.
- [ ] Update `tests/agentic_test.rs` imports; keep it in app crate (it drives
      the composed system).

**Verification gates**
- Full agentic integration test (`cargo test --test agentic_test`) green.
- Manual E2E script (Appendix C) fully passing including approvals and
  sub-agents.
- `cargo tree -p zen-agent` shows no tauri/reqwest.
- Gate suite green.

**Rollback:** revert commit range. Highest-risk phase; schedule dedicated
session(s); do not rush.

**Risk:** High. Largest module (27K lines). Mitigation: phases 5–10 already
moved its dependencies; the move itself is mechanical once seams hold.

---

## Phase 12 — App-crate file-size debt sweep

**Goal:** everything remaining in the app crate respects RULES.md limits.

**Prerequisites:** Phases 3–11 complete (most offenders already relocated/split).

**Tasks**
- [ ] Remaining known offenders (verify against current tree):
      - commands/chat/send.rs (843) → split validation vs orchestration vs
        response mapping.
      - canvas/session.rs (828) → session state vs command application.
- [ ] lib.rs (666): extract command registration groups into per-domain
      `commands/mod.rs` builder fns; boot logic into `boot.rs` (keep run() thin).
- [ ] Re-scan: any file >700 needs exemption entry or split; >900 must be split
      or carry documented exemption with expiration.
- [ ] services/tool.rs (1,321, stays as composition shell) → thin facade over
      zen-tools/zen-security; split approval execution vs lookup.

**Verification gates**
- File-size check script green; exemptions.md accurate and minimal.
- Gate suite green.

**Risk:** Low.

---

## Phase 13 — CI, test & lint hardening

**Goal:** the workspace's boundaries stay enforced automatically.

**Tasks**
- [ ] Per-crate test jobs in CI with path filters (changed-crates detection
      like codex-rs: docs/codegen only rebuild affected crates).
- [ ] Add boundary guards to CI:
      - grep gate: `tauri` must not appear in any crates/*/Cargo.toml
      - `cargo deny`/audit config unified at workspace root (.cargo/audit.toml)
- [ ] Clippy: workspace-level `-D warnings`; consider crate-level lint caps
      mirroring codex-rs style rules where cheap.
- [ ] Coverage ratchet for zen-security + zen-tools (privileged code) per
      RULES.md testing gates.
- [ ] Optional: adopt cargo-nextest for speed; insta snapshot tests for any
      future TUI-visible/CLI output if introduced.
- [ ] Nightly full-matrix job (all crates, all targets) mirroring fast-PR path.

**Verification gates**
- CI green including new guard jobs; intentionally-break experiment (add tauri
  dep to zen-core on a branch) is caught by CI.

**Risk:** Low.

---

## Phase 14 — Governance, docs & closure

**Goal:** make the new structure the documented law of the land.

**Tasks**
- [ ] Update RULES.md: Target Layering section gains the workspace/crate map;
      add "resist adding code to zen-app" guidance; dependency direction now
      cites compiler enforcement.
- [ ] Update AGENTS.md / CLAUDE.md pointers and docs/architecture/* for:
      tool architecture ownership (zen-tools), security policy location
      (zen-security), streaming behavior (zen-llm), DB rules (zen-db paths).
- [ ] Close out docs/architecture/exemptions.md entries resolved by phases;
      every surviving exemption has owner + expiration.
- [ ] Refresh Appendix A metrics post-migration (cold/warm build, clippy count,
      test inventory) and record before/after deltas in this file.
- [ ] Tag `migration/complete`. Delete stale tags after 30 days if stable.
- [ ] Retire this document into docs/architecture/history/ (keep as record).

**Verification gates**
- All prior phase gates re-run once end-to-end on a clean machine/CI runner.
- Docs review pass: no doc references stale paths (grep old module paths).

**Risk:** Low.

---

## 7. Risk register

| # | Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | Hidden circular deps surface mid-extraction | 4–11 | High | Medium | Traits live in zen-core first; extraction blocked until seams compile |
| R2 | Agent loop regressions from context plumbing | 6, 11 | Medium | High | Mechanical 1:1 replacements; Appendix C manual E2E each phase; small commits |
| R3 | Cold-build time hurts iteration during migration | 0–11 | Certain | Low | Accept one-time cost; warm builds still improve vs today |
| R4 | Feature unification changes compiled deps | 1 | Low | Medium | Identical versions via workspace.dependencies; audit lock diff |
| R5 | Event payload drift breaks frontend contract | 6 | Medium | High | Byte-identical payloads required; capture/diff event names+shapes pre/post |
| R6 | Security behavior drift in permission move | 4 | Low | Critical | Move-only diffs; quad tests (allowed/denied/audit/malformed) mandatory |
| R7 | policy-tests consolidation breaks its flow | 1 | Low | Low | Keep it building standalone-capable until member build verified |
| R8 | sqlx macro churn when db moves | 3 | — | — | CLOSED by review: no sqlx macros in tree; migrations inline (db/mod.rs:96-97). Retained as record. |
| R9 | Oversized-file splits introduce subtle bugs | 7–12 | Medium | Medium | Splits are cut-only (no edits); module tests must exist before split |
| R10 | Migration fatigue → half-done state lingers | all | Medium | High | One-phase-per-session rule; tag discipline; no resting state between phases |

## 8. Definition of Done (whole migration)

1. `crates/*` contains 9 crates; none depend on tauri (CI-enforced).
2. Zero `crate::commands::AppState` references outside app crate (grep-gated).
3. No file >900 lines anywhere in src-tauri without a current exemption entry.
4. Gate suite green on `--workspace --all-targets` in CI, plus frontend build.
5. Manual E2E script (Appendix C) passes fully.
6. RULES.md/docs updated; exemptions ledger current; `migration/complete` tagged.

## 9. Out of scope

- Frontend (`src/`) refactors, design tokens, motion system — untouched.
- New product features during migration window (RULES.md: don't skip phases
  to ship features).
- Multi-surface expansion (TUI/SDK/etc.) — the workspace enables it later;
  nothing here builds those surfaces.
- Bazel/hermetic builds, cross-platform sandbox backends — future work,
  enabled by crate boundaries but not part of this plan.

## Appendix A — Baseline metrics (measured 2026-08-22, Phase 0)

Dev box: Windows 11 x64, MSVC toolchain 1.97.1 (rust-toolchain.toml),
single-crate pre-migration tree at commits `0a89f6b`→`842b93b`.

| Metric | Value (pre) | Value (post P14) |
|---|---|---|
| cold `cargo check --all-targets` | **7m 36s** (after deleting the stale 40 GB target) | TBD |
| warm no-op `cargo check --all-targets` | **1m 20s** (1m 40s against the old 40 GB target) | TBD |
| clippy warning count | 17 unique warnings + 1 deny-level `invalid_regex` error **before** cleanup; **0** after `6e823db` (`clippy --all-targets -- -D warnings` green) | TBD |
| test suites / counts | rust: zen lib tests, zen bin tests, `tests/agentic_test.rs` (5 fns), standalone `policy-tests` lib; node: 191 `test/verify-*.mjs` suites via `npm test`. **Local rust test-binary execution is blocked** (STATUS_ENTRYPOINT_NOT_FOUND at exe load — environmental; builds succeed). Rust test pass/fail must come from CI. | TBD |
| `npm run build` duration | **56s** wall (tsc + vite; vite segment 23.4s) | TBD |
| emitted backend event names+payload shapes snapshot | Mechanism implemented (`event-snapshot` feature, commit `842b93b`); baseline JSONL **pending capture on CI/healthy machine** — local test exes abort (see above). Procedure: `test/fixtures/README.md` | TBD |

Note: the Phase 0 gate "`Test-Path src-tauri/target` is False" refers to the
stale 40 GB artifact, which was deleted (disk reclaimed). The cold-measurement
build legitimately recreated a fresh target afterwards.

## Appendix B — Upward-import replacement ledger (fill in Phase 6)

Transcribe ALL sites from §2.1 groups (a)/(b)/(c) here at Phase 6 start,
including the 8 `tools/**` sites and `routing_tools.rs:108`. Columns:

| Site (file:line) | Category (a/b/c) | Replacement (ctx field / port / service handle) | Status |
|---|---|---|---|
| agent/clarification.rs:8 | a | ctx.settings/ctx.tools | ☐ |
| ... full §2.1 transcription at Phase 6 start ... | | | ☐ |

Approved adapter exceptions (files that legitimately keep AppHandle because
they ARE adapters) must be listed explicitly below before the grep guard is
considered passing:

| File | Reason it keeps AppHandle |
|---|---|
| TBD at Phase 6 start | |

## Appendix D — Critic review record

2026-08-22: Independent subagent review verdict **APPROVE-WITH-FIXES**.
Blocking fixes applied in revision 2 of this document:
- #1 tools↔agent circular registry coupling → Phase 5 Pre-task A
- #2 error.rs/sqlx vs zen-core dependency ban → Phase 2 pre-task split
- #3 missing `src/tools/**` AppState inventory → added to §2.1(a) + Phase 5 Pre-task B
- #4/#5/#7/#8 cross-crate edges → §3.3/§3.4 tables; deps corrected in Phases 7-9; Phase 9 requires Phase 3
- #6 media seams → Phase 6 task + Phase 10 prerequisite strengthened
- #12/#13 diagram + relocation doctrine → §3.1 redrawn; §4.6 shim doctrine
- #9/#10/#11/#14 stale numbers refreshed; event-snapshot mechanism specified (Phase 0);
  Tauri build pinning + mobile lib notes added (Phase 1); R8 closed; canvas stays in app.

## Appendix C — Manual E2E verification script

1. Launch app; splash→workspace handoff completes.
2. Create chat; send message; streamed reply renders (event parity check).
3. Trigger a filesystem tool; approve; verify collapsed summary row (frontend
   contract unchanged); deny-path also exercised.
4. Spawn sub-agent task; delegation summary appears; cancel works.
5. MCP: connect one server; run one MCP tool through approval.
6. Terminal: spawn, write, resize, kill.
7. Voice: transcribe sample; speak text; stop.
8. Canvas: create graph session; apply action; rollback.
9. Restart app: chats/settings/secrets persist (db + keyring intact).

---

*End of plan. Execute phases strictly in order; never stack unfinished phases.*
