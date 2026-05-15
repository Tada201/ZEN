# Implementation Plan: Integrated Workbench Shell

**Branch**: `001-integrated-workbench` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-integrated-workbench/spec.md`. Priority shift: Start with the **Premium Chat UI** using Vercel AI SDK for frontend rendering.

## Summary
Rebuild the Zen application shell using a high-density IDE-inspired layout. **Priority is now on the Agentic Chat Interface**, using the **Vercel AI SDK (`ai`)** for conversation state and streaming. The UI will feature the "Atlas" premium aesthetic (glassmorphism, thought blocks, and unified input) while maintaining the structural workbench shell (Activity Bar, Sidebar).

## Technical Context

**Language/Version**: React 19 (TypeScript), Rust 1.75+ (Tauri 2.0)

**Primary Dependencies**: `ai` (Vercel AI SDK), `lucide-react`, `framer-motion`, `cesium`, `tailwindcss` (v4), `cmdk`

**Storage**: `Zustand` (UI State), `localStorage` (User Preferences)

**Testing**: `Vitest` (Frontend), `Cargo test` (Backend)

**Target Platform**: Desktop (Windows/macOS/Linux) via Tauri 2.0

**Project Type**: Desktop Application

**Performance Goals**: <1.5s UI initialization, 60 FPS map rotation, sub-50ms streaming UI updates.

**Constraints**: Must handle complex tool-calling and "Generative UI" components within the chat timeline.

## Constitution Check

*GATE: Passed. Starting with the Chat UI accelerates Principle III (Agentic GIS) and Principle V (Sovereign Operations - local reasoning).*

## Project Structure (Refined)

```text
src/
├── components/
│   ├── chat/            # [PRIORITY] Agentic chat components
│   │   ├── ChatTimeline.tsx    # Vercel AI SDK message list
│   │   ├── ThoughtBlock.tsx    # Reasoning shimmers
│   │   ├── UnifiedInput.tsx    # Floating glass input
│   │   └── ToolCallCard.tsx    # Visual feedback for tools
│   ├── atlas/           # High-fidelity shell components
│   │   ├── ActivityBar.tsx
│   │   ├── Sidebar.tsx
│   │   └── StatusBar.tsx
│   └── workbench/       # Layout orchestration
│       ├── AppShell.tsx
│       └── MapContainer.tsx
├── lib/
│   ├── stores/          # Zustand (useUIStore, useChatStore)
│   ├── hooks/           # useChat (Vercel SDK), useTheme
│   └── utils/           # styling (cn utility)
└── styles/
    └── index.css        # Unified HSL design system
```

**Structure Decision**: Port the `ai/react` hooks for client-side chat management. Since we are in Tauri, the backend LLM calls will be routed via Tauri `invoke()` commands or direct fetch (if allowed).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Custom Chat Rendering | High-fidelity OSINT requires specific "Thought Blocks" and telemetry tool cards | Standard chat libraries (like assistant-ui) might be harder to "vibe-code" to the exact Atlas spec than building on top of the Vercel AI SDK primitives |
