# Performance Budgets

Phase 6 focuses on startup cost, lazy loading, and visible local budget checks.
These checks are intentionally local for now; CI enforcement is deferred until
the full app feature surface is finished.

## Current Local Gate

Run after a production build:

```powershell
npm run build
npm run perf:budget
```

Default budgets:

- maximum JavaScript chunk: 5000 KB
- maximum CSS chunk: 700 KB
- maximum total JavaScript: 12000 KB

These budgets are not release targets. They are ratchets to keep the app from
getting worse while Phase 6 splits heavy surfaces.

## Bundle Rules

- Heavy optional surfaces must be lazy-loaded at the user interaction boundary.
- Map engines, diagram renderers, chart renderers, 3D labs, editors, terminal,
  diagnostics, and voice overlays must not be imported by startup paths unless
  they are visible on first paint.
- Mermaid is allowed for now only as a lazily imported, viewport-gated diagram
  renderer. Replacing it with a narrower renderer is a product decision, not a
  Phase 6 blocker.
- Rich markdown extras such as KaTeX and syntax highlighting must remain behind
  the rich markdown renderer boundary. Do not add markdown plugins to the core
  chat path.
- Use Vite manual chunks for large vendor families so bundle drift is visible.
- Do not silence Vite chunk warnings by raising `chunkSizeWarningLimit` until
  the release budget is decided.

## Runtime Rules

- WebGL, canvas, audio, and visualization loops must pause when hidden,
  inactive, or offscreen.
- Streaming markdown and artifact rendering should avoid reparsing or recloning
  full content on every token delta.
- Zustand stores used by timers or streams must avoid broad subscriptions.
- Growable local-history and telemetry reads must use paginated typed API
  wrappers. Legacy unpaginated command names are compatibility surfaces only.
