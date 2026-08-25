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
consuming it via re-export), a `ProviderConfig` **DTO** (single definition at
`zen-core/src/types.rs:24`; the persistence model stays in zen-db and
re-exports it — `zen-db/src/models.rs:451` — so app converts at the boundary),
event payloads, and risk/approval enums consumed by UI-facing types. Rule of
thumb: if two crates would need it, it belongs in core; persistence shapes
stay in db.

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
   compiling unchanged. Shims are deleted in Phase 14 in one sweep. That
   sweep must also collapse **multi-hop** shim chains — e.g.
   `llm/registry.rs:6` → `crate::db::models` → app `db/mod.rs` re-export →
   `zen-db/src/models.rs:451` → `zen_core::ProviderConfig` — rewriting each
   consumer to its deliberate final path, not just stripping the first hop.
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
- [x] `src/tools/permission.rs` (1,551 lines) split DURING the move into
      `crates/zen-security/src/`: `risk.rs` (RiskLevel, 29L), `approval.rs`
      (PermissionDecision/PermissionContext + build_context + argument
      redaction, 152L), `policy.rs` (6-layer rules engine, user pattern
      rules, RegexCache, hardcoded security rules, secure plan-mode path
      check, + both inline security-regression suites, 1,393L). Anchor-
      sliced from source by script — git rename detection confirms.
      `PermissionDecision::from_input` impl lives in policy.rs (rules
      engine) for its home type in approval.rs, same crate.
- [x] `src/services/permissions.rs` → `checks.rs` (tool allowlist, verbatim,
      117L incl. 5 tests).
- [x] `src/services/security.rs` → `service.rs` (255L): SecurityService +
      PrivilegedOperation/PermissionRequest/AuditEvent + its own
      Allow/Ask/Deny PermissionDecision and RiskLevel, verbatim modulo
      `crate::db::` → `zen_db::` (2 code + 2 test sites). Nothing in the
      file needed AppHandle — the whole service moved; no app wrapper
      required. The name-collision risk (two PermissionDecision / two
      RiskLevel flavors) is handled at the crate root: service items have
      NO root re-export, consumers spell `zen_security::service::…` —
      mirroring the old `services::security` vs `tools::permission` split.
- [x] `src/services/secret_policy.rs` → `secrets.rs` (verbatim, 23L).
- [x] `src/tools/url_safety.rs` → `url_safety.rs` (verbatim, 348L incl.
      the IPv6-mapped-IPv4 SSRF suite). Deps grow accordingly: url, tokio
      (net), reqwest (native-tls pinned-client builders) — allowed; only
      tauri/keyring are forbidden.
- [x] zen-security deps: zen-core, zen-db, serde(+derive), serde_json,
      tracing, chrono, uuid, sqlx, regex, url, reqwest, tokio.
      NO tauri, NO keyring (tree-verified: 0 real matches).
- [x] Audit routing: SecurityService remains the single privileged-path
      audit funnel (RULES.md rule 6 — "all privileged operations must pass
      through SecurityService"); it now lives in zen-security and writes
      audit rows via zen-db. App-side `services/audit_sink.rs` provides
      the `zen_core::ports::AuditSink` impl the plan asked for: persists
      port-shaped records into the SAME audit table (lossless field
      mapping, `caller` = `port`), so Phase 6 `CoreSinks` adoption lands
      rows identical in shape to service emissions. Port impl has
      allowed+deny persistence test (app-lib test binary — runs on CI;
      loader-blocked locally like all app unit tests).
- [x] App call sites: NOT rewritten — six §4.6 shims
      (`tools/{permission,url_safety,patch_parser}.rs`,
      `services/{security,permissions,secret_policy}.rs`) re-export the
      moved symbols so every call site compiles unchanged; shims die in
      Phase 14.
- [x] **Execution additions (deviations):**
      1. **`tools/patch_parser.rs` moved too** (210L, verbatim): the
         plan-mode write gate parses apply_patch hunks with it, so
         zen-security needs it in-crate (an app seam would split the
         security boundary in two). App re-exports from the old path;
         fs_tools/patch.rs, services/tool.rs, agent/runner/helpers.rs
         compile unchanged.
      2. **policy-tests de-mirrored**: the #[path]/include! mirrors for
         permission/secret_policy/url_safety/patch_parser are replaced by
         module aliases over the real crate (`pub use zen_security::policy
         as permission;` …) — tests now exercise the shipped code,
         compiled once. runtime_resource + the mcp trio stay mirrored
         until their phases. 33/33 green.
      3. `pub(crate)` visibility widened to `pub` for build_context,
         extract_file_target, is_within_plans_root (app boundary shim
         needs them across the crate edge); doc notes updated. policy.rs
         re-exports PermissionDecision/RiskLevel so the merged-module
         import surface (`tools::permission::X`) keeps resolving.

**Verification gates**
- [x] `cargo test -p zen-security` green: **53/53** (mode×risk matrix 18,
      layer precedence + plan-mode path attacks + regex cache, allowlist 5,
      SecurityService evaluate/audit-persist 2, URL SSRF suite 10) — runs
      locally (pure crate). `cargo test -p zen-policy-tests`: **33/33**.
- [x] RULES.md privileged-path quad for moved logic: allowed/denied
      (matrix + layer tests), audit (record_audit persistence test moved
      with service.rs; + ZenAuditSink allow/deny test), malformed
      (regex_cache_invalid_pattern: invalid user patterns fail closed to
      no-match; url_safety rejects malformed scheme/host).
- [x] Gate suite green: `cargo check --workspace --all-targets` ✅,
      `cargo clippy --workspace --all-targets -- -D warnings` ✅,
      `cargo test --workspace --no-run` ✅ (**7** executables, +
      zen-security), `npm run build` ✅, `cargo tree -p zen-security`
      tauri/keyring guard: 0 real matches (path-string false positives
      only). App unit tests remain CI-gated by the local loader issue
      (unchanged).

**Rollback:** revert commit range.

**Risk:** Medium. Security-critical code; move-only, zero logic edits; diff
review must show pure relocation (use `git log --follow -p` spot checks).

---

## Phase 5 — Extract `zen-tools`

**Goal:** one canonical tool architecture crate: Tool trait, registry,
metadata, tool catalog definitions.

**Prerequisites:** Phases 2–4 (tools depend on security risk/approval types).

**Tasks** (all complete, 2026-08-23)
- [x] **Pre-task A — resolve the tools <-> agent circular coupling.**
      The canonical `AgentTool` trait and the V1 registry moved to
      zen-tools (`agent_tool.rs`, `registry.rs::AgentToolRegistry`);
      `src/agent/tools/mod.rs` is now a §4.6 alias shim
      (`type ToolRegistry = zen_tools::AgentToolRegistry<tauri::AppHandle>`)
      plus the `ProgressiveToolSource` bridge implementing the new
      `LazyToolSource` port (non-blocking reads, matching the old
      `try_read` behavior). The V2 catalog registry
      (`registry.rs::ToolRegistry`) lives in the same crate: one
      canonical architecture, no parallel in-tree registries
      (RULES.md parallel-registry ban satisfied). Deviation from the
      plan text: traits are host-generic (`AgentTool<A>`, `Tool<A>`)
      instead of moving unchanged, because §3.1 hard rule 1 forbids
      tauri in crates/. Trait aliases are not stable, so impl headers
      and `dyn` positions across ~30 executor files were mechanically
      rewritten to `zen_tools::{Tool,AgentTool}<tauri::AppHandle>`;
      all other positions compile through the alias shims unchanged.
- [x] **Pre-task B — AppState sites.** Re-inventoried (plan list was
      stale: documents.rs/patch.rs/write.rs live under tools/fs_tools/):
      sys_metrics.rs, terminal_tools.rs, image_tool.rs, web_fetch.rs,
      fs_tools/{documents,patch,write,mod}.rs reach AppState via
      AppHandle. All stay in the app crate as externally-registered
      executors (plan-sanctioned: "entangled executors lag behind").
      calculator.rs (pure) moved; capability.rs/manager.rs are logic,
      not executors, and moved.
- [x] **manager.rs (1,010) split** into zen-tools `registry.rs`
      (contracts + both registries, ~640 lines) + `manager.rs`
      (discovery manager + tests, ~1,180 lines). The V2 registry's
      dead `execute_authorized`/`execute_with_permission` methods were
      deleted during the move: zero callers (execution flows through
      ToolService's approval-gated path) and they were the registry's
      only tauri coupling.
- [x] Every tool keeps the RULES.md contract fields (id/name,
      description, schema, risk, permission policy via
      `check_permission`, execution impl) — moved verbatim.
- [x] zen-tools deps: zen-core, zen-security, serde(+derive),
      serde_json, async-trait, anyhow, tokio(sync), tokio-util, chrono,
      jsonschema 0.42 (relocated pin, not a new dependency). NO tauri,
      NO reqwest — verified via `cargo tree` word-boundary grep.
- [x] Capability-traits (`FsPort`/`ProcessPort`/`HttpPort`) deferred:
      the plan's own fallback ("registry accepts
      externally-implemented tools so entangled executors can lag
      behind") covers all AppState executors; Phase 6's seam inversion
      will introduce the ports they actually need. `LazyToolSource`
      (new port, this phase) inverts the registry->progressive
      coupling that blocked extraction.

**Verification gates** (all green, 2026-08-23)
- [x] `cargo test -p zen-tools`: 30/30 (stub-based: TestHost binding,
      production-mirroring fixtures). Three manager tests were
      latent-red in the app (never ran locally: loader bug; manual CI):
      the fixture never ran the production startup legacy-sync, and the
      ext-tool tests used the retired `register_external` flow instead
      of adapter registration. Fixed by mirroring production wiring in
      the fixture; zero behavior change to shipped code.
- [x] Tool metadata listing parity: the moved listing logic is
      verbatim (same filters, same catalog, same ordering); the
      listing snapshot fixture from Phase 0 remains pending (needs a
      CI/healthy machine to run the app), noted in Appendix A.
- [x] Gate suite: `cargo check --workspace --all-targets` 0 errors;
      `cargo clippy --workspace --all-targets -- -D warnings` green
      (one local `type AgentToolObj` alias added in progressive.rs to
      stay under clippy::type_complexity after the dyn-path rewrite);
      `cargo test --workspace --no-run` builds all 8 test executables;
      zen-tools 30/30 + zen-security 53/53 + zen-db 5/5 +
      policy-tests 33/33 run locally; `npm run build` green (14.0s);
      `cargo tree -p zen-tools` shows no tauri/keyring (path-string
      false positives excluded).

**Rollback:** revert commit range.

**Risk:** Medium. Registry is load-bearing for chat+agent paths.

**Result:** PASSED — phase complete, tagged migration/phase-05-done.

---

## Phase 6 — Seam inversion sweep (kill AppState reach-throughs)

**Goal:** eliminate upward imports from the agent-core domain code so
zen-llm/zen-mcp/zen-agent become extractable. This is the keystone phase: it
converts `crate::commands::AppState` / `AppHandle.state::<AppState>()` reach-
throughs into injected ports and context handles.

> ### ⚠️ Formal re-scope (2026-08-23, after execution recon)
>
> Execution recon surfaced three facts that reshape this phase:
> (1) tauri-linked test binaries cannot run on the dev box (loader bug,
> exit 127) so the event-parity gate is unavailable here — identical at
> Phase 11, so waiting does not reduce risk; (2) tool executors receive
> `AppHandle` through the frozen `AgentTool`/`Tool` trait contracts and were
> sanctioned to stay app-side in Phase 5; (3) zen-core's `SecretStore`/
> `SettingsStore` ports were specified sync but real services are async — a
> port redesign, not a relocation.
>
> **Re-scoped definition of done — full sweep of the AGENT CORE only:**
> runner/, orchestrator/, deep_research/, middleware/, skills/ convert every
> `AppState` read to context handles and their emits through `EventSink`
> (byte-identical). **Approved adapter exceptions** (record each in Appendix B):
> `src/tools/**` executors and `src/agent/tools/*` executors keep `AppHandle`
> until Phase 11 moves them behind trait-signature changes. **Moved out of
> Phase 6:** `llm/registry.rs` port adoption → Phase 7 (its forcing function);
> media seams → Phase 10; MCP construction inversion → Phase 8;
> `VectorStorePort`/`WebSearchPort` → may defer to Phase 11 (sites are still
> in-crate until then; record the decision either way).
>
> Rationale: deferring the core sweep would turn Phase 11 into a mega-phase
> (largest extraction + ~100-site live-loop rewrite + hard-fail splits at
> once). The work happens now, in small green batches, under dedicated
> rollback discipline. Never stack phases (AGENTS.md rule 0.2).

**Prerequisites:** Phases 2–5. Note (Phase 5 review correction): the
`FsPort`/`ProcessPort`/`HttpPort` capability traits were **deferred** during
Phase 5 via its sanctioned external-registration fallback — zen-core currently
holds only EventSink/SecretStore/SettingsStore/AuditSink (+ `LazyToolSource`
in zen-tools). Phase 6 must therefore define any additional ports it actually
needs rather than assuming they pre-exist. **Carried debt:** Phase 5's
`crates/zen-tools/src/manager.rs` landed at ~1,145 lines — above the >900
RULES.md hard-fail. Shrink it (move its 11 tests to `tests/`, or extract the
discovery core) as part of Phase 6, or file an exemptions.md entry with an
expiration before starting Phase 6. *(Status: DONE — commit `91d635c`,
1,145→818 lines, tests 30/30.)*

**Tasks**
- [x] Land async port redesign first: make `SecretStore`/`SettingsStore`
      `#[async_trait]` in zen-core (real services are async; sync ports would
      force blocking calls in the hot path = behavior change). Adoption
      surface is near-zero today — cheapest it will ever be.
- [x] Build an inventory table in this file (Appendix B) listing every upward
      import site from Section 2.1, its replacement strategy, and status.
- [x] Introduce `AgentContext` (app-crate struct or zen-core struct of trait
      objects): `event_sink: Arc<dyn EventSink>`, `secrets: Arc<dyn SecretStore>`,
      `settings: Arc<dyn SettingsStore>`, `audit: Arc<dyn AuditSink>`,
      plus typed handles for tool service/registry, db pool, workspace root.
      Assembled ONCE in app boot; threaded through runner/orchestrator
      constructors instead of `AppHandle`.
      *(Landed as `src/services/agent_context.rs`; managed alongside AppState
      in lib.rs setup; shares every Arc instance with AppState.)*
- [x] Replace each `self.app.try_state::<AppState>()` / `.state::<AppState>()`
      site in the AGENT CORE (runner, orchestrator, deep_research, middleware,
      skills) with context fields. No behavior change per site.
      *(22 direct sites converted; grep guard clean.)*
- [x] Event emission: replace direct `app.emit(...)` inside agent-core code
      with `EventSink`; app impl (`TauriEventSink`) bridges byte-identically —
      frontend contract untouched.
      *(13 raw sites converted: escalation.rs stream-reset, voice_display
      spawn/complete, deep_research mod.rs ×3 + phases.rs ×5, clarification.*
- [x] `wait_for_chat_resume` and similar command-layer helpers called by agent:
      move their logic cores into a service reachable via context handle.
      *(Core loop extracted verbatim to `ChatPauseControl::wait_while_paused`;
      AgentContext method delegates. Legacy commands wrapper remains for
      out-of-scope callers.)*
- [x] Carried debt from Phase 5: shrink `crates/zen-tools/src/manager.rs`
      below 900 lines (commit `91d635c`).
- ~~Media seams (review finding #6):~~ **moved to Phase 10** per re-scope.
- ~~MCP construction inversion (review finding #8):~~ **moved to Phase 8**
  per re-scope.
- [x] Record tool-executor exception list in Appendix B (files keeping
      `AppHandle` until Phase 11): `src/tools/**` executors +
      `src/agent/tools/*` executors.
- [x] Decide + record: `VectorStorePort`/`WebSearchPort` now or in Phase 11
      (sites still in-crate either way).
      *(Decision: defer to Phase 11 — rag/search types stay in-crate until
      then; no port needed while both sides share a crate.)*
- [x] After the sweep, grep guards (re-scoped) must come up empty:
      `rg "commands::AppState" src-tauri/src/agent --glob "!tools/**"`
      → no matches outside Appendix-B exceptions;
      raw `app.emit(` in converted agent-core files → zero (all through sink).

**Verification gates**
- Gate suite green; full chat + agent smoke pass (send message, run one tool,
  approve/deny, sub-agent spawn) — manual test script recorded in Appendix C.
  *(Re-scope note: the event-snapshot parity gate cannot run on the dev box —
  tauri test exes exit 127. Safety net is byte-identical-by-construction
  transforms + compiler + clippy per batch. Capture the fixture via CI at
  first opportunity and diff retroactively before Phase 11.)*
- Re-scoped grep guards pass: zero `commands::AppState` in agent core outside
  Appendix-B exceptions.
- Event payload parity: diff against the Phase 0 event-snapshot fixture when
  CI capture lands (`test/fixtures/event-snapshot-baseline.jsonl`); until then,
  rely on construction-time identity (sink wraps the same `app.emit` call).

**Rollback:** revert commit range; seams are additive so partial revert is safe
per-site (each site is an independent commit ideally).

**Risk:** High (touches agent loop plumbing). Mitigate: mechanical 1:1 site
replacements, small commits, no logic edits mixed in.

---

## Phase 7 — Extract `zen-llm`

**Goal:** all provider clients and streaming under one crate; heavy HTTP/SSE
code stops rebuilding on unrelated changes.

**Prerequisites:** Phase 6 agent-core sweep complete (re-scoped). This phase
now also owns the `llm/registry.rs` port adoption (moved from Phase 6 per the
2026-08-23 re-scope): convert `registry.rs` to the now-async
`SecretStore`/`SettingsStore` traits as part of the move.

**Tasks**
- [x] Move `src/llm/**` → `crates/zen-llm/src/**`. (App keeps a pure
      re-export shim at `src/llm/mod.rs`; 32 non-`use` consumer reference
      lines across 18 files compile unchanged. Deleted in Phase 14 sweep.)
- [x] Split during move (RULES.md hard-fail files; physical line counts):
      - openai_compat/stream.rs → `stream.rs`(699) + `stream_events.rs`(108,
        reasoning emitters) + `capabilities.rs`(136, embed/health/tools/
        reasoning surface) + `stream_tests.rs`(719, wiremock suite via
        `#[path]`, P5 manager-tests precedent)
      - anthropic.rs → `anthropic/{mod.rs(client+delegates),
        wire.rs(serde types), chat.rs(list_models/chat_stream bodies as free
        fns over `&AnthropicProvider`), mapping.rs(model-id heuristics)}`
      - ollama.rs → `ollama/{mod.rs(739), wire.rs(125)}`. Warn-zone residue:
        ollama/mod.rs 739, stream_tests 719 — exemption entries added to
        docs/architecture/exemptions.md (P12 debt sweep).
- [x] zen-llm deps: zen-core only upward dep (`ToolInfo`/`ProviderConfig`
      per §3.3; chat-wire DTOs ChatMessage/ChatResponse/ModelInfo/
      ReasoningBlock/ToolCall moved to new `zen-core::chat_types`, re-exported
      by zen-db — ProviderConfig precedent). reqwest(native-tls,json,stream),
      tokio, tokio-util, futures, serde_json, tracing, dashmap/lazy_static/
      regex/base64 (pins matched to app crate; relocated usage). No tokenizers
      here (verified). New `util::http_err` twins app `error::http_err`
      (zen-core stays reqwest-free).
- [x] Provider registry keyed off traits: `ProviderRegistry` now holds
      `Arc<dyn SettingsStore>` / `Arc<dyn SecretStore>` (zen-core async ports)
      instead of concrete services; app impls live in new
      `src/services/store_ports.rs` so `AppState` passes existing Arcs with
      zero ctor-site churn (coercion at commands/mod.rs call site).

**Verification gates**
- Wiremock-based provider tests move into the crate and stay green
  (`cargo test -p zen-llm`: 82 passed). NOTE: this was their first-ever
  execution under any gate (no CI workflow runs cargo test yet — P13); three
  latent pre-existing failures surfaced and were fixed forward — see
  Appendix C. Manual streaming smoke against one real provider: pending
  user-side check before release cut (recorded, non-blocking).
- Gate suite green (check / clippy -D warnings / crate tests / npm build;
  guards: 0 tauri deps in zen-llm, 0 raw AppHandle emits in agent core,
  0 AppState refs in zen-llm).

**Rollback:** revert commit range.

**Risk:** Medium. Streaming edge cases; rely on existing wiremock suites.

---

## Phase 8 — Extract `zen-mcp`

**Goal:** MCP client/config/consent/discovery logic isolated behind security
checks that already live in zen-security.

**Prerequisites:** Phases 4, 7.

**Tasks**
- [x] Move `src/mcp/**` logic cores → `crates/zen-mcp` (client/{mod,elicit,
      features,http_body,http_handshake,rpc,stdio_helpers,sync,subscriptions},
      oauth/{discovery,flow,pkce,token}, env, mrtr, resources, sandbox, stdio,
      tool_schema, types) + `services/mcp_config.rs` → `config.rs` +
      NEW `config_store.rs` (parsing vs persistence split per plan; 609/220)
      + `mcp_consent.rs` → `consent.rs` + `mcp_discovery.rs` → `discovery.rs`.
      App keeps pure re-export shims (`src/mcp/mod.rs`, services re-exports).
- [x] Construction inversion (§3.4 row 3): no service construction remains
      inside zen-mcp —
      - secrets: concrete `SecretService` → `Arc<dyn SecretStore>` /
        `&dyn SecretStore` (env expansion, oauth token store/load/clear);
      - UI: `Option<&AppHandle>` threading replaced by
        `zen_mcp::ui::UiBridge { sink: Arc<dyn EventSink>,
        browser: Arc<dyn OAuthBrowser> }`; app impls in NEW
        `services/mcp_registrar.rs` (`OpenerBrowser` via tauri_plugin_opener,
        `ui_bridge(app)` helper); `EventSink::emit_result` added to the port
        (overridable) so MCP status/elicitation emit-failure logging is kept;
      - registry: because `ToolRegistry<A>` is host-context-generic, adapter
        construction inverted behind NEW `registrar::ExternalToolRegistrar`
        port + `ExternalToolSpec` DTO; app impl `McpRegistrar` wraps specs in
        `McpToolAdapter` (Weak back-ref via `set_client_weak`, same cycle
        break); `McpClient.tool_registry` field deleted (was sync-only);
      - `SecurityService` stays CONCRETE (sanctioned dep per plan task list;
        audit/consent paths byte-identical). `tauri::async_runtime::spawn` →
        `tokio::spawn`.
- [x] `services/mcp_adapter.rs` STAYS in the app crate as integration glue
      (implements `zen_tools::Tool<AppHandle>` + reaches AppState cancellation
      tokens) — the P6 sanctioned-exception pattern; its call into the client
      now passes a `UiBridge`. Deviation from plan's "mcp_adapter core moves"
      noted here deliberately.
- [x] zen-mcp deps: zen-core (ports incl. new `emit_result`), zen-security
      (service/policy/risk/url_safety), zen-tools (ToolAnnotations),
      reqwest(native-tls,json,stream), async-trait, tokio(process/io-util/time/sync/macros/
      rt), tokio-util, futures-util, serde(_json), thiserror, tracing, url,
      dirs(6.0), base64(0.22), sha2(0.10), jsonschema(0.42), windows-sys
      (0.59 JobObjects — relocated pin), uuid/chrono; dev: wiremock. NO tauri.
      NO sqlx.
- [x] Provider/model discovery endpoints unchanged; policy checks unchanged.

**Verification gates**
- MCP unit tests green in-crate: `cargo test -p zen-mcp` 55 passed (+33
  policy-tests mrtr mirror repointed at crate sources). Connect to at least
  one stdio server manually: pending user-side check before release cut
  (recorded, non-blocking).
- Gate suite green (check / clippy -D warnings / crate tests / npm build;
  guards: 0 tauri code refs in zen-mcp, 0 AppState refs (comment only),
  0 raw AppHandle emits in agent core, all files <700 after config split).

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
- [x] Move `src/rag/**` → zen-rag: `lancedb_store`, `conversation_store`,
      `embedding`, `ingestion`, `office_extract`, `hybrid_backend`,
      `session_memory`, and the `VectorStore`/`DocumentChunk`/`SearchResult`
      contract (former `rag/mod.rs` → crate `lib.rs`). All 8 files moved via
      `git mv` (rename-tracked); largest is `embedding.rs` at 512 lines, so no
      RULES.md split was needed. App keeps a pure re-export shim at
      `src/rag/mod.rs`; all 31 historical `crate::rag::*` reference lines
      across 8 consumer files compile unchanged. Shim deleted in Phase 14.
- [x] Ingestion home decided by measured usage rather than the plan's guess:
      `calamine`/`quick-xml` (office_extract), `text-splitter`+`tiktoken-rs`
      and `pdf-inspector` (ingestion), `candle-*`/`tokenizers` (local BERT
      embeddings) and `lancedb`/`arrow-*` moved to zen-rag and **removed from
      the app crate** — none had a non-rag consumer. Deliberately NOT moved:
      `infer` (only `services/document.rs` magic-byte sniffing), `zip` (shared
      with `commands/backup.rs`, `commands/dependency.rs`,
      `services/gtsm/geojson.rs`; declared in both crates at the same pin),
      `scraper`/`spider` (only `search/tool.rs`, never rag). Attachment and
      document orchestration stay app-side as planned. The app root's
      `extern crate pdf_inspector;` was deleted with the dependency.
- [x] zen-rag deps: zen-core, zen-db (hybrid_backend session-memory CRUD),
      lancedb 0.26, arrow-array/arrow-schema 57, candle-core/-transformers/-nn
      0.9, tokenizers 0.21, text-splitter 0.16 (+tiktoken-rs feature),
      tiktoken-rs 0.6, calamine =0.35.0, quick-xml =0.41.0, zip 4.6.1,
      pdf-inspector (git), dirs 6.0, sqlx, reqwest(native-tls,json), tokio,
      futures, uuid, serde(+derive), serde_json, tracing, anyhow, async-trait;
      dev: tempfile, tokio. Every pin matches the app crate — relocated usage,
      no new provenance under Security.md. NO tauri (verified by `cargo tree`).

**Verification gates**
- `cargo test -p zen-rag`: 8/8 passed. One latent pre-existing bug surfaced on
  the first-ever gated execution of these tests and was fixed forward:
  `session_memory::write_memory` held the `memories` write guard across
  `persist_session()`, which re-acquires the same `tokio::RwLock` for reading
  — a self-deadlock. Both `session_memory` tests hung indefinitely (harness
  killed the process, exit 143). The guard is now scoped; behavior is otherwise
  identical, and the affected fallback path is unreachable in production today
  (no hybrid backend is wired at either `SessionMemoryManager::new` call site
  and `write_memory` has exactly one caller). Confirmed against the frozen
  `Zen_rs_old/` snapshot that the deadlock predates the migration.
- Gate suite green: `cargo metadata` valid; `cargo check --workspace
  --all-targets` clean; `cargo clippy --workspace --all-targets -- -D warnings`
  clean; per-crate suites zen-db 5, zen-security 53, zen-tools 30, zen-llm 82,
  zen-mcp 55, zen-rag 8, zen-policy-tests 33 all green; `npm run build` green.
  Guards: 0 tauri in `cargo tree -p zen-rag`; 0 `AppState` /
  `crate::commands` / `crate::services` / `crate::agent` references in
  zen-rag; every crate file <900 lines.
- `cargo test --workspace` still cannot run the app-crate lib target on this
  dev box (`STATUS_ENTRYPOINT_NOT_FOUND`, exit 0xc0000139 — the environmental
  tauri-linked-test-binary loader failure recorded in Phase 6). Per-crate
  suites are run individually instead; unchanged by this phase.
- Manual end-to-end document ingest → vector query: pending user-side check
  before release cut (recorded, non-blocking — same disposition as the
  Phase 7/8 manual smokes).

**Rollback:** revert commit range.

**Risk:** Medium-Low. Mostly self-contained today.

---

## Phase 10 — Extract `zen-media`

**Goal:** the speech (whisper) and TTS (piper) runtimes plus their audio
plumbing isolated behind ports, so native-audio deps stop rebuilding with
unrelated code.

**Prerequisites:** Phase 2 only. **The original prerequisite was retired on
2026-08-24 after measurement** — see Appendix G. It read "Phase 6 media-seam
completion (review finding #6: speech/tts cores carry ~9 AppHandle sites)".
That is not the current tree: `services/speech_service/mod.rs` (784 lines) has
ZERO tauri references, and the entire host coupling is one file. Inverting it
is in-phase work, not a blocking predecessor.

**Measured coupling surface (verify before starting; re-measure, do not trust
these numbers if the tree has moved):**
- `services/tts_service/mod.rs` (485) — the only tauri-coupled media file:
  `use tauri::{AppHandle, Emitter}` (line 7); `speak(&self, text, app:
  AppHandle)` (line 145) with exactly ONE caller, `commands/voice.rs:306`;
  9 `app.emit` sites (`tts:error`, `tts:level`, `tts:stop`, word-timing);
  2 `tauri::async_runtime::spawn` → plain `tokio::spawn`.
- `services/speech_service/mod.rs` (784) — tauri-free already. Whisper is NOT
  an in-process candle model: it shells out to a `whisper-server` binary
  (`Command::new(&resolved_binary.path)`, ~line 411) and talks HTTP/TCP to it.
- `services/media.rs` (259) — `use tauri::Manager` + `setup(&AppHandle)`.
  STAYS app-side; it is startup glue, not media logic.

**Tasks**
- [x] Invert the tts seam FIRST, as its own commit inside the phase: replace the
      `app: AppHandle` parameter on `speak` with `Arc<dyn EventSink>` (already
      in zen-core), swap the 2 `tauri::async_runtime::spawn` for `tokio::spawn`,
      and update the single `commands/voice.rs:306` call site. Event names and
      payload shapes stay byte-identical (R5).
- [x] Move `services/speech_service/` and `services/tts_service/` → zen-media.
      Split `speech_service/mod.rs` (784) during the move per RULES.md; it is
      over the 700 warn band.
- [x] Resolve the transitive deps — this is the real work of the phase, and the
      original plan did not mention it. Both media services import
      `services::{hardware, runtime_resource, process_manager}` and
      `utils::{default_http_client, model_download_http_client}`:
      - `process_manager.rs` (151) is ALREADY tauri-free. **Do not build the
        `ProcessPort` the old plan called for** — move the concrete type into
        zen-media (or zen-core) and keep passing `Arc<ProcessManager>` exactly
        as today's `with_process_manager` constructors do. Its only non-media
        consumer is `terminal/mod.rs`, which can use the moved type.
      - `hardware.rs` (320) is tauri-free but has 8 consumers across `agent/`
        and `commands/`. It must MOVE (shared, re-exported via shim), not be
        duplicated — a second copy would be an SSOT violation.
      - `runtime_resource.rs` (449) is tauri-free; non-media consumer is
        `commands/voice.rs`. Same treatment as hardware.
      - `utils/mod.rs` (143) is tauri-tainted (line 7 `use tauri::Manager`;
        `validate_generated_image_path(&AppHandle, ..)` line 98) but the two
        HTTP-client helpers media needs are clean. Extract just those two into
        a tauri-free home rather than moving the module.
- [x] zen-media deps (corrected — the old list was written pre-Phase 9 and is
      wrong in both directions):
      - **Remove from the plan:** candle-core/transformers/nn and tokenizers.
        All four left the app crate in Phase 9 for zen-rag; `src/` now has ZERO
        `candle` references. Whisper here is an out-of-process binary.
      - **Remove from the plan:** `image` (zero Rust references anywhere; see
        Phase 12) and `sysinfo` (used by `hardware.rs` + `commands/mod.rs`, so
        it follows hardware rather than being a media dep in its own right).
      - **Actual deps:** `rodio` (tts only), `hound` (speech only), `cpal`
        (tts + `commands/audio.rs`), `reqwest`, `tokio`, `serde`, `serde_json`,
        `tracing`, `uuid`, `zen-core`. NO tauri.
      - `webrtc-vad` STAYS in the app crate: its only consumer is
        `commands/voice.rs` (VAD gate before transcription, ~lines 113/221).
      - `cpal` is declared in both crates (shared with `commands/audio.rs`,
        87 lines, which stays app-side) — same disposition as `zip` in Phase 9.
- [x] Add the app-side `src/services/{speech_service,tts_service}/mod.rs`
      re-export shims per §4.6; delete at Phase 14.

**Verification gates**
- `cargo test -p zen-media`: 13/13 passed (11 runtime_resource + 2 tts).
  `cargo test -p zen-policy-tests`: 22/22 — was 33 in Phase 9; the 11
  runtime_resource tests moved with the module and now run under zen-media
  (35 total across the two suites, nothing dropped).
- Gate suite green: `cargo metadata` valid; `cargo check --workspace
  --all-targets` clean; `cargo clippy --workspace --all-targets -- -D warnings`
  clean; `npm run build` green. Post-review sanity re-check of
  `-p zen-media -p zen-policy-tests` also clean.
- `cargo tree -p zen-media`: zero `tauri` and zero `keyring` edges; the
  standing workspace guard shows every extracted crate tauri/keyring-free.
- Code review: APPROVE, no P0/P1. R5 parity confirmed on all 7 tts emit
  sites; `tts:stop` now sends `Value::Null`, and `()` vs `Value::Null` both
  serializing to JSON `null` was verified empirically in a scratch project;
  the frontend (`src/api/events.ts`) types `tts:stop` as `EmptyEventPayload`
  and ignores the body. Two P2 nits recorded and accepted as-is (cosmetic):
  mixed `tracing::`-qualified macros in `speech_service/server.rs`, and
  `tokio::spawn` inside `spawn_blocking` closures in tts_service relying on
  entered runtime context (a latent constraint only if `speak()` is ever
  called off-runtime).
- Manual transcribe + speak smoke, audio device listing, and `tts:level`/
  `tts:stop` frontend meter checks: deferred to the user-side pre-release
  check (no audio path on this dev box) — same disposition as the
  Phase 7/8/9 manual smokes.

**Completion record (2026-08-24):** seam inversion landed as `c1b4b46`,
extraction as `60129ad` (git mv history preserved). Splits/sizes:
`speech_service/mod.rs` 565 + `server.rs` 230 (start_server + watchdog as a
child-module split-impl block); `tts_service.rs` moved whole (485); all
under the 700 warn band. Dep dispositions as measured: rodio + hound left
the app crate entirely; cpal and sysinfo declared in both crates
(commands/audio.rs and commands/mod.rs stay app-side); webrtc-vad stays
app-side (voice.rs VAD gate); `nix =0.28.0` pinned for non-Windows
`kill_pid_sync`, already present transitively in Cargo.lock (Security.md
30-day rule: no new supply-chain surface). The §4.6 shim is a single
`pub use zen_media::{hardware, process_manager, runtime_resource,
speech_service, tts_service};` in `services/mod.rs` — wider than the
planned two-module shim because the transitive moves must keep their old
app paths alive too. utils/mod.rs re-exports the two HTTP clients from
`zen_media::http` (single OnceLock instances, SSOT); the policy-tests
`#[path]` mirror for runtime_resource became `pub use
zen_media::runtime_resource;` (Phase 4/8 crate-alias pattern).

**Rollback:** revert commit range.

**Risk:** Low-Medium. Native audio deps are Windows-first; the transitive
hardware/runtime_resource move touches more call sites than the media code
itself does.

---

## Phase 11 — Extract `zen-agent`

**Goal:** the crown jewels — runner loop, orchestrator, deep research, swarm,
middleware, skills — in their own crate, fully UI-agnostic.

**Prerequisites:** Phases 5, 7, 8 done (agent depends on the tools/llm/mcp
crates) — all complete. Phase 6 must be complete in the sense of **zero LIVE
`AppState` reach-throughs in the agent core**; that is already true as of
2026-08-24. A naive grep is misleading here, so use this wording rather than a
count: `src/agent` has 52 `AppState` occurrences, of which 36 are in `tools/`
(sanctioned to keep `AppHandle` until this phase, per the Phase 6 re-scope) and
all 16 in the core are **doc/explanatory comments** ("Phase 6 seam: shared
service handles (same Arcs as AppState)"). Verify live references, not text
matches.

**Tasks**
- [x] Move `src/agent/**` → `crates/zen-agent/src/**` preserving submodule
      layout (agents/, deep_research/, middleware/, orchestrator/, runner/,
      skills/, swarm/). Done 2026-08-25 (~29.9k lines). Deliberate deviation,
      sanctioned by the Phase 5 trait contract: `tools/` leaf executors that
      receive `AppHandle` through `AgentTool<tauri::AppHandle>` stayed in the
      app crate (`src/agent/tools/**`); only their orchestration moved
      (child_runner, handoff_context re-exported from zen-agent). The app path
      `src/agent/mod.rs` is now a §4.6 shim re-exporting `zen_agent::*`.
- [x] Split hard-fail files DURING the move (do not carry them across).
      **Line counts re-measured 2026-08-24; the original figures were stale by
      up to 12% and two paths had moved. Re-measure again at phase start.**
      Over the 900 hard-fail line (all six resolved; actual split shapes noted):
      - tools/spawn_tools.rs (1,715) → spawn_tools/{child,tool,deps,failure,
        model_select,outcome,completion,messaging,params,mod} — stayed
        app-side (executors), largest part 523 lines
      - deep_research/phases.rs (1,608) → deep_research/phases/{dispatch,
        plan,report,search,analyze} (largest 572)
      - runner/loop.rs (1,429) → runner/{turn_loop.rs (797), step_exec.rs (858)}
      - runner/helpers.rs (1,297) → runner/helpers/{budget.rs (554),
        compact.rs (434), ...} by topic
      - runner/tool_dispatch.rs (1,243) → runner/dispatch/{router.rs (779),
        executors.rs (849), completion.rs, mod.rs}
      - runner/escalation.rs (1,118) → escalation logic split out pre-move
        (b03328a); remainder is runner/escalation.rs (438)
      In the 700–900 warn band — split or carry a justified exemption entry:
      - tools/fs_tools.rs (875): stays app-side (leaf executor), split
        deferred to Phase 12 — exemption renewed
      - event_bus.rs (865→856): carried whole into zen-agent — it owns the R5
        `AgentEvent::event_name()` SSOT and the mapping survived
        byte-identical (verified against the frozen snapshot); exemption renewed
      - router.rs (779), runner/voice_display.rs (771→736), plugins.rs (755),
        runner/context_breakdown.rs (748), orchestrator/execution.rs
        (726→710): relocated with renewed exemptions expiring at Phase 12
      - New warn-band split products carried forward: runner/dispatch/
        executors.rs (849), runner/step_exec.rs (858), runner/turn_loop.rs
        (797) — exemptions recorded, expire Phase 12
- [x] zen-agent deps: zen-{core,db,security,tools,llm,mcp,rag}, tokio,
      tokio-util, futures, serde/serde_json, sqlx (pool handle types only),
      tracing, async-trait, anyhow, chrono, uuid, thiserror + the relocated
      pins (sha2, regex, base64, lazy_static, async-recursion, url, meval,
      dirs, tiktoken-rs). NO tauri. NO keyring. NO reqwest (verified by
      `cargo tree -p zen-agent`: reqwest appears only transitively via
      zen-llm/zen-mcp).
- [x] Decide the rag/search/media edges from measured usage, not the original
      plan's assumption of `VectorStorePort`/`WebSearchPort`/`ProcessPort`.
      Decision taken as recommended: plain `zen-rag` dependency for the three
      zen-rag sites now inside the crate (runner/background.rs,
      runner/config.rs, and the conversation-store surface); no cycle appeared.
      The fourth site (`crate::search`, used by tools/progressive.rs and
      session memory) stayed app-side with its leaf executor, so no search
      port was needed at all. No media edge exists, so `ProcessPort` is not
      needed here either (see Phase 10).
- [x] Sub-agent spawning uses context handles only: `ChildRunnerParams`
      carries `&AgentContext`; no AppHandle reaches child execution.
- [x] OPTIONAL sub-decision (do not let it block the move): replace the
      host-generic `AgentTool<A>`/`Tool<A>` with a `ToolContext` struct
      parameter carrying `Arc<dyn …>` handles, the pattern both non-Tauri
      reference implementations use (Appendix G). *(Decision: NOT taken this
      phase — the trait reshape unblocks nothing and can land later, per the
      measurement note below. Revisit if a non-Tauri host ever materializes.)*
- [x] Update `tests/agentic_test.rs` imports; keep it in app crate (it drives
      the composed system).

**Verification gates**
- Full agentic integration test (`cargo test --test agentic_test`) green:
  compiles against the new crate layout; test *execution* remains blocked on
  this machine by the environmental STATUS_ENTRYPOINT_NOT_FOUND abort
  (pre-existing, affects all cargo test runs here) — single-filter tests pass;
  full run deferred to CI/clean machine.
- Manual E2E script (Appendix C) fully passing including approvals and
  sub-agents: pending the standing manual Windows/Tauri gate (same posture as
  Phases 7–10).
- `cargo tree -p zen-agent` shows no tauri/reqwest: verified (no tauri, no
  keyring anywhere in the tree; reqwest only transitive via zen-llm/zen-mcp).
- Gate suite green: workspace clippy 0 errors; verifier suite shows zero new
  regressions vs the clean-HEAD baseline (72 failures are pre-existing and a
  strict subset of the baseline's 84); `tsc --noEmit` clean; file-size gate
  green (no app-crate file over 900; warn-band files carry current
  exemptions.md entries).

**Rollback:** revert commit range. Highest-risk phase; schedule dedicated
session(s); do not rush.

**Risk:** High. Largest module (29,974 lines as of 2026-08-24). Mitigation:
phases 5–10 already moved its dependencies; the move itself is mechanical once
seams hold.

---

## Phase 12 — App-crate file-size debt sweep

**Goal:** everything remaining in the app crate respects RULES.md limits.

**Prerequisites:** Phases 3–11 complete (most offenders already relocated/split).

**Tasks**
- [x] **The original three-file list was badly under-scoped.** A full re-scan on
      2026-08-24 found 20 app-crate files over 700 lines, and every count in the
      old list had drifted upward. Re-measure at phase start; the snapshot below
      is the true current picture. Files under `src/agent` are excluded because
      Phase 11 relocates and splits them.
      Over 900 (hard fail) — both split this phase:
      - services/tool.rs (1,408 — was listed as 1,321; stays as composition
        shell) → **split into tool.rs (144, wiring + re-exports) plus
        tool/{agent_exec.rs 393, entry.rs 204, approval.rs 202, mutations.rs 150,
        authorized.rs 121, audit.rs 118, tests.rs 97}.** Approval execution and
        lookup are now separate modules as planned; exemption closed.
      - commands/chat/send.rs (941 — was 843) → **split into send.rs (321,
        command entry + orchestration) plus send/{prompt.rs 233, route.rs 233,
        research.rs 176, resolve.rs 164, persist.rs 117, validate.rs 88,
        history.rs 85}.** Validation / orchestration / response mapping are
        separated as planned; exemption closed.
      In the 700-900 warn band — split or carry a justified exemption:
      - canvas/session.rs (897 — was 828) → session state vs command application.
        **Disposition: exemption renewed, not split.** See the warn-band note.
      - services/speech_service/mod.rs (784) — Phase 10 relocates AND splits
        this, so it should already be gone. **Confirmed gone:** the app path no
        longer exists; it is `crates/zen-media/src/speech_service/{mod.rs 565,
        server.rs 230}`, both sub-threshold. Stale entry closed in exemptions.md.
      - commands/settings.rs (756) — NOT in the original list. **Renewed.**
      - commands/spatial.rs (724) — NOT in the original list. **Renewed.**
      - commands/mod.rs (714) — NOT in the original list; this is the AppState
        definition site, so split with care. **Re-measured at 621 — the ledger
        figure predated the per-domain command splits. Sub-threshold; entry
        closed, no split needed.**
- [x] lib.rs (670 — was listed as 666): extract command registration groups into
      per-domain `commands/mod.rs` builder fns; boot logic into `boot.rs` (keep
      run() thin). **Re-measured at 668 — under the 700 warn threshold, so this
      is not file-size debt. Not done: splitting a sub-threshold file to satisfy
      a stale ledger line would be churn. Deferred to Phase 13, which owns the
      lint/manifest hardening that would actually benefit from a thinner run().**
- [x] Close or renew the `crates/zen-security/src/policy.rs` exemption
      (1,393 lines, ~720 of which are inline tests). It is recorded as expiring
      at THIS phase. The file-size gate script only scans `src-tauri/src` and
      will NOT flag it, so this must be handled by hand or Definition-of-Done
      item 3 ("no file >900 anywhere in src-tauri") silently fails.
      **Closed by extraction: the two security-regression suites moved to
      `policy_mode_risk_tests.rs` (307) and `policy_tests.rs` (417), declared
      from policy.rs via `#[path]` (openai_compat/stream_tests.rs precedent) so
      they keep module-relative access to the private helpers they pin.
      policy.rs is now 683 — below the 700 warn threshold, so no successor
      exemption. `cargo test -p zen-security` still reports 53 passed, including
      all 17 mode_risk_matrix cases.**
- [x] Also re-scan `crates/*`, which the gate script does not cover today:
      zen-tools/src/manager.rs (818), zen-llm/src/ollama/mod.rs (738) and
      zen-llm/src/openai_compat/stream_tests.rs (718) sit in the warn band.
      **Re-scanned: 12 crate files sit in the 700–900 warn band after policy.rs
      dropped out; ZERO exceed 900. zen-tools/manager.rs (818) had no exemption
      entry at all and one was added. The Phase 11 ledger also mis-attributed
      the 779-line router to `runner/dispatch/router.rs`; that file is 266 and
      the 779 belongs to the crate-root `zen-agent/src/router.rs` — corrected in
      exemptions.md.**
- [x] Extend the file-size check script to cover `crates/**` in addition to
      `src-tauri/src/**`; otherwise this phase's result cannot be enforced going
      forward and Phase 13's guards have a blind spot.
      **Done in `scripts/quality-check.ps1`: a second `Get-ChildItem
      src-tauri/crates -Recurse -Include *.rs` loop mirrors the app-crate block
      and applies the same 900-line hard limit. The exemption-parsing regex
      already matched `src-tauri/crates/...` paths through its `src-tauri/`
      alternative, and `Is-Exempt`'s `Resolve-Path -Relative` normalization
      handles them unchanged, so no regex change was needed.
      Extending the scan also exposed four pre-existing *frontend* TS violations
      that the gate had been failing on independently of this migration
      (mockClient.ts 620, PremiumChatInputFixture.tsx 659,
      assistantMessageParts.ts 534, agentActionLedger.ts 501) — all four now
      carry exemption entries. The gate dry-run reports 0 violations.**
- [x] Remove the unused `image = "0.25"` app-crate dependency — a full scan of
      `src/` and `crates/` finds ZERO `image::` references. Confirm once more
      before deleting in case a Tauri feature needs it transitively; if so,
      record why it is a direct dependency.
      **Re-confirmed zero `image::`, `use image`, and `extern crate image`
      references across `src/` and `crates/`; removed from
      `src-tauri/Cargo.toml`. `cargo check --all-targets` green afterwards, so
      no Tauri feature needed it as a direct dependency.**
- [x] Re-scan: any file >700 needs an exemption entry or a split; >900 must be
      split or carry a documented exemption with an expiration.
      **Final picture — hard-fail band empty: zero `.rs` files over 900 in
      `src-tauri/src/**` or `src-tauri/crates/**`. Warn band: 4 app files
      (canvas/session.rs 897, agent/tools/fs_tools.rs 875, commands/settings.rs
      756, commands/spatial.rs 724) and 12 crate files (step_exec.rs 858,
      event_bus.rs 856, dispatch/executors.rs 849, zen-tools/manager.rs 818,
      turn_loop.rs 797, zen-agent/router.rs 779, plugins.rs 755,
      context_breakdown.rs 748, zen-llm/ollama/mod.rs 738, voice_display.rs 736,
      openai_compat/stream_tests.rs 718, orchestrator/execution.rs 710), each
      with an exemption entry carrying an owner and a concrete split plan.
      Warn-band entries were re-based off `migration/phase-NN-done` expiries
      onto the owning surface's next refactor: the gate does not fail on them,
      and forcing sixteen speculative splits at the end of the migration would
      be churn, not risk reduction.**

**Verification gates**
- File-size check script green; exemptions.md accurate and minimal.
  **Green: extended gate dry-run reports 0 violations across
  `src-tauri/src/**`, `src-tauri/crates/**`, and `src/**`. exemptions.md
  refreshed 2026-08-25 — 4 entries closed as resolved (policy.rs,
  services/tool.rs, commands/chat/send.rs, commands/mod.rs), the stale
  `src/services/speech_service/mod.rs` entry retired, 5 added
  (zen-tools/manager.rs + the 4 frontend files), and the Phase 11 router
  mis-attribution corrected.**
- Gate suite green.
  **Workspace `cargo clippy --all-targets`: 0 errors. Per-crate tests:
  zen-security 53, zen-tools 30, zen-llm 82, zen-mcp 55, zen-db 5, zen-core 0 —
  all passing. `tsc --noEmit` clean. `npm run lint:tokens`: 439 files clean vs
  baseline. Verifier suite: 52/192 failing vs the clean-HEAD baseline's 73 —
  ZERO regressions and 21 newly passing (the relocation-debt repairs, including
  verify-permission-mode-system and verify-mcp-annotation-mapping fixed this
  phase). The residual 52 are pre-existing frontend/contract drift unrelated to
  the migration. Whole-workspace `cargo test` remains blocked on this machine by
  the environmental STATUS_ENTRYPOINT_NOT_FOUND abort; per-crate runs substitute
  as in Phases 7–11.**

**Risk:** Low.

---

## Phase 13 — CI, test & lint hardening

**Goal:** the workspace's boundaries stay enforced automatically.

**Tasks**
- [x] Per-crate test jobs in CI with path filters (changed-crates detection
      like codex-rs: docs/codegen only rebuild affected crates).
      *Done: `changes` job (dorny/paths-filter@v3) emits `backend`/`manifests`
      outputs; `crate-tests` runs a 10-crate matrix (`clippy -p` + `test -p`,
      ubuntu, fail-fast off) gated on `backend`; `boundaries` and `coverage`
      gate on their respective filters.*
- [x] Add boundary guards to CI:
      - grep gate: `tauri` must not appear in any crates/*/Cargo.toml
      - grep gate: `keyring` must not appear in any crates/*/Cargo.toml either
        (the constraint has always been "no tauri AND no keyring"; only the
        tauri half was ever written down here)
      - `cargo deny`/audit config unified at workspace root (.cargo/audit.toml)
      - file-size scan extended to `crates/**` (see Phase 12)
      *Done: `boundaries` job greps `^\s*(tauri|keyring)\s*(=|\{|\.)` across
      `crates/*/Cargo.toml` and fails on match; same guard mirrored in
      `quality-check.ps1` for local runs. cargo-deny config unified at
      `src-tauri/deny.toml` (advisories ignore RUSTSEC-2023-0071, license
      allow-list, sgp4 clarify, bans=warn) run via `cargo deny check`; the
      pre-existing `.cargo/audit.toml`/`audit.toml` are left in place for
      cargo-audit. File-size scan over `crates/**` was already added in Phase 12.*
- [x] Move clippy enforcement from a CLI flag into the manifest. Today `-D
      warnings` only applies when someone remembers the flag; a bare `cargo
      clippy` enforces nothing. Adopt the codex-rs arrangement (Appendix G):
      add `[workspace.lints.clippy]` at the workspace root with an explicit deny
      set, and `[lints]
workspace = true` in all nine crate manifests plus the
      app crate. Start from the high-value denies that match this codebase's
      known failure modes: `unwrap_used`, `expect_used`, `await_holding_lock`
      (would have caught the Phase 9 `session_memory` RwLock deadlock class),
      `redundant_clone`, `needless_borrow`, `uninlined_format_args`. Expect a
      one-time debt sweep; land the sweep and the lint block in the same commit
      so the tree never sits red.
      *Done: `[workspace.lints.clippy]` at root with the six denies above;
      `[lints] workspace = true` in all 10 crate manifests + the app crate;
      `clippy.toml` sets `allow-unwrap-in-tests`/`allow-expect-in-tests`. One-time
      sweep of ~90 violations landed alongside (static-regex unwraps carry
      `#[allow]` + justification; runtime unwraps became poison-tolerant helpers
      or `unwrap_or_default`). Bare `cargo clippy --workspace` is now clean with
      no CLI flag.*
- [x] Fix workspace manifest drift (all cosmetic today, but it compounds):
      - Adopt `[workspace.package]` for shared `version`/`edition`/`license` and
        have members inherit via `version.workspace = true` etc. Currently all
        seven crate manifests repeat `version = "0.1.0"` and
        `edition = "2021"` by hand.
      - Normalise `publish`. zen-core/zen-db/zen-security set `publish = false`;
        zen-llm/zen-mcp/zen-rag/zen-tools do not. Nothing here is publishable —
        set it uniformly (or once, via `[workspace.package]`).
      - Hoist the 12 dependencies currently pinned at IDENTICAL versions in two
        or three separate manifests into `[workspace.dependencies]`, then switch
        the sites to `{ workspace = true }`: `dirs` 6.0 (app, zen-mcp, zen-rag),
        `regex` 1 (app, zen-llm, zen-security), `url` 2 (app, zen-mcp,
        zen-security), `base64` 0.22 (app, zen-llm, zen-mcp), `jsonschema` 0.42
        (app, zen-mcp, zen-tools), `wiremock` 0.6 (app, zen-llm, zen-mcp),
        `tempfile` 3 (app, zen-db, zen-rag), `sha2` 0.10 (app, zen-mcp),
        `zip` 4.6.1 (app, zen-rag), `tiktoken-rs` 0.6 (app, zen-rag),
        `dashmap` 6.1 (app, zen-llm), `futures-util` 0.3 (app, zen-mcp).
        Duplicated pins are how version skew starts; a single source also means
        Security.md's 30-day rule is checked in one place.
      *Done: `[workspace.package]` holds `version="0.1.0"`, `edition="2021"`,
      `publish=false`; every member (10 crates + app) inherits via
      `version.workspace = true` etc., so `publish` is now uniform. 17 shared
      pins hoisted into `[workspace.dependencies]` (the 12 above plus a few more
      that had drifted identical) and their sites switched to
      `{ workspace = true }`. `cargo metadata --no-deps` validates.*
- [x] Coverage ratchet for zen-security + zen-tools (privileged code) per
      RULES.md testing gates.
      *Done: `coverage` job runs `cargo llvm-cov --summary-only -p zen-security
      -p zen-tools --fail-under-lines 50`. Floor set at 50 (informational
      starting point per the comment); promote once a baseline settles.
      cargo-llvm-cov cannot run on the dev box, so the floor is validated only
      by the CI job definition.*
- [x] CI must run `cargo test --workspace`, which no local box can do (the
      app-crate lib target aborts with STATUS_ENTRYPOINT_NOT_FOUND on
      tauri-linked test executables). This phase is the first point where the
      full suite is actually exercised end-to-end, so budget for latent-red
      tests surfacing here the way Phase 7 and Phase 9 each surfaced their own
      (Appendices E and F).
      *Done: Windows `backend` job runs `cargo test --workspace`. The predicted
      latent-red surfaced exactly as budgeted — 17 zen-agent tests failed on the
      first full run. Confirmed pre-existing via `git stash` (all 17 fail at
      clean HEAD too, baseline-diff protocol) and fixed each as a real bug, not
      a test edit: `std::cmp::Reverse` priority ordering in `task.rs`; a
      `running` map in `task_queue.rs` so `mark_failed`/`retry` reach a terminal
      state; `camelCase` on `CompactionEvent`; separator accounting in
      `truncate_to_budget`; marker-length in `truncate_head`; per-message
      condense in `compact.rs`; TIER2 scoring + whole-word booster detection in
      `router.rs`; hex `{num:#X}` in `booster.rs`; by-name dedup in
      `skills/discovery.rs`. zen-agent now 230/230. See Appendix H.*
- [x] Capture the outstanding runtime event-contract baseline fixture
      (`test/fixtures/event-snapshot-baseline.jsonl`) in CI. It has been carried
      as a standing debt since Phase 6 because it cannot be produced locally;
      CI is the mechanism. Procedure in `test/fixtures/README.md`.
      *Done: `backend` job has a "Capture event-contract baseline (if missing)"
      step that sets `ZEN_EVENT_SNAPSHOT_PATH` and runs the `agentic_test` target
      with `--features event-snapshot`, but only when the committed baseline is
      absent so a frozen fixture is never silently overwritten. A drift check
      against the committed baseline is the Phase 14 follow-up.*
- [ ] Optional: adopt cargo-nextest for speed; insta snapshot tests for any
      future TUI-visible/CLI output if introduced.
      *Skipped (optional): no TUI/CLI output surface exists; nextest is a speed
      nicety, not a boundary guard. Revisit if a CLI is introduced.*
- [ ] Nightly full-matrix job (all crates, all targets) mirroring fast-PR path.
      *Deferred: the workflow is manual-only for now (see the Zen CI notes), so a
      nightly schedule would not fire. The `crate-tests` matrix already covers
      all crates/all targets on demand; wire a `schedule:` trigger when CI is
      promoted off manual dispatch.*

**Verification gates**
- CI green including new guard jobs; intentionally-break experiment (add tauri
  dep to zen-core on a branch) is caught by CI.
  *Done locally to the extent this box allows: bare `cargo clippy --workspace`
  clean (manifest-enforced); per-crate tests all green (zen-agent 230/230,
  zen-security 53, zen-tools 30, zen-llm 82, zen-mcp 55, zen-db 5, zen-media 13,
  zen-core 0); `tsc` clean; `lint:tokens` 439 files clean; `cargo metadata`
  valid; full `quality-check.ps1` passes (two stale gates repaired first — the
  `tool.run(`/`execute_authorized` boundary excludes and the `default_tool_risk`
  source location both still pointed at the pre-split monolith paths). The
  intentionally-break experiment passed: injecting `tauri = "2"` into
  `zen-core/Cargo.toml` was caught by the boundary grep, then reverted.
  `cargo test --workspace`, `cargo deny`, and `cargo llvm-cov` run only in CI
  (STATUS_ENTRYPOINT_NOT_FOUND / tools not installed on the dev box), validated
  by job definition.*

**Risk:** Low.

---

## Phase 14 — Governance, docs & closure

**Goal:** make the new structure the documented law of the land.

**Tasks**
- [ ] Delete every §4.6 re-export shim and rewrite consumers to their deliberate
      final paths. This is the largest task in the phase and was previously
      implicit. Current shim inventory (16 files; re-verify at phase start):
      `src/db/mod.rs` (5), `src/services/security.rs` (10), `src/rag/mod.rs`
      (13), `src/llm/mod.rs` (16), `src/mcp/mod.rs` (18), `src/error.rs` (38,
      re-export plus boundary helpers), `src/agent/tools/mod.rs` (74),
      `src/tools/mod.rs` (97), plus `src/services/{permissions,secret_policy}.rs`
      and `src/tools/{calculator,capability,url_safety,permission,manager,
      patch_parser}.rs`. Phase 10 adds speech/tts shims. Do this crate-by-crate
      with a compile between each, not as one sweep.
- [ ] Update RULES.md: Target Layering section gains the workspace/crate map;
      add "resist adding code to zen-app" guidance; dependency direction now
      cites compiler enforcement.
- [ ] Update AGENTS.md / CLAUDE.md pointers and docs/architecture/* for:
      tool architecture ownership (zen-tools), security policy location
      (zen-security), streaming behavior (zen-llm), DB rules (zen-db paths),
      RAG/ingestion (zen-rag), media runtimes (zen-media), agent loop
      (zen-agent).
- [ ] Remove the temporary migration banners: AGENTS.md rule 0.2 and the RULES.md
      migration banner both say to delete themselves at this phase. Also decide
      the fate of `Zen_rs_old/` (the frozen pre-migration snapshot) — it is
      preserved by the `pre-workspace-migration` tag, so the working-tree copy
      can go, which also removes it from the codegraph .gitignore special-case.
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

1. `crates/*` contains 9 crates; none depend on tauri OR keyring (CI-enforced).
   Current count is 7 (zen-core, zen-db, zen-security, zen-tools, zen-llm,
   zen-mcp, zen-rag); zen-media and zen-agent bring it to 9.
2. Zero `crate::commands::AppState` references outside app crate (grep-gated).
3. No file >900 lines anywhere in src-tauri — **including `crates/**`** —
   without a current exemption entry. The file-size script must actually scan
   `crates/**` for this to be enforceable (Phase 12).
4. Gate suite green on `--workspace --all-targets` in CI, plus frontend build.
   Note `cargo test --workspace` cannot run on a Windows dev box
   (STATUS_ENTRYPOINT_NOT_FOUND on tauri-linked test binaries), so CI is the
   only place this criterion can be evaluated.
5. Manual E2E script (Appendix C) passes fully, plus the per-phase manual smokes
   deferred along the way: real-provider streaming (Phase 7), stdio MCP connect
   (Phase 8), document ingest → vector query (Phase 9), transcribe/speak
   (Phase 10).
6. Every §4.6 re-export shim is deleted and consumers use final paths (Phase 14).
7. The runtime event-contract baseline fixture exists and the post-migration
   capture diffs clean against it (R5).
8. RULES.md/docs updated, migration banners removed; exemptions ledger current;
   `migration/complete` tagged.

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
| agent/clarification.rs:8 | a | ctx.db via `&AgentContext` param (module dormant; command unregistered) | ☑ |
| agent/deep_research/engine.rs (struct field) | a | `ctx: &'a AgentContext` replaces `state: &'a AppState` | ☑ |
| agent/deep_research/mod.rs:80 | a | managed `AgentContext` acquired once in `run_deep_research` | ☑ |
| agent/orchestrator/execution.rs:280,307 | a | `self.ctx.subagent_cancellation_tokens` | ☑ |
| agent/middleware/system_prompt.rs:87,189,467 | a | `self.ctx.{mcp_discovery, graph_sessions, agent_registry}` | ☑ |
| agent/middleware/skills.rs:34 | a | `self.ctx.skills_manager` | ☑ |
| agent/skills/manager.rs:173 (cwd_for_chat) | a | fn takes `&AgentContext`; executor caller fetches managed ctx | ☑ |
| agent/runner/loop.rs:21,136,212 | a | `self.ctx.{next_run_id, skills_manager}` | ☑ |
| agent/runner/loop.rs:577,732 | a | `self.ctx.context_breakdown_cache` (no more missing-state branch) | ☑ |
| agent/runner/background.rs:113-186 | a | ctx clone into spawn task (`documents`, `provider()`, `conversation_store`, `recall_cache`) | ☑ |
| agent/runner/background.rs:373 (compaction) | a | `CompactionParams.ctx` → `ctx.provider_by_name` | ☑ |
| agent/runner/background.rs:434-468 (embedding) | a | fn takes `AgentContext` | ☑ |
| agent/runner/escalation.rs:1027-1088 | c | `ctx.settings` / `ctx.secrets` async ports | ☑ |
| agent/runner/memory_bootstrap.rs:107 | a | fn takes `&AgentContext`; `ctx.recall_cache.try_lock()` preserved | ☑ |
| agent/runner/tool_dispatch.rs:427,491,508-539,573,876 | a | `self.ctx.tool_service`, `ctx.session_permissions`, `ctx.db()` | ☑ |
| agent/runner/voice_display.rs:63,140-153 | a | ctx clone into spawn task (`db`, `provider_by_name`) | ☑ |
| orchestrator+deep_research wait_for_chat_resume (b) | b | `ctx.wait_for_chat_resume` / runner loop :281 same | ☑ |
| llm/registry.rs:6,9 (c) | c | **moved to Phase 7** per re-scope | ☐ P7 |

Raw `app.emit(` conversions (all now byte-identical through the sink):
escalation.rs:383 · voice_display.rs:50,290 · deep_research/mod.rs:41,121,184,272 ·
deep_research/phases.rs ×5 · clarification.rs (rewritten around sink).

Approved adapter exceptions (files that legitimately keep AppHandle because
they ARE adapters or Phase-11-scoped executors):

| File | Reason it keeps AppHandle |
|---|---|
| src-tauri/src/agent/event_bus.rs | IS the bus: `emit_via` + snapshot taps own `app.emit` (sanctioned) |
| src-tauri/src/agent/tools/** (executors) | Phase 5 sanction: executors receive AppHandle via frozen `AgentTool`/`Tool` trait contracts; revisit at Phase 11 |
| src-tauri/src/services/event_sink.rs | The TauriEventSink bridge itself — wraps `app.emit` by design |

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

## Appendix E — Latent pre-existing defects fixed forward (Phase 7)

`cargo test -p zen-llm` was the **first gate ever to execute the provider
wiremock suites** (no CI workflow runs `cargo test` yet — P13; app-crate test
binaries abort on this box via the known R-loader bug). Three latent failures
surfaced; all were stale tests / minor bugs predating the move (moved files
verified byte-identical modulo import rewrites):

1. `context_window_discovery::test_extract_anthropic` — `RE_ANTHROPIC` always
   captured the leading input-token count (`188240`) instead of the trailing
   window (`200000`) for inequality-form messages, contradicting both the
   pattern's doc comment and its dedicated `_ALT` regex. Fix: try
   `RE_ANTHROPIC_ALT` before the provider loop (hoisted from dead post-loop
   fallback position).
2. `openai_compat list_models` ordering asserts in
   `test_openai_compat_list_models_parses_all_fields` — written against
   insertion order; a later "sort alphabetically" change keys on
   `ModelInfo.name`, which carries the model *id* at that site. Fix: remapped
   index expectations to sorted order + clarified sort-site comment. The
   sibling `gemini…is_none()` assertion was likewise stale (window now filled
   by `infer_context_window` heuristics) → asserted populated.
3. `test_openai_compat_list_models_retries_on_rate_limit` — wiremock matches
   first-mounted-first; without `up_to_n_times(1)` the success mock (mounted
   second) never served and the rate-limit mock absorbed every retry, so the
   `.expect(1)` verification could not hold. Fix: `up_to_n_times(1)` +
   `.expect(1)` on the 429 mock, mount order unchanged.

## Appendix F — Latent pre-existing defect fixed forward (Phase 9)

`cargo test -p zen-rag` was the **first gate ever to execute the rag suites**
(same cause as Appendix E: no CI `cargo test` yet, app-crate test binaries
abort on this box).

1. `session_memory::write_memory` self-deadlocked on its in-memory fallback
   path: the `memories` write guard was still held when `persist_session()`
   re-acquired the same `tokio::RwLock` for reading. `test_write_and_search_memory`
   and `test_delete_session_memory` both hung until the harness killed the
   process (exit 143). Fix: scope the write guard so it drops before the
   persist call. Verified against `Zen_rs_old/src/rag/session_memory.rs` — the
   defect predates the workspace migration. Production impact was nil: no call
   site constructs a `SessionMemoryManager` with a hybrid backend, and the sole
   `write_memory` caller (`agent/tools/session_memory_tools.rs`) would have hit
   the same hang had a backend ever been wired.


## Appendix H — Latent pre-existing defects fixed forward (Phase 13)

Phase 13 wired the workspace lint denies and the first `cargo test --workspace`
gate. As Appendices E and F predicted, the first full run of the zen-agent
suite surfaced latent-red tests that no CI had ever executed. 17 zen-agent tests
failed; each was confirmed pre-existing via `git stash` (all 17 also fail at
clean HEAD — baseline-diff protocol) and fixed forward as a real defect, not a
test edit:

1. `task.rs` PriorityTask ordering — `BinaryHeap` popped lowest priority first
   because `TaskPriority` ordinals run Critical=0..Low=3 (natural order pops the
   largest = Low). Fix: wrap the heap key in `std::cmp::Reverse(..)` at both push
   sites so Critical pops first.
2. `task_queue.rs` failed/retry lifecycle — a popped task left the pending map
   with no home, so `mark_failed`/`retry_failed_tasks` could not find it and it
   never reached a terminal `Failed` state (`can_retry()` returned false). Fix:
   added a `running: HashMap<String, QueuedTask>` field; `pop_next` inserts,
   `mark_completed` removes, and `mark_failed`'s else-branch uses `get_mut` +
   `task.task.fail(error)` so status becomes terminal; `retry_failed_tasks`
   falls back to `running.remove`.
3. `context_breakdown.rs` `CompactionEvent` missing `#[serde(rename_all =
   "camelCase")]` — the wire payload broke the frontend camelCase contract (R5).
4. `budget.rs` `truncate_to_budget` — did not count the `"\n\n"` separator
   against `max_tokens` in its binary search, overshooting the budget.
5. `prompt_safety.rs` `truncate_head` — omitted the marker length from the byte
   target, so truncated output exceeded `max_bytes`. Fix:
   `target = max_bytes.saturating_sub(MARKER.len())`.
6. `compact.rs` — after the removal loop, message content was not condensed;
   fixed to condense each surviving message to `target_tokens/conversation.len()`
   via `truncate_to_budget`.
7. `router.rs` — TIER2 scoring was under-weighted (`score += 15`) and
   `detect_agent_booster` matched substrings, so a booster keyword inside a long
   prompt misrouted. Fix: whole-word token matching + a short-prompt
   `has_task_keyword` guard.
8. `booster.rs` — hex formatting used the wrong specifier; fixed to
   `format!("{num:#X}")`.
9. `skills/discovery.rs` — dedup keyed by path allowed duplicate skill names;
   changed to a by-name `HashMap<String, SkillMetadata>`.

None were regressions from the Phase 13 changes. zen-agent is now 230/230.

Two stale quality gates were also repaired (drift from the Phase 11/12 file
splits, not this phase's work): `quality-check.ps1`'s `tool.run(` /
`execute_authorized` / `.execute(app` boundary excludes still named the
pre-split monolith `services/tool.rs`, missing the new `services/tool/*.rs`
submodules; and the `default_tool_risk` risk-coverage cross-check still read
`src/tools/mod.rs` after the function moved to `crates/zen-tools/src/registry.rs`.
Both now point at the current paths and the full gate passes.


## Appendix G — Reference-implementation survey (2026-08-24, pre-Phase 10)

Three read-only Rust projects under `EXAMPLE_NO_EDITS/` were surveyed against
this plan. They usefully bracket the design space at 129 / 10 / 2 crates. Only
conclusions that changed a phase are recorded; the survey itself is not a
source of truth for Zen — the repository is.

**`codex-main/codex-rs` (OpenAI Codex CLI, ~129 crates) — manifest hygiene and
port isolation.** Adopted into Phase 13: `[workspace.lints.clippy]` with an
explicit deny set inherited by members via `[lints] workspace = true` (strictly
stronger than a CLI `-D warnings` flag, which enforces nothing when someone runs
a bare `cargo clippy`); `[workspace.package]` inheritance for
version/edition/license; test-support crates wired as path deps in
`[workspace.dependencies]` so siblings import mocks via `[dev-dependencies]`.
Their crate-splitting convention is `X-protocol` (serde DTOs, zero logic) /
`X` (engine) / `X-client` / `X-host`. **Deliberately NOT adopted:** they isolate
`keyring` in its own 227-line crate behind a `KeyringStore` trait so secret
tests can run headless. Zen has exactly one `keyring::` consumer
(`src/services/secret.rs`) already inverted behind the zen-core `SecretStore`
port, so that crate would buy a boundary Zen already has.

**`claude-code-RUSTS` (10 crates) — the closest analogue to the unbuilt
zen-agent.** Their tools take a concrete context struct
(`execute(&self, input: Value, ctx: &ToolContext)`) with `Arc<dyn …>` handles
inside it, and registries are `Vec<Box<dyn Tool>>`. Their turn loop takes an
`mpsc::UnboundedSender<QueryEvent>` plus a `CancellationToken`; their spec
states the engine "has zero knowledge of Ratatui, Crossterm, or CLI output".
This is the alternative to Zen's host-generic `AgentTool<A>`, recorded as an
optional Phase 11 sub-decision. They also keep MCP ignorant of the tool trait
and wrap MCP tools in a host-side adapter — the same call Zen already made by
keeping `mcp_adapter.rs` app-side.

**`terax-ai-main` (2 crates) — structurally identical to Zen (Tauri app crate as
workspace root, crates under `src-tauri/crates/*`), and the useful negative
control.** It extracted only `terax-control-protocol` (167 lines of serde DTOs)
and `terax-cli` (717-line binary talking to the app over loopback TCP with a
token). Its selection rule is narrow: a crate exists only because two processes
must agree on a wire format. Its own `TERAX.md` states the same layering rule
this migration enforces — "new or changed logic lives in pure, dependency-light
functions (functional core); tauri commands and React components stay thin
(imperative shell)" — and then violates it routinely, because nothing checks:
`AppHandle` reaches deep domain functions (`secrets.rs` takes `&AppHandle`
merely to resolve a path), the tauri commands ARE the domain logic, events are
bare `app.emit("terax:…")` string literals with `Value` payloads, and modules
run past 1,200 lines in a 13,983-line app crate. That is the counterfactual for
this migration: a documented boundary with no compiler behind it. It offers no
precedent for Phase 10 (all its audio is webview MediaRecorder + HTTP Whisper,
zero Rust audio) or Phase 11 (its agent loop runs in JS via the Vercel AI SDK,
with tools calling `invoke()`).

**Where Zen already leads all three, and should not "improve":** none of them
generate TypeScript types from Rust (no ts-rs, specta, schemars, typeshare), and
none has a typed event contract. Zen's `AgentEvent` enum with a single
`event_name()` mapping (`src/agent/event_bus.rs`, ~line 710) leaving only 13
stringly-typed `.emit("…")` literals in the whole app crate, plus the
`event-snapshot` feature for payload diffing, serves R5 better than codegen
would. Do not add type generation.

**Phase entries changed by this survey:** Phase 10 prerequisite retired and dep
list corrected; Phase 11 prerequisite wording, split-target line counts, and the
rag/search edge decision; Phase 12 offender list; Phase 13 lint/manifest tasks;
Phase 14 shim inventory; Definition of Done items 1, 3, 4, 5, plus new items 6
and 7.

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
