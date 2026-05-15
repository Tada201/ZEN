# Tasks: Integrated Workbench Shell — Chat Interface Gap Fill

**Input**: Design documents from `/specs/001-integrated-workbench/`
**Reference**: `EXAMPLE_NO_EDITS/artifacts/ui-atlas` (authoritative example)
**Scope**: Fill ALL missing chat interface features vs. the example. **IDE MODE excluded.**

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create project structure and port HSL tokens from `EXAMPLE_NO_EDITS/artifacts/ui-atlas` into `src/styles/index.css`
- [x] T002 [P] Initialize Zustand stores for UI and settings in `src/lib/stores/useUIStore.ts` and `src/lib/stores/useSettingsStore.ts`
- [x] T003 [P] Install `ai` (Vercel AI SDK), `lucide-react`, `framer-motion`, `cmdk`, `cesium`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Setup `AppShell` container in `src/components/workbench/AppShell.tsx` (Activity Bar + Sidebar + Main Area)
- [x] T005 [P] Create `cn` utility and theme/layout hooks in `src/lib/utils/style.ts` and `src/lib/hooks/useTheme.ts`

**Checkpoint**: Foundation ready - shell layout is established.

---

## Phase 3: User Story 3 — Agentic Chat Interface (Priority: P1) 🎯 MVP — COMPLETED

- [x] T006 [US3] Implement `useChat` hook integration in `src/lib/hooks/useAgentChat.ts`
- [x] T007 [US3] Create `ChatTimeline` component in `src/components/chat/ChatTimeline.tsx` using Vercel AI SDK `messages`
- [x] T008 [P] [US3] Create `ThoughtBlock` component with `premium-shimmer` animation in `src/components/chat/ThoughtBlock.tsx`
- [x] T009 [P] [US3] Create `ToolCallCard` for visual feedback of agent actions in `src/components/chat/ToolCallCard.tsx`
- [x] T010 [US3] Implement the "Unified Input" floating glass-panel input bar in `src/components/chat/UnifiedInput.tsx`
- [x] T011 [US3] Integrate `ChatTimeline` and `UnifiedInput` into the `MainArea.tsx`

---

## Phase 4: User Story 1 — Desktop Shell Initialization (Priority: P2) — COMPLETED

- [x] T012 [US1] Implement `ActivityBar` with HSL-themed icons and "rail" indicators in `src/components/atlas/ActivityBar.tsx`
- [x] T013 [US1] Implement `Sidebar` with collapsible/resizable state in `src/components/atlas/Sidebar.tsx`
- [x] T014 [US1] Implement the bottom `StatusBar` in `src/components/atlas/StatusBar.tsx`

---

## Phase 5: Chat Interface Gap Fill — Missing Features vs. Example

> **Scope**: All items below are derived from a direct code comparison between
> `EXAMPLE_NO_EDITS/artifacts/ui-atlas/src/atlas/components/chat/` and
> `src/components/chat/`. IDE MODE features are excluded.

**Goal**: Bring the main chat interface to full feature parity with the example.

**Independent Test**: Open chat, send a message, observe: reasoning blocks animate, tool calls expand with rich output, artifacts open in a slide-in panel with preview/code toggle, and the settings modal shows full provider configuration.

### Phase 5a: Type System Hardening

- [x] T020 [US3] Upgrade `Message` type in `src/components/chat/types.ts` to add missing fields: `sessionId`, `status`, `error`, `artifact`, `attachments`, `steps`, `generativeUI`, `webSearch`, `deepResearch`, `thinking`, `toolCalls` (non-optional array) matching the example schema exactly
- [x] T021 [P] [US3] Upgrade `ToolCall` type in `src/components/chat/types.ts` to add `retries` and `attempts` fields with attempt history schema
- [x] T022 [P] [US3] Add `PROVIDERS` constant array, `isOpenUILang` utility, and `Step` / `ThinkingConfig` types to `src/components/chat/types.ts`

### Phase 5b: Streaming Markdown Pipeline

- [x] T023 [US3] Create `src/components/chat/SmoothMarkdown.tsx` — typewriter-style streaming renderer with KaTeX math, remark-breaks, remark-gemoji, rehype-highlight, rehype-slug, organic speed variability, and code-block fast-path (port from `EXAMPLE_NO_EDITS/.../chat/SmoothMarkdown.tsx`)
- [x] T024 [P] [US3] Create `src/components/chat/MermaidDiagram.tsx` — real mermaid.js renderer with dark/light theme sync, streaming placeholder, and error fallback (port from `EXAMPLE_NO_EDITS/.../chat/MermaidDiagram.tsx`)
- [x] T025 [P] [US3] Create `src/components/chat/ChartBlock.tsx` — recharts-powered chart renderer supporting bar/line/area/pie types with streaming placeholder (port from `EXAMPLE_NO_EDITS/.../chat/ChartBlock.tsx`)
- [x] T026 [P] [US3] Create `src/components/chat/FileTree.tsx` — interactive collapsible file tree with ASCII-tree parser and folder/file icons (port from `EXAMPLE_NO_EDITS/.../chat/FileTree.tsx`)
- [x] T027 [US3] Upgrade `src/components/chat/MarkdownContent.tsx` to: replace placeholder renderers with real MermaidDiagram/ChartBlock/FileTree imports, integrate SmoothMarkdown, add alert blockquote rendering (`[!NOTE]` / `[!WARNING]` / etc.), add rich table, heading, link, code inline, hr, strong styling, and citation pill support (port from example)

### Phase 5c: Artifact Panel & Sandboxing

- [x] T028 [US3] Create `src/components/chat/SandboxedIframe.tsx` — sandbox iframe for HTML/SVG artifact previews with XSS protection (port from `EXAMPLE_NO_EDITS/.../components/SandboxedIframe.tsx`)
- [x] T029 [US3] Create `src/components/chat/ArtifactPanel.tsx` — full slide-in artifact panel with: preview/code toggle, copy, download (with mime-type map), OpenUIRenderer integration, SandboxedIframe for HTML/SVG, MarkdownContent for .md, type/language badge, tooltip actions, dropdown menu (port from `EXAMPLE_NO_EDITS/.../chat/ArtifactPanel.tsx`)

### Phase 5d: Message Rendering Upgrade

- [x] T030 [US3] Upgrade `src/components/chat/MessageItem.tsx` to add: interleaved `steps` rendering (text/reasoning/tool-call grouped), error message display with "Configure Provider" action button, inline artifact shortcut card, attachment display (images + file badges), copy/retry action bar on hover, `useCopy` hook from CodeBlock (port from example's MessageItem.tsx)
- [x] T031 [P] [US3] Upgrade `src/components/chat/ToolCallCard.tsx` to add: `isSports` / `isMap` detection, `SportsWidget` sub-component, `toast.success` clipboard feedback on copy, `durationMs` display in badge, `retries` counter, and `attempts` history display (sync with example's ToolCallCard.tsx)

### Phase 5e: Settings & Provider Management

- [x] T032 [US3] Create `src/components/chat/SettingsModal.tsx` — full tabbed settings modal (general, ai-config, providers, capabilities, system) wrapping ProviderSettingsContent, ModelSettingsContent, SkillsSettingsContent (port from `EXAMPLE_NO_EDITS/.../components/SettingsModal.tsx`)
- [x] T033 [P] [US3] Create `src/components/chat/ProviderSettingsContent.tsx` — full provider API key management UI with test connection, base URL override, default provider selection (port from example)
- [x] T034 [P] [US3] Create `src/components/chat/ModelSettingsContent.tsx` — model selector with provider filtering, capability badges, context window display (port from example)
- [x] T035 [P] [US3] Create `src/components/chat/SkillsSettingsContent.tsx` — skills/tools toggle management panel (port from example)

### Phase 5f: SessionSidebar Fix

- [x] T036 [US3] Fix prop name typo in `src/components/chat/SessionSidebar.tsx`: rename `_onClearAll` to `onClearAll` in the component interface to match the example signature; update `onClearAll` button handler accordingly

### Phase 5g: Chat Shell Integration

- [x] T037 [US3] Upgrade `src/components/workbench/MainArea.tsx` (or create `ChatSectionView.tsx`) to integrate: `SessionSidebar` with AnimatePresence slide animation, `ArtifactPanel` overlay, `SettingsModal`, sidebar open/close toggle button (matching the example's `ChatSection.tsx` layout)
- [x] T038 [P] [US3] Install missing npm packages for Smooth Markdown pipeline: `remark-math`, `rehype-katex`, `rehype-highlight`, `remark-breaks`, `remark-gemoji`, `remark-supersub`, `rehype-slug`, `rehype-autolink-headings`, `katex`, `highlight.js`, `mermaid`, `recharts`, `sonner` (if not already installed)

---

## Phase 6: User Story 2 — Dynamic 3D Visualization Pane (Priority: P2)

**Goal**: Integrate the Cesium 3D Globe as the spatial anchor.

- [ ] T039 [US2] Create `CesiumCanvas` component in `src/components/workbench/MapContainer.tsx`
- [ ] T040 [US2] Integrate `CesiumCanvas` as a background layer in `src/components/workbench/MainArea.tsx`
- [ ] T041 [US2] Handle map viewport resizing on sidebar toggle

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T042 [P] Implement `CommandPalette` (Cmd+K) in `src/components/atlas/CommandPalette.tsx`
- [ ] T043 [P] Apply final glassmorphism effects and vignetted dot grid in `src/styles/index.css`
- [ ] T044 [P] Add `onRetry` and `onOpenSettings` wiring through the full message → chat → settings call stack

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1–2)**: Complete ✅
- **Core Chat (Phase 3–4)**: Complete ✅
- **Gap Fill (Phase 5)**: Can begin immediately
  - **Phase 5a** (types) → blocks Phase 5b-g (must complete first)
  - **Phase 5b** (markdown) → can parallel with 5c, 5e
  - **Phase 5c** (artifacts) → depends on SmoothMarkdown (T027)
  - **Phase 5d** (messages) → depends on ArtifactPanel (T029) and MarkdownContent (T027)
  - **Phase 5e** (settings) → parallel with 5b-d
  - **Phase 5f** (sidebar fix) → independent, can start immediately
  - **Phase 5g** (integration) → depends on all 5a-f
- **Cesium (Phase 6)**: Can parallel with Phase 5
- **Polish (Phase 7)**: After Phase 5g complete

### Parallel Opportunities

- T020, T021, T022 can run in parallel (different type fields)
- T023, T024, T025, T026 can run in parallel (different files)
- T028, T032, T033, T034, T035, T036 can run in parallel
- T030, T031 can run in parallel

---

## Parallel Example: Phase 5 Gap Fill

```bash
# Step 1 — Types first (sequential):
T020 → T021 → T022

# Step 2 — After types, parallel batch:
T023 (SmoothMarkdown)
T024 (MermaidDiagram)
T025 (ChartBlock)
T026 (FileTree)
T028 (SandboxedIframe)
T032 (SettingsModal)
T033 (ProviderSettingsContent)
T034 (ModelSettingsContent)
T035 (SkillsSettingsContent)
T036 (SessionSidebar fix)
T038 (npm install)

# Step 3 — After batch above:
T027 (MarkdownContent upgrade — needs T023-T026)
T029 (ArtifactPanel — needs T028)
T031 (ToolCallCard upgrade)

# Step 4 — Final integration:
T030 (MessageItem upgrade — needs T027, T029)
T037 (Chat shell integration — needs all above)
```

---

## Implementation Strategy

### MVP Gap Fill (Phase 5 Only)

1. Complete T020–T022 (type hardening) **first** — blocks all else
2. Parallel batch: T023–T026, T028, T032–T036, T038
3. T027 (MarkdownContent), T029 (ArtifactPanel), T031 (ToolCallCard)
4. T030 (MessageItem), T037 (shell integration)
5. **VALIDATE**: Full chat session with streaming, tool calls, artifacts, settings

### Suggested MVP Scope (Quick Win)

1. T020-T022 (types) → T038 (install) → T023 (SmoothMarkdown) → T027 (MarkdownContent upgrade)
2. T028 (SandboxedIframe) → T029 (ArtifactPanel)
3. T030 (MessageItem) → T037 (shell integration)
4. Result: Streaming markdown + Artifacts working at Atlas quality level

---

## Notes

- **NEVER edit files in `EXAMPLE_NO_EDITS/`** — they are the read-only reference
- All ports should adapt `@/lib/utils` path aliases to `@/lib/utils/style`
- When porting `SettingsModal`, skip the IDE workspace panel (excluded from scope)
- `SmoothMarkdown` depends on: `mermaid`, `next-themes` (or equivalent `useTheme` from `@/lib/hooks/useTheme`)
- `ToolCallCard` in main uses `sonner` for toasts — ensure `sonner` is installed and `<Toaster/>` is in `App.tsx`
