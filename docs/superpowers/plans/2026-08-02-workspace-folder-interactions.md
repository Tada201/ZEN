# Workspace Folder Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users right-click workspace groups to move their visible chats into organization folders and drag chats or workspace groups onto folder rows.

**Architecture:** Keep workspace roots immutable and keep folders as the existing per-chat organization model. The sidebar will use the existing Radix context-menu primitives and native HTML5 drag/drop; group operations fan out through the existing typed per-chat `onMoveToFolder` callback, avoiding new backend schema or commands.

**Tech Stack:** React, TypeScript, Radix context menu, native `DataTransfer`, existing React Query mutations and verifier scripts.

---

### Task 1: Add regression contract checks

**Files:**
- Modify: `test/verify-session-workspace.mjs`

- [ ] Add checks that `SessionSidebar` exposes context-menu primitives for workspace groups, a move-to-folder action, draggable workspace/chat rows, folder drop handlers, and a no-folder/unfiled action where applicable.
- [ ] Run `node test/verify-session-workspace.mjs` and confirm the new checks fail because the current sidebar has none of these contracts.

### Task 2: Add typed sidebar drag/drop helpers and context menu wiring

**Files:**
- Modify: `src/atlas/components/chat/SessionSidebar.tsx`
- Modify: `src/components/ui/context-menu.tsx` only if an existing exported primitive is missing

- [ ] Import the existing context-menu primitives and define stable drag MIME constants plus helpers for chat IDs/group chat IDs.
- [ ] Add `onMoveChatsToFolder(chatIds, folderId)` that calls the existing `onMoveToFolder` for each ID, deduplicated and limited to the currently rendered group/session set.
- [ ] Make workspace group headers draggable and wrap them in a `ContextMenu` with a `Move to Folder` submenu populated from `folders`; include `Remove from folder` only where it is meaningful for selected chats.
- [ ] Make each folder row a drop target with drag-over visual state and drop handling for both single chat IDs and workspace group chat IDs.
- [ ] Make each visible session row draggable by extending `SessionSidebarItem` with an optional `onDragStart` callback or by wrapping the rendered row without changing its click behavior.
- [ ] Keep workspace rows immutable: context menus must not offer rename/change-workspace actions.
- [ ] Ensure menu item selection and drag/drop stop propagation so selecting a folder or opening chat actions does not select the underlying session.

### Task 3: Implement chat-row drag source

**Files:**
- Modify: `src/atlas/components/chat/SessionSidebarItem.tsx`
- Modify: `src/atlas/components/chat/SessionSidebar.tsx`

- [ ] Add `draggable` and `onDragStart` to normal session rows only, encoding the chat ID with the shared MIME constant.
- [ ] Preserve search-result rows as non-draggable or encode their resolved `chatId` consistently.
- [ ] Add a drag cursor/state class that remains accessible and does not interfere with the row's click selection.

### Task 4: Verify and build

**Files:**
- No additional source files unless verification exposes a concrete type error.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `node test/verify-session-workspace.mjs`.
- [ ] Run `node test/verify-codex-workspace-shell.mjs` and `node test/verify-session-isolation-and-timers.mjs`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] If the GUI runtime is available, manually verify right-clicking a workspace row, dragging a chat/group onto a folder, and observing folder counts and membership updates.
