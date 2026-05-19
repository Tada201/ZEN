# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Start Dev Environment**: `npm run tauri dev` (runs the interactive desktop app with hot-reloading).
- **Build**: `npm run build` (runs `tsc` and `vite build`).

### Backend (Rust/Tauri)
- **Run Tests**: `cargo test` in the `src-tauri` directory.
- **Run Backend**: Automatically started and managed by `npm run tauri dev`.

## Architecture

Zen is a high-fidelity OSINT data analysis platform built with:
- **Frontend**: React 19, Tailwind CSS 4, CesiumJS, and a custom design system called "UI Atlas".
- **Backend**: Rust (Axum/Tauri 2.0).

### Key Modules
- **`src-tauri/`**: Contains the Rust backend including:
  - `agent/`: Orchestration logic, tools, and swarm patterns.
  - `commands/`: Tauri commands for frontend-backend interaction.
  - `llm/`: LLM integrations (Anthropic, Ollama, OpenAI-compatible).
  - `rag/`: RAG pipeline and vector storage.
  - `canvas/`: 4D geospatial and drawing capabilities.
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
- **Initialization**: Use `InitState<T>` for Rust services.
