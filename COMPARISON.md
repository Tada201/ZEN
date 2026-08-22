# ZEN ↔ Codex Mockup Visual Parity Comparison

**Scope:** Live ZEN application compared one-to-one with:

- `EXAMPLE_NO_EDITS/codex-gpt_Ui-replica`
- `EXAMPLE_NO_EDITS/codex_ui design system`

**Audit date:** 2026-08-02  
**Status:** Read-only comparison; no application behavior was changed by this audit.

## How to read this document

- **Parity** — the ZEN surface and interaction are substantially replicated.
- **Partial** — the concept exists, but important visual or interaction details are missing.
- **Missing** — no equivalent first-class surface is currently visible in the active ZEN workspace.
- **Intentional difference** — ZEN deliberately chose another architecture or visual direction.

The reference projects are visual and interaction references only. ZEN remains the source of truth for runtime state, security, persistence, typed APIs, permissions, tools, workspace ownership, and Tauri integration.

---

## Executive summary

ZEN has already replicated the most difficult part of the Codex mockup: the live execution experience. Its tool cards, reasoning blocks, subagent cards, approval flow, streaming reconciliation, and workbench architecture are at or beyond the mockup in several areas.

The largest remaining gaps are surrounding product chrome and workflow packaging:

1. Codex-style status-bar telemetry
2. A unified goal/task brief surface
3. Rich composer triggers and autocomplete
4. Visible queued-message workflow
5. Session resume/history picker
6. Session-level checkpoint timeline
7. Dedicated review/diff workbench
8. Mobile workbench sheet behavior
9. MCP tool/app presentation
10. Browser action/event log
11. Project/date grouping and sorting controls
12. Consistent tight blue/charcoal/4px styling across the workbench

The recommended direction is not a rewrite. Keep ZEN’s production architecture and apply the Codex visual and interaction language selectively to the chat/workbench region.

---

## Overall parity matrix

| Area | Status | Live ZEN owner(s) |
|---|---|---|
| Three-pane workspace shell | **Parity** | `src/atlas/sections/WorkspaceSection.tsx`, `src/atlas/layouts/WorkspaceLayout.tsx` |
| Resizable sidebar/right panel | **Parity** | `WorkspaceLayout.tsx`, `RightPanel.tsx` |
| Mobile workspace behavior | **Partial** | `WorkspaceLayout.tsx`, `WorkspaceSection.tsx` |
| Chat transcript | **Parity / stronger runtime** | `MessageItem.tsx`, `AssistantMessage.tsx`, `MessageList.tsx` |
| Execution and tool cards | **Parity / stronger runtime** | `AgentExecutionTrace.tsx`, `ToolCallCard.tsx`, `ExecutionRow.tsx` |
| Approval workflows | **Parity / stronger safety model** | `ApprovalCenter.tsx`, `toolsApi.ts` |
| File explorer | **Partial** | `src/atlas/components/workspace/FileExplorer.tsx` |
| Diff/review presentation | **Partial** | `DiffCard.tsx`, `parseUnifiedDiff.ts` |
| Terminal | **Parity** | `XTermPanel.tsx`, `XTermSessionView.tsx` |
| Browser preview | **Partial** | `BrowserPreview.tsx` |
| Agent/subagent activity | **Parity / stronger backend integration** | `agentActivityStore.ts`, `OrchestratorPanel.tsx`, `SubagentExecutionCard.tsx` |
| Context header | **Partial** | `WorkspaceContextHeader.tsx` |
| Composer | **Partial** | `PremiumChatInput.tsx`, `chat/input/*` |
| Status bar | **Missing important Codex information** | `src/components/Zen/StatusBar.tsx` |
| Command palette | **Parity** | `src/atlas/CommandPalette.tsx` |
| Thread/session history | **Partial** | `SessionSidebar.tsx`, chat query hooks |
| Checkpoints and time travel | **Partial / missing first-class UI** | `ToolCallCard.tsx`, `toolsApi.ts` |
| Queued messages | **Missing as a visible workflow** | No first-class equivalent identified |
| MCP tool cards | **Partial** | MCP settings/API plus generic tool cards |
| MCP embedded app frame | **Missing** | No equivalent `McpAppFrame` identified |
| Usage/token telemetry | **Partial** | Provider usage/context-related surfaces |
| Goal/brief/task header | **Missing or distributed** | `AssistantTaskPlanPreview.tsx`, `TaskDrawer.tsx` |
| Codex visual language | **Partial / intentional hybrid** | `src/styles/index.css`, workbench components |
| Accessibility foundations | **Parity / often stronger** | Radix primitives, ARIA contracts, reduced-motion hooks |

---

# 1. App shell and layout

## Codex mockup

The active mockup composes:

```text
WorkspacePage
├── WorkspaceSidebar
├── TaskHeader
├── TaskTimeline
├── TaskComposer
├── ContextPanel
├── StatusBar
└── CommandPalette
```

It uses:

- Resizable left sidebar
- Resizable context/right panel
- Main conversation surface
- Persistent task header
- Context-panel toggle
- Desktop and mobile layout variants

Relevant mockup files include:

- `src/app/WorkspacePage.jsx`
- `src/app/layoutConstraints.js`
- `src/features/workspace/WorkspaceSidebar.jsx`
- `src/features/workspace/TaskHeader.jsx`
- `src/features/chat/TaskTimeline.jsx`
- `src/features/chat/TaskComposer.jsx`
- `src/features/context/ContextPanel.jsx`

## ZEN

Relevant implementation:

- `src/atlas/sections/WorkspaceSection.tsx`
- `src/atlas/layouts/WorkspaceLayout.tsx`
- `src/atlas/components/RightPanel.tsx`
- `src/components/workbench/ZenTitleBar.tsx`
- `src/components/workbench/WorkbenchHeader.tsx`
- `src/components/Zen/SecondaryActivityBar.tsx`

### Result: **Parity**

ZEN has the same core shell and improves it with:

- Native Tauri title-bar controls
- Persisted right-panel width
- Backend-persisted workbench tabs
- Drag/reorder/close behavior
- Lazy loading for heavy panels
- Feature-gated workbench registration
- Workspace-root ownership

### Difference in layout strategy

The mockup uses percentage-based panel constraints:

- Sidebar default: approximately 18%
- Context panel default: approximately 26%
- Main panel minimum: approximately 30%

ZEN uses fixed/chrome-oriented dimensions:

- Sidebar: 260px
- Collapsed rail: 48px
- Right panel default: 320px
- Right panel minimum: 240px
- Right panel maximum: 60% viewport width

This is not necessarily a defect. ZEN’s fixed widths are predictable for a desktop coding application and are already represented by shared constants in `src/lib/constants/design.ts`.

---

# 2. Left sidebar and session navigation

## Codex mockup includes

- Codex brand mark
- New task button
- Chats
- Scheduled automations
- Skills
- Archived sessions
- Search
- Grouping by project/date
- Sort by updated/created/status/name
- Session count badges
- Collapsible project/date groups
- Settings footer

Relevant mockup surfaces:

- `src/features/workspace/WorkspaceSidebar.jsx`
- `src/features/workspace/SessionRow.jsx`
- `src/features/workspace/WorkspacePicker.jsx`

## ZEN includes

- `src/atlas/components/chat/SessionSidebar.tsx`
- `src/atlas/components/chat/SessionSidebarItem.tsx`

ZEN has:

- New chat
- Search
- Pinned chats
- Archived chats
- Folders
- Workspace-root groups
- Folder rename/delete/move
- Session actions
- Relative timestamps
- Current-session auto-expansion
- Search result rendering
- Settings access

### Result: **Partial parity, with different organization**

ZEN has more workspace-oriented grouping. The mockup has more navigation-oriented grouping and filtering.

## Remaining differences

### 2.1 Project/date grouping controls

The mockup explicitly lets users change:

- Group by project
- Group by date
- Sort by last updated
- Sort by created
- Sort by status
- Sort by name

ZEN primarily groups by:

- Workspace root
- Folder
- Pinned
- Search result

**Opportunity:** Add a compact grouping/sort control modeled on the mockup’s `ArrowDownUp` menu.

### 2.2 Scheduled and skills as first-class sidebar destinations

ZEN has skills and settings infrastructure, but they are not presented in the same always-visible navigation hierarchy as the mockup.

**Opportunity:** Add optional sidebar destinations for:

- Skills
- Scheduled runs
- Archived chats

Use ZEN’s feature registry rather than hard-coded navigation.

### 2.3 Sidebar footer hierarchy

The mockup has a clear bottom utility area for settings and product-level navigation. ZEN’s sidebar is more session-centric.

**Opportunity:** Add a visually separated footer with settings, skills, workspace status, and optional scheduled runs.

---

# 3. Top/context header

## Codex mockup includes

The mockup’s `TaskHeader` has:

- Sidebar toggle
- Editable task title
- Status badge
- Target/project label
- Git branch
- Worktree path
- Stop button while running
- Context-panel toggle
- Retry button
- More menu
- Rename/delete

## ZEN includes

`src/atlas/components/chat/WorkspaceContextHeader.tsx` has:

- Back/forward navigation
- Session title
- New chat
- Workspace-root lock
- Rename
- Pin
- Archive
- Export
- Copy workspace path
- Execution indicator
- Security boundary indicator
- Open workbench button

### Result: **Partial parity**

ZEN is stronger on workspace security, session identity, backend session actions, and approval/agent visibility.

ZEN is missing or less explicit on:

- Git branch display
- Worktree display
- Status badge as a primary header element
- Retry at the header level
- Target/project metadata
- Stop action directly in the header

Some of these may exist elsewhere in the chat/composer flow, but they are not visually equivalent to the mockup’s persistent task header.

## Recommended improvement

Add a compact metadata strip beside the session title:

```text
[Session title] [workspace] [branch] [running/complete/error]
```

Use:

- Git icon + branch
- Workspace icon + project name
- Status dot/badge
- Duration or run state

Do not move model/provider controls into this header. ZEN correctly keeps those in the composer to avoid duplicate sources of truth.

---

# 4. Main chat transcript

## Codex mockup includes

- Markdown messages
- User/assistant blocks
- Thought blocks
- Todo blocks
- Shell blocks
- Browser blocks
- Web-search blocks
- MCP tool blocks
- Subagent indicators
- Streaming text
- Task timeline

Relevant mockup files include:

- `src/components/chat/MarkdownMessage.jsx`
- `src/components/chat/ThoughtBlock.jsx`
- `src/components/chat/TodoBlock.jsx`
- `src/components/chat/ShellBlock.jsx`
- `src/components/chat/BrowserBlock.jsx`
- `src/components/chat/WebSearchBlock.jsx`
- `src/components/chat/McpToolCallBlock.jsx`
- `src/features/chat/TaskTimeline.jsx`

## ZEN includes

- `src/atlas/components/chat/MessageItem.tsx`
- `src/atlas/components/chat/AssistantMessage.tsx`
- `src/atlas/components/chat/UserMessage.tsx`
- `src/atlas/components/chat/MarkdownContent.tsx`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/AssistantMessageTrace.tsx`
- `src/atlas/components/chat/ReasoningBlock.tsx`
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/SubagentExecutionCard.tsx`
- `src/atlas/components/chat/DeepResearchMessage.tsx`
- `src/atlas/components/chat/ResearchTimeline.tsx`
- `src/atlas/components/chat/input/TaskChecklistPanel.tsx`

### Result: **Parity, with stronger production behavior**

ZEN has the mockup equivalents, but often under different names and with more complete persistence and stream reconciliation.

ZEN’s advantages include:

- Actual backend event routing
- Reload survivability
- Tool-call deduplication
- Approval persistence
- Subagent identity isolation
- Error/retry handling
- Redaction of sensitive tool data
- Execution disclosure lifecycle tests

---

# 5. Execution and tool cards

## Codex mockup visual behavior

The mockup’s cards typically show:

- Compact icon/status row
- Tool name
- Target or command
- Duration
- Exit status
- Expand/collapse
- Output
- Copy action
- Error styling
- Streaming caret/output
- Specialized card types

## ZEN

Relevant files:

- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/SubagentExecutionCard.tsx`
- `src/atlas/components/chat/tool/ExecutionRow.tsx`
- `src/components/ui/fold-out-card.tsx`
- `src/atlas/components/chat/ReasoningBlock.tsx`

ZEN already has:

- Compact action summaries
- Running/approval/error/completed statuses
- Status-colored indicators
- Duration
- Mono metadata
- Expand/collapse
- Tool output previews
- Technical details
- Copy
- Retry
- Approve/deny
- Recovery checkpoint
- Undo
- Subagent nesting
- Bare mode to avoid double foldout headers
- Reduced-motion support

### Result: **Parity / stronger than mockup**

This is the area ZEN has replicated most successfully.

The live CSS explicitly establishes Codex-style execution tokens in `src/styles/index.css`:

```css
--codex-bg: #1a1a1a;
--codex-surface: #242424;
--codex-surface-muted: #2d2d2d;
--codex-border: #333333;
--codex-blue: #4f90f8;
--codex-add: #3fb950;
--codex-remove: #f85149;
--codex-warning: #d29922;
--codex-radius: 4px;
```

### Remaining difference

Some execution surfaces still use ZEN’s broader semantic theme tokens and rounded/card language rather than the mockup’s consistently tight 4px charcoal treatment.

This creates a mixed visual system:

- Some cards look Codex-like.
- Other cards look like general ZEN/shadcn cards.
- Some surfaces use glass/translucent treatment.
- Others use solid execution surfaces.

**Opportunity:** Limit strict Codex treatment to execution cards, tool output, terminal, diff/review, and workbench chrome. Keep the broader ZEN theme for settings, Atlas/demo surfaces, generative UI, maps, and canvas.

---

# 6. Reasoning/thought blocks

## Codex mockup

`ThoughtBlock` uses:

- Gray/italic thought text
- Brain icon
- Duration
- Role tint
- Indented vertical border
- Collapsible content

## ZEN

`src/atlas/components/chat/ReasoningBlock.tsx` includes:

- Thinking/completed states
- Duration
- Note count
- Live/complete indicator
- Collapsible content
- Mono rendering
- Markdown/math after completion
- Deferred parsing during streaming
- Reduced-motion behavior
- Persistent user-controlled disclosure

### Result: **Parity / stronger**

ZEN’s reasoning block is more technically sophisticated and better aligned with streaming performance requirements.

---

# 7. Todo/task UI

## Codex mockup

- `TodoBlock`
- Checklist progress
- Completed and pending states
- Progress count
- Collapsible item list
- Dedicated task/todo visual language

## ZEN

Relevant files:

- `src/atlas/components/chat/AssistantTaskPlanPreview.tsx`
- `src/atlas/components/chat/input/TaskChecklistPanel.tsx`
- `src/atlas/components/chat/input/TaskDrawer.tsx`
- `src/lib/stores/taskStore.ts`
- Todo/tool renderers

### Result: **Partial parity**

ZEN has task/checklist data and UI, but the mockup’s task presentation is more consistently integrated into the transcript as a first-class visual block.

Tasks may appear as drawers, cards, or tool-specific renderers rather than one recognizable task block. The initial task objective is not always presented with the same visual prominence as the mockup’s `GoalCard`/`TaskBrief`.

**Opportunity:** Add one canonical transcript-level task block with:

- Objective
- Progress
- Active step
- Completed count
- Expand/collapse
- Current agent status

---

# 8. Goal card and task brief

## Codex mockup

The mockup visually establishes the task at the start of a run with:

- Goal/objective
- Target project
- Task brief
- Run status
- Context before execution begins

## ZEN

Related pieces exist in:

- Task drawer
- Task plan preview
- Checklist panel
- Workspace context header
- Execution indicator

### Result: **Missing as a unified visual surface**

ZEN distributes this information across several surfaces instead of presenting one strong task-introduction block.

**Opportunity:** Add a compact `TaskBrief`-style card at the start of an agent run, only when relevant:

```text
Task
Refactor authentication flow

Workspace
ZEN

Plan
3 steps · 1 running · 0 blocked
```

This would improve visual hierarchy without changing runtime behavior.

---

# 9. Composer/input

## Codex mockup/design system

The reference composer includes:

- Large bordered input card
- File attachment chips
- `@` file mentions
- `/` tool/skill commands
- Model selector
- Mode/persona/approval controls
- Send/stop toggle
- Markdown hint
- Keyboard shortcut
- Security note
- Auto-resizing input
- Composer token parsing

The design-system composer also includes:

- Skill picker
- Attachment summary
- Markdown hint
- `⌘ Enter` shortcut affordance
- Send/stop toggle
- Footer note: “Workspace files stay in the sandbox”

## ZEN

`src/atlas/components/PremiumChatInput.tsx` includes:

- Auto-resizing textarea
- File attachments
- Model selector
- Thinking
- Reasoning effort/budget
- Deep research
- Web search
- Generative UI
- Image generation
- Slash command popover
- Skill commands
- Suggested prompts
- Pinned action pills
- Task drawer
- Send/stop behavior
- Streaming shimmer

### Result: **Partial parity**

ZEN has more capabilities, but it does not yet mirror the Codex mockup’s composer semantics exactly.

## Missing or partial details

### 9.1 Rich `@` file autocomplete

ZEN has attachments and file-explorer infrastructure, but not the same inline `@file` mention experience.

### 9.2 Rich `!` command autocomplete

No clear first-class `!` command trigger equivalent was found.

### 9.3 Rich `$` skill/tool autocomplete

ZEN has slash commands and skills, but not the same `$` trigger convention.

### 9.4 Security note in composer

ZEN has `SecurityBoundarySummary` in the header, but not an equivalent persistent composer footer note.

### 9.5 Markdown/shortcut hint

The reference composer exposes keyboard affordances such as `⌘ Enter`. ZEN’s composer behavior may support shortcuts, but the visual hint is not consistently present.

### Recommended priority

**P0/P1.** The composer is one of the most visible surfaces and the clearest remaining opportunity for direct Codex parity.

---

# 10. Right-panel/context views

## Codex mockup context panel

The mockup has dedicated context views for:

- Files
- Diff
- Review
- Terminal
- Browser
- Activity
- Agents
- Side chat
- Usage

## ZEN workbench

`src/atlas/components/RightPanel.tsx` currently registers:

- Metrics
- Approvals
- Artifacts
- Agents
- Drawing
- Terminal
- Operational map

### Result: **Partial parity**

ZEN has functional equivalents for terminal, files/artifacts, agents, activity/metrics, approvals, map, and canvas. The navigation model differs:

- Codex mockup: fixed context-view collection
- ZEN: registry-driven, backend-persisted workbench tabs

ZEN’s model is more extensible and should remain authoritative.

## Specific gaps

### Files — **Partial**

`src/atlas/components/workspace/FileExplorer.tsx` exists, but it does not appear as a primary registered workbench tab in the inspected `RightPanel` registry.

### Diff/review — **Partial**

`src/atlas/components/genui/premium/DiffCard.tsx` exists and renders diffs inline, but a dedicated persistent review/diff workbench view is not equivalent to the mockup’s `DiffView` and `ReviewView`.

### Activity — **Partial**

ZEN has `agentActivityStore`, activity synchronization, the secondary activity bar, and the orchestrator panel. It does not visually match the mockup’s dedicated activity tray/status treatment.

### Side chat — **Missing or partial**

The mockup has a dedicated `SideChatView`. No clearly equivalent first-class side-chat workbench tab was identified in ZEN.

### Usage — **Partial**

ZEN has provider usage/settings surfaces, but the mockup’s `UsageDashboard` and design system’s token budget meter are not represented as a persistent context view.

---

# 11. Terminal

## Codex mockup

- Xterm-like terminal view
- Persistent context-panel tab
- Shell execution blocks
- Status/duration/output treatment

## ZEN

- `src/components/Zen/XTermPanel.tsx`
- `src/components/Zen/XTermSessionView.tsx`
- `src/components/Zen/XTermStatusFooter.tsx`
- `src/components/Zen/XTermTelemetryDrawer.tsx`
- Terminal approval API
- Repeatable terminal tab IDs
- Per-session terminal behavior

### Result: **Parity / stronger**

ZEN has a more mature terminal lifecycle and approval boundary.

Remaining visual parity opportunity:

- Align terminal toolbar spacing, tab treatment, and status metadata more tightly with the mockup’s compact charcoal style.
- Ensure terminal remains mounted when hidden if buffer persistence is required.

---

# 12. Browser preview

## Codex mockup

The browser block/view includes:

- URL bar
- Loading state
- Browser action count
- Screenshot/viewport
- Action log
- Navigation state
- Browser history

## ZEN

`src/atlas/components/workspace/BrowserPreview.tsx` includes:

- Back/forward
- Reload
- Home
- URL input
- HTTPS lock/shield
- External open
- Menu
- Loading overlay
- Sandboxed iframe
- Local history

### Result: **Partial parity**

ZEN’s browser shell is visually similar, but missing the mockup’s automation-oriented presentation:

- Action log
- Click/type/navigate/resize events
- Screenshot captions
- Step count
- Agent-controlled browser timeline

ZEN’s `BrowserPreview` is currently closer to a generic embedded browser than a Codex browser-task surface.

**Opportunity:** Add an optional lower action-log drawer:

```text
navigate → click → type → screenshot
```

This should be driven by actual browser events, not mocked state.

---

# 13. File explorer

## Codex mockup

- Project tree
- File selection
- Context-panel view
- Directory hierarchy
- Current project/worktree context

## ZEN

`src/atlas/components/workspace/FileExplorer.tsx` includes:

- Lazy folder loading
- Folder/file icons
- Expand/collapse
- Refresh
- File click callback
- Empty state
- Workspace-root guidance

### Result: **Partial parity**

The tree behavior is present. The missing parity is primarily composition and polish:

- It is not clearly a primary workbench view.
- File type iconography is minimal.
- No visible selected-file state was found.
- No file search/filter bar.
- No context menu/actions.
- No open-file/editor/review handoff in the tree itself.
- No branch/change indicators.

**Opportunity:** Promote it into the workbench registry and add selected-file state, search/filter, Git status badges, and open-in-editor/review actions.

---

# 14. Diff and review

## Codex mockup/design system

- Dedicated diff viewer
- Review view
- Added/removed line colors
- Hunk headers
- File-level actions
- Review/approval workflow
- Git action bar

## ZEN

- `src/atlas/components/genui/premium/DiffCard.tsx`
- `src/atlas/components/chat/tool/parseUnifiedDiff.ts`
- Tool detail diff rendering
- File tree
- Tool checkpoint/undo

### Result: **Partial parity**

ZEN has excellent inline diff rendering but lacks a clearly equivalent dedicated review workspace.

The mockup’s visual workflow is:

```text
file changed → inspect diff → review → approve/apply/reject
```

ZEN’s current workflow is closer to:

```text
tool completed → inspect inline diff → optionally undo
```

**Opportunity:** Add a review surface with:

- Changed-file list
- File/hunk navigation
- Added/deleted counters
- Review state
- Apply/reject/undo actions
- Checkpoint status
- “Open in chat” link

---

# 15. Approvals and permissions

## Codex mockup

- Permissions settings
- MCP approvals
- Approval modes
- Permission state visibility

## ZEN

`src/atlas/components/chat/right-panel/ApprovalCenter.tsx` includes:

- Pending action count
- Risk level
- Redacted argument preview
- Description
- Technical details
- Deny
- Approve once
- Remember exact
- Open originating chat
- Backend-owned permission resolution

### Result: **Parity / stronger**

ZEN is more complete and more security-conscious.

The remaining visual difference is that ZEN’s approval treatment is more generic shadcn/card-like, while the design system has more specialized approval prompt cards.

**Opportunity:** Borrow the design-system approval hierarchy:

- Action category
- Risk explanation
- Scope
- Exact permission being granted
- Allow once / always / deny emphasis
- Originating workspace
- Originating agent

---

# 16. Checkpoints, undo, and time travel

## Codex mockup/design system

- `CheckpointBar`
- Inspect snapshots
- Branch from checkpoint
- Rollback
- Session resume
- Timeline scrubber

## ZEN

ZEN has backend/tool checkpoint support:

- `toolsApi.getToolCheckpoint`
- `toolsApi.undoToolCall`
- Recovery checkpoint display in `ToolCallCard`
- Undo conflict handling
- Tool output checkpoint parsing
- Timeline persistence and replay

### Result: **Partial parity**

ZEN has the underlying recovery capability, but not the first-class visual checkpoint timeline.

The main difference is:

- ZEN: checkpoint appears inside an individual completed tool card
- Codex design system: checkpoint/history is a session-level navigation surface

**Opportunity:** Add a session-level checkpoint bar or history rail.

This is one of the largest remaining workflow/visual gaps because the capability already exists underneath.

---

# 17. Session resume and thread history

## Codex design system

- Searchable thread history
- Session resume picker
- Keyboard-friendly dialog
- Grouped sessions
- Resume previous run
- Command shortcut

## ZEN

ZEN has:

- Session sidebar
- Search results
- Navigation back/forward
- Session persistence
- Chat history query hooks
- Archived chats
- Workspace grouping

### Result: **Partial parity**

ZEN supports finding and opening sessions, but lacks a dedicated resume/history workflow matching the design-system surface.

Missing visual patterns:

- “Resume session” dialog
- Searchable history modal
- Previous run metadata
- Last checkpoint/status
- Keyboard shortcut presentation
- Recent versus archived grouping inside one picker

---

# 18. Queued messages

## Codex mockup

`QueuedMessages` provides a visible workflow for messages submitted while the agent is busy.

Expected behavior:

- User can continue composing
- Pending messages are shown
- Queue order is visible
- User can remove/reorder/edit queued messages
- Streaming state remains clear

## ZEN

ZEN has streaming input and stop/send behavior, but no clearly equivalent first-class queued-message strip or queue manager was found.

### Result: **Missing**

This is a meaningful functional and visual gap for long-running agents.

**Opportunity:** Add a compact queue above the composer:

```text
Queued while agent is working
1. Update the tests
2. Then review the diff
```

Include remove, edit, send next, queue count, and clear queue actions.

---

# 19. Status bar

## Codex mockup

The status bar shows:

- Workspace path
- Git branch
- Current model
- Activity tray
- Sleep prevention state
- Approval mode
- Online/offline state
- Theme control

## ZEN

`src/components/Zen/StatusBar.tsx` currently shows:

- Development warning
- ZEN version
- Date
- Time

### Result: **Significant gap**

ZEN’s status bar is visually present but functionally much less informative.

Missing parity:

- Workspace path
- Branch
- Model/provider
- Approval mode
- Network/provider state
- Sleep-prevention status
- Activity count
- Context/token usage
- Theme/appearance shortcut

### Priority: **P0/P1**

This is one of the clearest surfaces where the mockup has more useful frontend information than ZEN.

Recommended structure:

```text
[workspace] [branch] [model]                  [approval] [activity] [context] [online]
```

Keep the version/dev-build indicator in a lower-priority tooltip or settings area rather than dominating the status bar.

---

# 20. Token/context telemetry

## Codex design system

The context header includes:

- Token budget meter
- Cached research indicator
- Model selector
- Effort selector
- Thread metadata

## ZEN

ZEN has context and usage-related infrastructure:

- Context viewer concepts
- Provider usage panels
- Reasoning budget controls
- Model selector
- Thinking budget
- Execution status
- Right-panel metrics

### Result: **Partial parity**

The controls exist, but the mockup/design-system treatment is more immediate and unified.

Missing or inconsistent:

- Always-visible token budget meter
- Clear context utilization bar
- Cached research indicator
- Effort level in context header
- Unified run budget summary

**Opportunity:** Add a compact context meter to `WorkspaceContextHeader` or `WorkbenchHeaderCore`, with a clickable detail popover.

---

# 21. MCP UI

## Codex mockup

- MCP tool-call block
- MCP server/tool identity
- Arguments viewer
- Result/error output
- Approval status
- MCP settings/server management

## ZEN

ZEN has:

- `src/components/settings/Tabs/plugins/MCPSettings.tsx`
- `src/components/settings/Tabs/plugins/MCPExternalServers.tsx`
- `src/api/mcpApi.ts`
- MCP configuration and server management
- Tool approval integration

### Result: **Partial parity**

ZEN has the configuration and protocol layer. What is missing is the consistent inline visual treatment:

- Dedicated MCP tool block
- Server name
- Tool name
- Invocation arguments
- Result/error panel
- Copy action
- Permission state
- Retry/reconnect status

## MCP embedded app frame

The design system includes `McpAppFrame`, with:

- Sandboxed iframe
- Toolbar
- Loading state
- Error state
- Retry
- Connected app surface

### Result: **Missing**

ZEN has sandboxed iframe infrastructure in places, but no equivalent MCP-specific app frame was identified.

This should be implemented only with ZEN-owned security/origin/capability rules.

---

# 22. Responsive/mobile behavior

## Codex design system

- Desktop uses resizable panels
- Mobile swaps panels for sheets/drawers
- Context panel becomes an overlay
- Workspace/sidebar controls adapt
- Composer remains usable in narrow widths

## ZEN

`src/atlas/layouts/WorkspaceLayout.tsx` has:

- Mobile breakpoint at 767px
- Sidebar overlay
- Backdrop
- Mobile sidebar width `min(82vw, 260px)`
- Right panel hidden on mobile
- Main area remains mounted
- Right-panel width persistence on desktop

### Result: **Partial parity**

ZEN has mobile sidebar behavior, but the right-panel behavior is less equivalent:

- The right workbench is effectively hidden on mobile instead of becoming a mobile sheet.
- Some desktop-oriented controls may not have mobile alternatives.
- The workbench tab model is not visibly represented as a mobile drawer/sheet.

### Opportunity

Borrow the design system’s mobile workspace pattern:

- Open workbench as a bottom/right sheet
- Preserve active tab
- Provide mobile-specific close/back navigation
- Keep terminal/artifacts usable on narrow screens
- Ensure the composer does not become obscured by overlays

---

# 23. Typography and visual language

## Codex mockup/design system

Primary visual language:

- Charcoal surfaces
- Blue primary
- Tight 4px radius
- Geist / Geist Mono
- Solid structural surfaces
- Thin gray borders
- Low shadow usage
- Dense developer-tool spacing
- Compact metadata
- Flat panel hierarchy

Reference values:

```text
Background: #1a1a1a
Card:       #242424
Muted:      #2d2d2d
Border:     #333333
Primary:    #4f90f8
Added:      #3fb950
Removed:    #f85149
Warning:    #d29922
Radius:     4px
```

## ZEN visual language

`src/styles/index.css` uses:

- Semantic HSL tokens
- Purple primary by default
- Base radius `0.5rem` / 8px
- Inter/Geist fallback
- Glass panels
- Radial gradients
- Vignette grids
- Premium shimmer/fade animations
- Theme presets
- Codex-specific execution aliases

### Result: **Partial parity by design**

ZEN has deliberately expanded beyond the mockup’s strict visual system.

## Main divergences

### 23.1 Primary accent

- Mockup: blue `#4f90f8`
- ZEN: purple primary by default

This is the most visible color difference.

### 23.2 Radius

- Mockup/design system: 4px
- ZEN global: 8px
- ZEN execution cards: approximately 6px
- Some controls: rounded-xl/rounded-2xl

### 23.3 Surfaces

- Mockup: solid surfaces
- ZEN: solid execution surfaces plus glass/translucent UI

### 23.4 Typography

- Mockup: Geist/Geist Mono
- ZEN: Inter/Geist fallback plus JetBrains/Cascadia/Source Code Pro

### 23.5 Density

- Mockup: dense, compact, IDE-like
- ZEN: mixed density; some execution surfaces are compact, while broader UI uses more spacious rounded cards

## Recommendation

Do not globally replace ZEN’s theme. Establish two explicit visual zones:

### Codex Workbench zone

Use strict Codex tokens for:

- Chat execution ledger
- Tool cards
- Terminal
- Diff/review
- Context/workbench tabs
- Status bar
- Workspace context header

### ZEN product zone

Retain ZEN’s broader language for:

- Settings
- Atlas
- Generative UI
- Maps
- Canvas
- Premium feature surfaces
- Onboarding/boot screens

This gives ZEN visual coherence without removing its product identity.

---

# 24. Motion and micro-interactions

## Existing ZEN strengths

ZEN already has:

- Framer Motion panel transitions
- Tab transitions
- Loading fallback animation
- Shimmer during streaming
- Disclosure chevron transitions
- Reduced-motion hooks
- `prefers-reduced-motion` handling
- Press feedback
- Selected tab indicators
- Map activation transition
- Boot sequence motion
- Skeleton loading

### Result: **Parity / often stronger**

## Remaining visual mismatch

The mockup’s motion is generally:

- Short
- Subtle
- Structural
- Focused on pane transitions and disclosure

ZEN has additional premium/glass/shimmer effects that can make some areas feel more decorative than Codex.

Recommended rule:

- Keep motion for state change and progress.
- Avoid shimmer/glow on static workbench chrome.
- Use reduced-motion behavior consistently in every new borrowed component.

This is consistent with `RULES.md`, `docs/architecture/frontend-rules.md`, and the existing `docs/audits/phase3-ui-audit.md` guidance to prefer calm, dense, solid surfaces over decorative transparency.

---

# 25. Accessibility and interaction semantics

ZEN already has strong foundations:

- `aria-expanded`
- `aria-label`
- `aria-live`
- `aria-busy`
- Keyboard focus rings
- Radix primitives
- Reduced motion
- Accessible command palette
- Focusable tool disclosures
- Approval status announcements

### Result: **Parity / stronger in many areas**

Remaining areas to audit for complete mockup parity:

- Mobile sheet focus trapping
- File-tree keyboard navigation
- Browser-toolbar button labels
- Workbench drag/reorder keyboard alternative
- Composer autocomplete listbox semantics for future `@`, `!`, `$` triggers
- Queued-message keyboard controls
- History/checkpoint keyboard navigation

---

# 26. Highest-priority gaps

## P0 — Most visible and valuable

### 26.1 Status bar information

Add:

- Workspace/project
- Git branch
- Current model
- Approval mode
- Activity count
- Online/provider state
- Context usage

Target:

- `src/components/Zen/StatusBar.tsx`

### 26.2 Composer parity

Add:

- `@` file autocomplete
- `!` command autocomplete
- `$` skill/tool autocomplete
- Security note
- Keyboard shortcut hint
- Better token/chip rendering

Targets:

- `src/atlas/components/PremiumChatInput.tsx`
- `src/atlas/components/chat/input/*`

### 26.3 Dedicated review/diff workbench

Promote inline diff functionality into a persistent workbench view.

Targets:

- `src/atlas/components/genui/premium/DiffCard.tsx`
- `src/atlas/components/workspace/FileExplorer.tsx`
- `src/lib/features/frontendFeatures.ts`
- `src/lib/features/workbenchRegistry.ts`
- `src/atlas/components/RightPanel.tsx`

### 26.4 Visible task brief/goal surface

Create a unified visual task-introduction block.

Targets:

- `src/atlas/components/chat/AssistantTaskPlanPreview.tsx`
- `src/atlas/components/chat/input/TaskChecklistPanel.tsx`
- `src/atlas/components/chat/input/TaskDrawer.tsx`

## P1 — Strong workflow improvements

1. Session resume/history picker
2. Queued-message strip
3. Session-level checkpoint bar
4. Mobile workbench sheet
5. MCP tool block and MCP app frame
6. Browser action log
7. Project/date grouping and sorting controls

## P2 — Visual consistency

1. Normalize Codex workbench density.
2. Review all workbench components for 4–6px radius, solid surfaces, thin borders, compact spacing, mono metadata, and semantic status colors.
3. Promote `FileExplorer` to a registered workbench view.
4. Add selected-file state, search/filter, Git state, and editor/review actions.
5. Add browser action/event logging.
6. Reduce decorative shimmer/glow on static workbench chrome.

---

# 27. Recommended implementation order

## Phase 1 — Trust and shell parity

1. Expand `StatusBar` with useful workspace/run telemetry.
2. Add a compact branch/workspace/status strip to `WorkspaceContextHeader`.
3. Add composer security note and shortcut hints.
4. Normalize workbench surface density and solid backgrounds.

## Phase 2 — Composer and navigation parity

1. Implement rich autocomplete for `@`, `!`, and `$`.
2. Add project/date grouping and sorting controls.
3. Add session resume/history picker.
4. Add visible queued-message management.

## Phase 3 — Review and recovery parity

1. Promote file explorer into the workbench registry.
2. Add dedicated review/diff workbench.
3. Add session-level checkpoint bar.
4. Add branch/worktree/review metadata where backend contracts support it.

## Phase 4 — Specialized workbench parity

1. Add mobile workbench sheet behavior.
2. Add browser action log.
3. Add MCP tool-call block.
4. Add secure MCP app frame if the product roadmap requires embedded MCP UI.
5. Add context/token budget meter.

---

# Final conclusion

ZEN is not missing the Codex foundation. It has already replicated the strongest part: a production-backed, summary-first execution ledger with approvals, retry, undo, subagents, persistence, and reload-aware routing.

The remaining work is primarily to make the surrounding experience feel like one complete Codex-style developer workbench:

- Make the status bar informative.
- Make the task goal visible.
- Make the composer’s scope and triggers explicit.
- Make queued work visible.
- Make history and checkpoints first-class.
- Make review/diff a real workbench workflow.
- Make mobile panels usable rather than hidden.
- Give MCP and browser activity dedicated visual treatments.
- Keep the Codex language concentrated in the chat/workbench zone while preserving ZEN’s distinct purple/glass/Atlas identity elsewhere.

The reference projects should continue to be used as visual and interaction contracts, not as production runtime or state-management implementations.
