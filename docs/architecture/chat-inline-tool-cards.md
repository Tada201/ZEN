# Chat Inline Tool-Card UX Reference

**Status:** Draft — Phase 4c

This document captures the UX patterns used by leading AI coding assistants for inline tool-call cards and maps them to Zen's intended behavior. It is a design reference for `ToolCallCard`, `AgentExecutionTrace`, `SubagentExecutionCard`, and any future content-type renderers in the chat timeline.

**Scope note:** The reference comparisons below are reverse-engineered from public documentation, product observations, and common interface patterns. They are not first-party design specifications, and the exact behavior of ChatGPT, Codex, Claude, or Cursor may differ between versions.

---

## 1. Design Principles

The chat timeline is a **progress ledger**, not a terminal transcript. Every tool card must answer, at a glance:

1. **What** is happening (verb + tool identity).
2. **On what** (file, command, query, target).
3. **Status** (pending, running, success, error, waiting for approval).
4. **Outcome** (summary, diff, result count, artifact link, error reason).
5. **Next action** (approve, retry, expand for details, copy output).

Tool cards should be:

- **Summary-first** by default. Hide raw arguments, JSON, stdout dumps, and internal metadata behind an explicit disclosure.
- **Content-aware.** A file edit, a terminal command, a search result, and an subagent handoff should not share the same generic layout.
- **Reload-safe.** After an app reload, the same backend IDs and persisted `steps_json` must reproduce the identical card states (collapsed/expanded, status, output previews).
- **Accessible and calm.** Use subtle, consistent motion. Respect `prefers-reduced-motion`. Never auto-scroll or bounce cards for decorative effect.

---

## 2. Reference App Comparison

### 2.1 ChatGPT / OpenAI Codex / Cursor-style coding agents

Modern coding-agent interfaces (ChatGPT with Canvas, OpenAI Codex, Cursor Composer, and similar tools) treat tool calls as first-class, contextual transactions rather than plain text. The exact layout varies by product, but the following patterns are common.

| Pattern | Description | UX Goal |
| :--- | :--- | :--- |
| **Inline cards** | Tool calls appear as compact cards with an icon, verb, and status. | Clean history, quick scanning. |
| **File diffs** | Side-by-side or inline VCS-style diff with green additions and red deletions. Accept/reject controls sit in the gutter. | Safety, direct manipulation. |
| **Terminal output** | Collapsed by default; a "Show more" link opens a full console view. Failed commands surface an error code and a one-click "Debug this error" prompt. | Keep chat readable; surface failures. |
| **Search context** | Referenced files appear as chips. Hovering reveals a snippet. | Transparency into why files were chosen. |
| **Subagent / task tree** | Complex prompts are broken into a nested checklist. Actor changes update the avatar/icon. | Trust and predictability. |
| **State persistence** | Canvas saves the *code* as the source of truth; the chat is a modifier. | Reload preserves working state. |

These interfaces typically render code edits as **inline or side-by-side diffs** directly inside the chat, sometimes with "ghost text" or staged-change previews, and place verify/run actions next to each diff chunk. Terminal output is streamed into a **dedicated virtual terminal widget** that mimics a real IDE terminal, color-coding stdout/stderr and auto-collapsing older history. Search results surface as **citation cards** with file names, highlighted snippets, and clickable paths. Subagent work is shown through a **hierarchical or threaded activity feed** with per-subtask progress indicators.

**Key takeaways for Zen:**

- Use collapsible cards with a clear summary line and a status icon.
- File edits should show a readable diff, not raw JSON.
- Terminal output should be truncated by default with an expand action.
- Multi-step work should be grouped and nested, not flattened into a single verbose card.
- Keep the most common action (e.g., accept a change) the most obvious control in the card.

### 2.2 Claude (Anthropic)

Claude's interface is built around **Artifacts** and clear separation between internal reasoning, tool use, and final output.

| Pattern | Description | UX Goal |
| :--- | :--- | :--- |
| **Tool Use cards** | Discrete, block-level cards summarize the action ("Reading `main.py`", "Executing `ls -la`"). | Reduce chat clutter. |
| **Expansion / collapse** | Cards are concise by default; expanding reveals raw input and output. | Progressive disclosure. |
| **Artifacts** | Generated code, documents, or web components appear in a side panel with version history and live preview. | Persistent, interactive workspace. |
| **File edits / bash** | Inline diff cards for edits; fixed-width, syntax-highlighted blocks for terminal output. | Familiar, readable formatting. |
| **Computer use** | Screenshot thumbnails trace each desktop action visually. | Verifiable agent loop. |
| **Citations** | Search results include interactive chips/links that reveal the source on hover/click. | Source transparency. |

Claude presents each tool as an **"Action Card"** embedded in the chat thread. The collapsed card shows an icon plus a human-readable summary (e.g., "Reading `main.py`" or "Executing Bash command"). Expanding reveals a dark-themed console block for terminal output or a diff-style code block for file edits. For multi-step reasoning, Claude renders **collapsible thought blocks** above the final answer, visually grouped to show the hierarchy of internal reasoning. Generated documents and web apps break out into a **split-pane Artifact workspace** with Code/Preview tabs and a version selector ("1 of 3").

**Key takeaways for Zen:**

- Separate internal reasoning from external actions.
- Provide a persistent, inspectable surface for artifacts.
- Show before/after for edits.
- Use human language summaries, not raw tool IDs.

---

## 3. Desired Zen Patterns by Tool Type

### 3.1 File Edit / File Write

**Zen behavior:**

- **Collapsed:** icon + "Edited `<file>`" or "Created `<file>`" + status chip. If the result is small, show a one-line preview: "+12 / −3".
- **Expanded:** a readable diff (unified or side-by-side). Additions are `bg-green-100 text-green-900`, deletions are `bg-red-100 text-red-900` (light) or the equivalent dark tokens. Do not rely on color alone; include `+`/`-` prefixes.
- **Actions:** "Accept" / "Reject" (when approval flow is active), "Copy path", "Open in editor".
- **No raw JSON:** tool arguments are shown only inside a "Technical details" disclosure.

### 3.2 Bash / Terminal / Shell Command

**Zen behavior:**

- **Collapsed:** icon + "Ran command" + one-line command preview (truncated) + exit-code badge.
- **Expanded:** a monospaced output block with syntax highlighting, a copy button, and a "Show full output" toggle if output exceeds ~10 lines.
- **Failed commands:** red status, exit code, and a concise error summary. Do not dump the entire stderr into the chat timeline by default.
- **No raw JSON:** the command string is the primary view, not a JSON object.

### 3.3 Web / Code Search

**Zen behavior:**

- **Collapsed:** icon + "Searched" + query preview + result count badge.
- **Expanded:** numbered result snippets with file/URL labels. Each result is clickable and opens the source. Citations are numbered chips.
- **No raw JSON:** render result items as a list, not a raw response object.

### 3.4 Artifacts (generated code, documents, web components)

**Zen behavior:**

- Render as a persistent preview card with a title and a "Open artifact" action.
- Prefer the existing artifact viewer/preview path; do not embed full artifacts inside the chat timeline.
- Show a thumbnail or summary in the timeline card.

### 3.5 Subagent / Delegation

See also `SubagentExecutionCard.tsx`.

- **Collapsed:** avatar/icon + agent name + task summary + status + elapsed time.
- **Expanded:** nested list of child tool calls (reuse `AgentExecutionTrace`), final handoff summary, and any error.
- **No token streams:** do not show child-agent token deltas in the parent chat unless the user opens diagnostic details.

---

## 4. Stray Tool Calls & Reload Safety

One of the specific issues to solve is the **stray tool-call card**: an optimistic card that appears while a tool is running, but is not matched to a backend-persisted message after reload. To eliminate stray cards, the frontend and backend must agree on a single identity for every execution step.

**Concrete flow:**

1. **Frontend emits an optimistic assistant message** with a temporary `id` when the user sends a message.
2. **Backend emits `chat:step` events** during streaming. Each step carries a backend-generated `tool_call_id`, `trace_id`, `run_id`, and the backend `message_id` once it is known.
3. **Frontend reconciles** by indexing in-flight steps by `tool_call_id` in `useChatChunkEvent.ts`. When `chat:done` arrives with the real `message_id`, the frontend calls `chatApi.updateMessageSteps` to persist the final timeline.
4. **On reload**, `normalizeVercelMessage` reads `stepsJson` from the backend. Because the persisted timeline is keyed to the real backend message ID, there is no optimistic placeholder left to render.
5. **Cleanup rule:** any step whose `tool_call_id` does not appear in the persisted `stepsJson` after `chat:done` is discarded. No orphan cards may survive reload.

**Key files:**

- `src/atlas/hooks/stream/useChatChunkEvent.ts` — reconciliation and persistence trigger.
- `src/api/chatApi.ts` (`updateMessageSteps`) — typed API wrapper for the backend command.
- `src/atlas/components/chat/normalizeVercelMessage.ts` — rehydrates `steps` from `stepsJson` on reload.
- `src-tauri/src/commands/chat/crud.rs` (`update_message_steps`) — backend validation and persistence.

**Example timeline:**

```
Before reload (live stream):
- User message
- Assistant placeholder (optimistic id: "temp-assistant-1")
  - ToolCallCard "Running cargo test" (tool_call_id: "tc_abc", optimistic)
- chat:done arrives with message_id: "msg_42"
- updateMessageSteps persists steps_json for msg_42

After reload:
- User message
- Assistant message "msg_42" with steps_json
  - ToolCallCard "Running cargo test" (tool_call_id: "tc_abc", backend-owned)
  - No "temp-assistant-1" placeholder remains
```

This is why Phase 4b focused on stable backend IDs: the frontend can only be reload-safe when every emitted step has a deterministic, backend-owned identity.

---

## 5. Streaming & Loading States

Tool cards are not only a post-hoc summary; they are part of the live stream. The following states should be distinguishable:

| State | Visual treatment | Default collapse? | Driven by |
| :--- | :--- | :--- | :--- |
| **Pending** | Subtle pulsing indicator + verb ("Preparing…"). | Expanded or visually active. | `chat:step` with status `pending` |
| **Running** | Spinner or progress bar + live output preview. | Expanded. | `chat:step` with status `running` |
| **Waiting for approval** | Amber status + risk summary + Approve/Deny buttons. | Expanded. | `chat:step` with status `approval_required` |
| **Success (background)** | Green check + one-line outcome. | Collapsed. | `chat:done` + final `steps_json` |
| **Success (artifact)** | Preview thumbnail + "Open artifact" action. | Expanded until user dismisses. | `chat:done` + final `steps_json` |
| **Error** | Red icon + concise message + Retry. | Expanded. | `chat:error` or `chat:step` with status `error` |

**Animation standards:**

- Use `duration-200` height/fade transitions when expanding or collapsing.
- Running cards should update content in place; do not bounce, shake, or flash.
- Respect `prefers-reduced-motion`: fall back to instant transitions when requested.
- Do not auto-scroll the chat to keep a running card in view unless the user is already near the bottom.

---

## 6. Generic Tool-Card Contract

Every tool card in the chat timeline should satisfy the following contract, regardless of tool type.

| Concern | Rule |
| :--- | :--- |
| **Summary line** | One line: verb + target + status + optional count. |
| **Primary surface** | Solid semantic surfaces (`bg-card`, `bg-muted`). No glassmorphism or low-opacity backgrounds. |
| **Raw output** | Hidden by default. Available under a "Technical details" or "Raw output" disclosure. |
| **Running state** | Subtle spinner or pulse. No bouncing or decorative motion. |
| **Success state** | Green check or neutral success icon. Collapse by default. |
| **Error state** | Red error icon + concise message. Keep expanded. Offer retry where possible. |
| **Approval state** | Expanded by default. Show risk, reason, and approve/deny controls. |
| **Animation** | `duration-200` transitions. Respect `prefers-reduced-motion`. |
| **Keyboard** | Expand/collapse is focusable and reachable by keyboard. |
| **Reload safety** | State is derived from persisted `steps_json` and backend IDs, not optimistic in-memory IDs. |
| **Enforcement** | Each new tool card must pass the review checklist in `docs/architecture/frontend-rules.md` (Tool-Card UX Rules). |

---

## 7. Comparison Table

| Tool Type | ChatGPT / Codex / Cursor-style | Claude Pattern | Zen Pattern |
| :--- | :--- | :--- | :--- |
| **File edit** | Inline diff with accept/reject | Inline diff card | Diff view, +/− counts, accept/reject |
| **Terminal** | Truncated + full console view | Fixed-width output block | Truncated output, copy button, full output toggle |
| **Search** | File chips + hover snippets | Citation chips | Numbered snippets + clickable source links |
| **Artifact** | Canvas / side panel | Artifacts panel + version history | Reuse artifact preview card |
| **Subagent** | Nested task checklist | Thought/tool separation | `SubagentExecutionCard` with child trace |
| **Generic** | Collapsible raw JSON | Collapsible raw JSON | Summary line + raw output disclosure |

### 7.1 Component mapping

| Tool Type | Primary renderer | Secondary helpers | Status |
| :--- | :--- | :--- | :--- |
| **File edit** | `FileEditToolContent` | diff parser, syntax highlighter | planned |
| **Terminal** | `TerminalToolContent` | code block, copy button | planned |
| **Search** | `SearchToolContent` | citation chip, source link | planned |
| **Artifact** | `ArtifactToolContent` | existing artifact viewer | planned |
| **Subagent** | `SubagentExecutionCard` | `AgentExecutionTrace` | exists |
| **Generic** | `GenericToolContent` | JSON tree / raw output disclosure | planned |

---

## 8. References & Resources

- `frontende-design.md` — Zen chat execution UI design philosophy.
- `docs/architecture/frontend-rules.md` — Surface & readability rules; backend message ID contract.
- `src/atlas/components/chat/ToolCallCard.tsx`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/SubagentExecutionCard.tsx`
- `src/atlas/components/chat/tool/toolOutputPreview.ts`
- [OpenAI Apps SDK UI Guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)
- [Claude Artifacts documentation](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-they-work)
- [Assistant UI](https://www.assistant-ui.com/)

---

## 9. Open Questions

- Should file-edit diffs be side-by-side or unified by default? (Reference apps vary; start with unified for compactness.)
- How many lines of terminal output should appear before truncation? (Start with 5–10.)
- Should subagent cards show child tool calls inline or in a separate scrollable panel? (Start inline inside the expanded card.)
