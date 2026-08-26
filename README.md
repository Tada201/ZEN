# Zen

Zen is a local-first desktop agentic workbench for research, coding, and
workspace automation. It combines a dense chat workspace with permission-aware
tool execution, inspectable agent traces, document tools, artifacts, and optional
OpenUI/GenUI surfaces.

> **Maturity:** Zen is an active prototype/preview platform. The core chat,
tool, trace, and workspace paths are implemented and tested, while some advanced
visualization and runtime integrations remain under active development.

## What Zen provides

- **Agentic chat:** streaming text and reasoning with tool calls, approvals,
  errors, retries, pause/continue, cancellation, and recovery states.
- **Deterministic execution timeline:** live, completed, and reloaded assistant
  messages share one ordered timeline. Tool rows group only when they carry the
  same explicit execution batch identity.
- **Inspectable runs:** normalized execution traces, subagent delegation
  summaries, bounded result previews, and a dedicated Run Inspector.
- **Workspace tools:** local document listing/reading/search, file edits and
  patches, terminal execution, web research, image generation, and other
  permission-gated capabilities exposed through the canonical tool registry.
- **Rich responses:** standard Markdown, math, Mermaid, charts, trees, bounded
  rich cards, artifacts, and optional OpenUI/GenUI rendering.
- **Workbench UI:** responsive chat, compact execution cards, task planning,
  model/provider controls, right-panel inspectors, and a premium composer.

## Architecture

```text
React 19 + TypeScript + Vite + Tailwind CSS
        ↓ typed frontend API/event wrappers
Tauri 2 commands and event bus
        ↓
Rust agent runtime, tool permissions, providers, and services
        ↓
SQLite persistence + normalized execution traces + local runtime storage
```

### Frontend

The frontend lives under `src/` and uses React, TypeScript, Vite, Tailwind CSS,
Zustand for client/runtime state, and React Query for server state. IPC calls go
through typed wrappers in `src/api/`; components should not call raw Tauri
`invoke` directly.

### Backend

The Tauri backend lives under `src-tauri/` and is written in Rust. It is a Cargo
workspace: the `zen` app crate owns Tauri commands, host-bound services, and
leaf tool executors, while nine domain crates under `src-tauri/crates/` own the
agent loop, providers, tools, security policy, MCP, RAG, media runtimes, and
persistence. See the Workspace Crate Map in [RULES.md](RULES.md). SQL is isolated
under `src-tauri/crates/zen-db/src/queries/`.

### Message ordering and persistence

Assistant `steps` are the chronological rendering source of truth:

```text
reasoning → tool batch → text → next tool batch → reasoning → final text
```

The contract applies during streaming, after `chat:done`, and after reload:

- runtime text/reasoning rows are merged with execution rows by sequence;
- backend trace sequences are repaired to remain strictly increasing;
- `batchId`/`toolBatchId` is required to group different tools;
- a repeated tool ID may merge only as a lifecycle update for that tool;
- persisted normalized traces take precedence over legacy tool fields;
- legacy messages without ordered steps use a compatibility fallback.

The model prompt also enforces valid Markdown fences, raw JSON discipline for
structured blocks, chronological tool/result narration, and no fabricated or
duplicated final content.

## Getting started

### Prerequisites

- Node.js 22+
- npm
- Rust toolchain configured by `rust-toolchain.toml`
- Tauri desktop prerequisites for your platform

Install JavaScript dependencies:

```bash
npm install
```

Start the browser development server:

```bash
npm run dev
```

Start the Tauri desktop application:

```bash
npm run dev:tauri
```

Build the frontend:

```bash
npm run build
```

## Verification

Run the aggregate agentic workbench gate:

```bash
npm run test:agentic-workbench
```

The cross-layer ordering and prompt contract can be checked directly with:

```bash
npm run test:message-order-contract
npm run test:assistant-message-parts
npm run test:chat-reload-contract
npm run test:agent-runtime-reducer
npm run test:chat-runtime-bridge
npm run test:system-prompt-loading
npm run test:normalized-trace-storage-contract
npm run test:trace-persistence-contract
```

Run the broader feature test runner:

```bash
npm test
```

Run static/build checks:

```bash
npx tsc --noEmit
npm run build
cargo check --all-targets --manifest-path src-tauri/Cargo.toml
```

The CI workflow is currently manual-dispatch and includes frontend build/tests,
Rust clippy/tests, policy checks, runtime-binary validation, and dependency
checks. See `.github/workflows/ci.yml` before preparing a release.

## Project rules and documentation

Read these before making architectural changes:

- [`RULES.md`](RULES.md) — current architecture, security, layering, and testing rules
- [`docs/architecture/frontend-rules.md`](docs/architecture/frontend-rules.md) — frontend and chat rendering contract
- [`docs/architecture/agent-runtime-streaming.md`](docs/architecture/agent-runtime-streaming.md) — live runtime projection and streaming ownership
- [`docs/architecture/execution-trace-visual-contract.md`](docs/architecture/execution-trace-visual-contract.md) — execution-card and trace UX contract
- [`Plan_agentic-workbench-completion.md`](Plan_agentic-workbench-completion.md) — active workbench completion and QA record

## Repository hygiene

Do not commit secrets, local databases, generated bundles, runtime binaries, or
machine-specific state. Check `git status`, review the complete diff, run the
required verification gates, and stage only the intended files before creating a
commit. Do not push to a remote until the local review and CI checks are complete.
