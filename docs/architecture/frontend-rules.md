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
