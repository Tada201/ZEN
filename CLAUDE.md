# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Start Dev Environment**: `npm run dev:tauri` (runs the interactive desktop app with hot-reloading under the `com.zen.app.dev` identifier — fully isolated app data folder, separate from production installs).
- **Frontend-only Dev** (browser, no Tauri): `npm run dev` (Vite dev server only).
- **Build Frontend**: `npm run build` (runs `tsc` and `vite build`).
- **Build Desktop Installer** (MSI): `npm run build:tauri` (uses `tauri.conf.json` with `com.zen.app` identifier).

### Backend (Rust/Tauri)
- **Run Tests**: `cargo test --workspace` in `src-tauri`. On Windows this aborts with `STATUS_ENTRYPOINT_NOT_FOUND` on tauri-linked test binaries; locally run `cargo test -p <crate>` per crate plus `cargo check -p zen --all-targets`.
- **Run Backend**: Automatically started and managed by `npm run dev:tauri`.

### Dev vs Prod Isolation
The dev build uses `src-tauri/tauri.dev.conf.json` which overrides `identifier` to `com.zen.app.dev`. This means dev and prod never share:
- SQLite DB (`novus.db`)
- LanceDB vector store (`lancedb/`)
- OS keyring entries
- Tauri plugin data (notifications, dialog state, etc.)

Do NOT run `tauri build` directly without `--config` — use `npm run build:tauri`. Do NOT add `cfg!(debug_assertions)` branches for path isolation; identifier-based isolation already covers it.

## Architecture

Zen is a high-fidelity OSINT data analysis platform built with:
- **Frontend**: React 19, Tailwind CSS 4, CesiumJS, and a custom design system called "UI Atlas".
- **Backend**: Rust (Axum/Tauri 2.0).

### Key Modules
`src-tauri/` is a Cargo workspace: the `zen` app crate plus nine domain crates
under `src-tauri/crates/`. See RULES.md "Workspace Crate Map" for the full
ownership table and the two boundary rules (no `tauri`/`keyring` in crates;
resist adding code to the app crate).

- **`src-tauri/src/`** — the `zen` app crate: Tauri commands, app services
  (secrets/keyring, settings, checkpoints, terminal), leaf tool executors that
  need `AppHandle`, and window/tray wiring.
- **`src-tauri/crates/`** — `zen-core` (errors + ports), `zen-db` (all SQL),
  `zen-security` (risk/approval/audit/redaction), `zen-tools` (tool contracts +
  registry), `zen-llm` (providers + streaming), `zen-mcp`, `zen-rag`,
  `zen-media` (speech/TTS runtimes), `zen-agent` (runner, orchestrator, event
  bus, skills).
- **`src/`**: Contains the React frontend:
  - `atlas/`: High-fidelity UI components following the Atlas design system.
  - `components/chat/`: Agentic chat interface components.
  - `components/genui/`: Generative UI components.
  - `hooks/`: Custom React hooks for state and streaming (e.g., Vercel AI SDK).
  - `lib/`: Global stores and utilities.

## Rules

### Behavioral Guidelines
- **Think Before Coding**: Don't assume. Surface tradeoffs and assumptions. Ask if uncertain.
- **Simplicity First**: Minimum code that solves the problem. No speculative features or abstractions. If it's overcomplicated, simplify.
- **Surgical Changes**: Touch only what you must. Don't "improve" adjacent code unless related to the task. Clean up only your own orphans.
- **Goal-Driven Execution**: Define success criteria. Loop until verified. Plan multi-step tasks.

### Project Rules
- **Function over Form**: Prioritize utility and performance. Every unique animation or UI feature must serve a clear purpose.
- **Tauri v2 Invoke**: Frontend `invoke()` calls must use camelCase for parameters.
- **Component Design**: All components must follow the UI Atlas design system.
- **No Any**: Avoid using `any` in TypeScript code; use proper interfaces.
- **Initialization**: Use `zen_agent::init_state::InitState<T>` for Rust services.
