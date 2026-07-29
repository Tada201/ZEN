# Frontend Architecture Rules

This document is the frontend contract for Zen. It exists to keep the app useful,
fast, secure, and visually coherent while the prototype is rebuilt into a
production-grade workbench.

These rules apply to all code under `src/`.

## Product Surface Rules

1. Primary navigation may expose only usable workflows.
2. Prototype, preview, mock, disabled, or under-construction features must be
   hidden, feature-flagged, or clearly marked with maturity metadata.
3. Settings tabs must map to real wired behavior. Empty panels, mock data,
   console-only actions, and no-op toggles do not belong in normal settings.
4. Advanced or experimental surfaces belong in a single Labs or Advanced area,
   not the main chat workflow.
5. The right panel and utility rails must default closed unless they are required
   by the current user task.
6. Every visible feature must have a clear user job. If a feature is only visual
   novelty, remove it.

## Security Rules

1. Model-generated content is untrusted.
2. Do not render untrusted HTML, SVG, Mermaid, Markdown HTML, or generated UI
   without a sanitizer or sandbox boundary.
3. `dangerouslySetInnerHTML` requires a nearby comment naming the sanitizer or
   sandbox boundary.
4. Artifact iframes must default to no script execution. `allow-scripts` requires
   a documented product need, a CSP, and a security review.
5. Model-generated UI must not call backend tools during render. Tool execution
   requires explicit user intent, allowlisting, permission checks, and audit.
6. Links from model output or tool output must allow only safe schemes such as
   `http:` and `https:`. Unknown schemes render as text.
7. Secrets must not be stored in localStorage, normal Zustand persistence, or
   public settings. Store only presence metadata such as `hasKey`.
8. Frontend file, terminal, network, MCP, and tool actions must route through
   typed APIs and backend security services.

## Performance Rules

1. Streaming token, artifact, or telemetry updates must be buffered. Do not
   perform raw per-delta React state writes in hot paths.
2. Zustand setters used by streaming paths must no-op when the value is
   unchanged.
3. Components must subscribe to exact Zustand slices. Avoid broad store
   subscriptions in frequently rendered components.
4. Do not put global ticking values in broad stores unless subscribers are
   isolated. A one-second clock must not rerender unrelated UI.
5. Virtualized lists must not force full measurement on every streamed content
   update. Measure only changed rows and schedule scroll work through a single
   rAF batch.
6. Markdown during streaming should avoid repeated full reparsing of growing
   strings. Render unstable/incomplete blocks cheaply, then parse when stable.
7. Artifact streaming should batch deltas and avoid repeated full string/object
   cloning.
8. Animations must support `prefers-reduced-motion` and must not be decorative
   CPU/GPU work. Remove animations that do not communicate state, navigation, or
   feedback.
9. Canvas, WebGL, map, chart, audio, and particle loops must pause when hidden,
   inactive, or offscreen.

## UI Quality Rules

1. The app should feel calm, dense, and professional. Avoid decorative clutter,
   noisy backgrounds, excessive glow, and novelty motion.
2. Meaningful text must not look disabled. Avoid `text-white/20`,
   `text-white/30`, and equivalent low-contrast values for readable content.
3. Meaningful labels should be at least 11px. Normal content should be at least
   12px.
4. Hover-only controls are not acceptable for critical actions. Provide visible,
   focusable, and touch-accessible affordances.
5. The main chat header must expose useful context such as session, model,
   provider, or status when available.
6. Responsive layout is required. Fixed sidebars, rails, and panels must collapse
   before they crush the primary chat surface.
7. Visual systems must use shared tokens. Do not introduce one-off neon,
   hardcoded, or product-inconsistent palettes in widgets.
8. Use icon buttons for common actions, with tooltips for unclear icons.

### Surface & Readability Rules

The chat timeline and other primary surfaces must feel solid, readable, and
free of decorative transparency. These rules are enforced to prevent the UI
from looking broken, busy, or low-contrast across themes.

1. **Do not use glassmorphism on primary content surfaces.** Avoid combining
   `backdrop-blur` with low-opacity backgrounds such as `bg-background/40` or
   `bg-card/60`. Use solid semantic surfaces (`bg-card`, `bg-muted`,
   `bg-background`) instead.
2. **Do not use semi-transparent surface backgrounds on primary content.**
   Classes like `bg-card/20`, `bg-muted/30`, `bg-background/35`, or
   `bg-primary/5` on large surfaces make the UI look washed out and inconsistent.
   Use the full-opacity token on cards, panels, and blocks.
3. **Do not use low-opacity borders on primary surfaces.** Prefer `border-border`
   over `border-border/30`, `border-border/40`, or `border-border/60`.
4. **Do not use low-opacity text for readable content.** Avoid
   `text-muted-foreground/25`, `text-muted-foreground/55`, `text-foreground/80`,
   or `opacity-40` on labels, body text, or status text. Use
   `text-muted-foreground` or `text-foreground` instead.
5. **Use solid hover states.** Prefer `hover:bg-muted` over faint tints such as
   `hover:bg-muted/10`.
6. **Reserve accent tints for small indicators.** `bg-primary/10`,
   `text-primary/70`, and similar tints are acceptable only for tiny badges,
   dots, or subtle status chips—not for cards, panels, or large surfaces.

**Examples from the chat timeline:**

| ❌ Don't | ✅ Do |
|---|---|
| `bg-background/40 backdrop-blur-md` | `bg-card` |
| `bg-card/60` | `bg-card` |
| `bg-card/20` | `bg-card` or `bg-muted` |
| `bg-muted/30` / `bg-muted/40` | `bg-muted` |
| `border-border/30` / `border-border/40` | `border-border` |
| `text-muted-foreground/25` / `/55` / `/60` | `text-muted-foreground` |
| `text-foreground/80` / `/90` | `text-foreground` |
| `hover:bg-muted/10` | `hover:bg-muted` |

**Exceptions:** Disabled controls, loading skeletons, and explicitly decorative
accents (e.g., a subtle glow behind a single hero element) may still use opacity,
because the opacity itself communicates state rather than content readability.
Do not use these exceptions to justify low-contrast body text or washed-out cards.

## Chat Timeline Rules

The main chat timeline is a user-facing progress surface, not an execution log.

1. Tool calls, agent actions, and subagent work must render summary-first:
   short verb, target or result, status, and only the next useful action.
2. Do not display raw internal JSON, full tool arguments, provider payloads,
   prompt bodies, event metadata, stack traces, stdout/stderr dumps, or full
   subagent transcripts in the normal chat timeline.
3. Technical details may be available only behind an explicit disclosure such
   as "Technical details", and only when they help diagnose a failure or audit a
   user-approved operation.
4. Approval and error states are exceptions to the quiet default: they must be
   visible, actionable, and written in user language. Show risk, reason, and
   approve/deny controls without dumping raw arguments.
5. Completed successful tool calls must disappear from the main chat timeline
   after the assistant answer is done or when the chat reloads. Preserve their
   data for audit/replay surfaces, but do not append a leftover execution card
   below the final answer.
6. Subagent rows should show delegation status and final summary. They must not
   stream child-agent token deltas, prompt text, or full transcripts into the
   parent chat unless the user explicitly opens a diagnostic disclosure.
7. Parallel or multi-tool execution should collapse into one grouped execution
   row by default. Expand only to reveal meaningful lanes, failures, approvals,
   artifacts, or concise result previews.
8. Chat labels must use product language, not implementation names. Prefer
   "Reading files", "Running tests", "Approval needed", or "Delegated to
   reviewer" over raw tool ids, event kinds, or JSON keys.
9. Any verifier for chat execution UI must assert the user-facing contract
   above, not brittle snapshots of old internal component structure.

### Execution Timeline Persistence

Assistant messages carry a `steps` array that represents the live execution
timeline (text, reasoning, tool-call, and action steps). This timeline must
behave identically before and after an app reload.

1. `steps` must contain only serializable JSON. Do not store functions, DOM
   nodes, circular references, or non-serializable metadata in a step.
2. The backend persists the timeline in `messages.steps_json`. The frontend
   reads it back via `BackendMessage.stepsJson` and `normalizeVercelMessage`.
3. On rehydration, `normalizeVercelMessage` uses `stepsJson` first; the legacy
   `toolInvocations` / `toolCalls` reconstruction is a fallback only.
4. `chat:done` carries the real backend `message_id` in
   `ChatDoneEventPayload.message_id`. Always use this backend ID—not the
   optimistic in-memory ID—for post-stream updates such as
   `updateMessageSteps`.
5. When the user reloads the app, the final persisted `steps_json` must
   reproduce the same grouped timeline that was visible at the end of the
   stream. Do not leave stray or orphan tool cards that vanish after reload.
6. If a branch (deep research, orchestrator, etc.) cannot yet emit a real
   `message_id`, do not call `updateMessageSteps` with a fake/optimistic ID;
   wait until the backend can provide the true persisted row ID.
7. Keep the persisted timeline small. Embed only what the UI needs to render
   the progress ledger; avoid duplicating full tool outputs, large base64 blobs,
   or subagent transcripts inside `steps`.

### Tool-Card UX Rules

Tool-call cards in the chat timeline must render the *user-facing* transaction,
not the implementation detail.

1. **Summary-first layout.** Every card must show: verb, target, status, and
   (when complete) a one-line outcome. Example: "Edited `src/lib.rs` (+12 / −3)"
   or "Ran `cargo test` (exit 0)".
2. **No raw JSON, tool arguments, stdout/stderr dumps, or event metadata as the
   primary view.** Raw input and output belong inside an explicit
   "Technical details" or "Raw output" disclosure.
3. **Content-type-aware renderers.** Use the appropriate card treatment for the
   tool output:
   - **File edits:** unified or side-by-side diff with `+`/`-` indicators and
     semantic color tokens. Show "+N / −M" summary when collapsed.
   - **Terminal / shell:** monospaced output block, truncated to ~5–10 lines by
     default, with a "Show full output" toggle and a copy button.
   - **Search:** numbered result snippets with clickable source links or chips.
   - **Artifacts:** preview card that links to the existing artifact viewer.
   - **Subagent / delegation:** `SubagentExecutionCard` with agent name, task,
     status, elapsed time, and child tool-call trace when expanded.
   - **Generic:** summary line + raw output disclosure.
4. **Collapsed / expanded defaults:**
   - **Running / pending:** expanded (or visually active) so the user sees work
     in progress.
   - **Waiting for approval:** expanded with risk, reason, and approve/deny
     controls.
   - **Error / failed:** expanded with a concise message and retry action.
   - **Completed background work:** collapsed by default, unless the result is
     immediately relevant (e.g., a generated artifact).
5. **Animations are subtle and consistent.** Use `duration-200` fades or height
   transitions. Do not bounce, shake, or pulse for decoration. Respect
   `prefers-reduced-motion`.
6. **Status icons and colors:** use semantic tokens only. Green for success,
   red for error, amber for pending/approval, and neutral for running. Do not
   rely on color alone for diffs; include `+`/`-` prefixes.
7. **Keyboard and screen-reader support:** expand/collapse is a focusable button
   with an `aria-expanded` state. Running and error cards live in a polite
   `aria-live` region if they are not auto-focused.
8. **Reload safety:** collapsed/expanded state and output previews are derived
   from the persisted `steps_json` and backend IDs. Do not depend on
   optimistic in-memory IDs or ephemeral React state for card survival across
   reloads.

#### Enforcement Checklist

A new or updated tool-card implementation should pass the following review
before being merged:

- [ ] The card renders a one-line summary (verb + target + status + optional count).
- [ ] Raw JSON, full tool arguments, stdout/stderr dumps, and event metadata
      are hidden behind a "Technical details" or "Raw output" disclosure.
- [ ] File edits show a diff or "+N / −M" badge; terminal output uses a
      monospaced block with a copy button; search results show numbered snippets.
- [ ] Running/approval/error cards are expanded by default; completed background
      cards are collapsed by default.
- [ ] Animations are limited to `duration-200` fades or height transitions and
      respect `prefers-reduced-motion`.
- [ ] Expand/collapse is keyboard-focusable and announces `aria-expanded`.
- [ ] The card derives its persisted state from `steps_json` and backend IDs,
      not optimistic IDs.
- [ ] A verifier or manual test confirms the card looks identical after an app
      reload.

### Backend Message ID Contract for Chat Events

The backend is the source of truth for persisted message IDs. Optimistic IDs
created by the frontend must be treated as temporary and replaced as soon as the
backend exposes the real row ID. Every event that targets a specific persisted
message should include the backend message ID; events that target the chat stream
as a whole should not pretend to target a message.

1. `chat:done` carries `message_id` — the backend-assistant row ID for the turn.
   Use this ID for every post-stream update such as `updateMessageSteps`. Do not   use the optimistic in-memory assistant ID for persisted updates.
2. `chat:message` carries `id` — the backend row ID for the message it describes.
   The frontend must upsert by that `id` and replace any optimistic message   placeholder. If the same `id` already exists in the store, merge updates rather
   than creating a duplicate.
3. `chat:error` does not carry a `message_id`; it targets the chat stream. The   frontend should route the error to the currently active streaming assistant   for that chat (if any) and mark it as failed. Do not fabricate or trust an   optimistic ID for persisted state after an error.
4. `chat:stream-reset` does not carry a `message_id`; it resets the per-chat   streaming state. Do not use it to mutate a specific message.
5. When the backend message ID arrives, update the store's id mapping immediately.
   Subsequent events (tool cards, chunk deltas, status updates) may still refer to   the optimistic ID in older code; any new code must resolve them through the   backend ID.
6. If a backend branch (deep research, orchestrator, etc.) cannot yet emit a real
   `message_id` or `id`, treat that branch as not-yet-persisted. Do not call
   persistence commands with fake or optimistic IDs for those branches.

## Code Quality Rules

1. No raw `invoke` outside typed API wrappers.
2. No untyped `listen<any>` outside a typed event wrapper. Event payloads should
   be typed and validated before mutating stores.
3. React Query owns server state. Zustand owns ephemeral UI state and live
   runtime buffers. Do not copy persisted query data into Zustand unless there is
   a documented migration reason.
4. Stores should have one domain owner and stay below 200 lines per slice.
5. Hooks should stay below 150 lines unless documented.
6. Components over 300 lines require a split plan. Components over 500 lines are
   hard violations unless listed in `docs/architecture/exemptions.md`.
7. Avoid `any`. Use `unknown`, discriminated unions, or local type guards.
8. Do not add duplicate hooks, stores, registries, renderers, or component
   implementations for an existing domain.

## Frontend Review Gate

Before shipping frontend changes, answer these questions:

1. Does this feature have a real user job and a maturity status?
2. Can this render untrusted content, execute privileged work, or expose secrets?
3. Can this rerender during streaming, polling, canvas loops, or global ticks?
4. Does it remain usable on narrow viewports?
5. Does it follow the existing visual tokens and interaction patterns?
6. Is state owned by the right layer?
7. Are typed API and event boundaries used?

If any answer is unclear, stop and fix the design before adding more UI.
