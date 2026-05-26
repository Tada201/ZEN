# Zen Full-Stack Codebase Deep Scan

Date: 2026-05-25  
Scope: Tauri v2 desktop app, Rust backend, React/Vite frontend, LLM streaming, tools, MCP, RAG, geospatial/workbench UI, settings/security model.

## Executive Verdict

Zen is workable, but it is already in the danger zone for future maintainability. It is not a hopeless mess: the app builds, the recent streaming redesign is partially implemented, and the codebase has useful architectural seams such as `ChatService`, `ProviderRegistry`, split runner modules, tool registries, and typed DB query modules.

The main risk is that too much critical behavior still lives in oversized coordination files with broad authority: chat send, runner loop, tools, MCP, terminal, settings, and rendering. The app also has several security-sensitive features enabled at once: terminal execution, tool execution, MCP HTTP exposure, web fetch, HTML/SVG rendering, Mermaid rendering, custom provider URLs, and locally persisted API keys. That combination requires a stricter security baseline than the code currently enforces.

Overall maintainability grade: **C / C-**.

Recommended direction: pause new feature expansion briefly and do a stabilization sprint focused on security hardening, CI gates, module boundaries, and bundle splitting.

## Verification Summary

Commands run:

- `npm audit --json`: **0 vulnerabilities** across 826 npm packages.
- `npm run build`: **passes**, but emits large chunk warnings.
- `cargo check --all-targets`: **passes**, with 74 Rust warnings.
- `cargo clippy --all-targets -- -D warnings`: **fails**, 214+ errors.
- `cargo test --all-targets`: **fails at runtime** with `STATUS_ENTRYPOINT_NOT_FOUND` after building tests.
- `cargo audit --json`: unavailable because `cargo-audit` is not installed.
- Codegraph scan: 461 indexed files, 6,174 symbols, 12,953 edges.

Online references checked:

- Tauri CSP docs say CSP protection reduces XSS impact and is only enabled when configured in `tauri.conf.json`: https://v2.tauri.app/security/csp/
- Tauri capabilities docs describe fine-grained frontend access to core/plugin commands and warn about security boundaries: https://v2.tauri.app/security/capabilities/
- Tauri security docs emphasize trust boundaries, permissions, scopes, capabilities, and CSP: https://v2.tauri.app/security/
- Tauri Stronghold is the official secret/key storage plugin: https://v2.tauri.app/plugin/stronghold/
- OWASP SSRF guidance warns against accepting complete user URLs and highlights parser, redirect, DNS rebinding, IPv6, and private-network bypasses: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Mermaid docs show `securityLevel: "loose"` allows HTML tags and click functionality; default `strict` encodes HTML and disables clicks: https://mermaid.js.org/config/usage

## High-Risk Findings

### 1. CSP is disabled in a rich untrusted-content app

Evidence:

- `src-tauri/tauri.conf.json`: `"csp": null`
- The app renders LLM-generated markdown, Mermaid SVG, OpenUI DSL, artifact previews, search snippets, and user/provider content.

Risk:

- Any XSS in markdown/rendering/plugin paths has a larger blast radius because the app exposes Tauri IPC commands, settings, tools, terminal sessions, and local data.

Fix:

- Add a production CSP immediately.
- Keep `script-src` tight, avoid remote scripts, define explicit `connect-src`, `img-src`, `font-src`, `style-src`.
- Use `devCsp` separately if dev server needs looser rules.

### 2. Mermaid rendering uses `securityLevel: "loose"`

Evidence:

- `src/atlas/components/chat/MermaidDiagram.tsx:23-27`
- `src/atlas/components/chat/MermaidDiagram.tsx:91` injects rendered SVG through `dangerouslySetInnerHTML`.

Risk:

- Official Mermaid docs say loose mode allows HTML tags and click functionality. This is not appropriate for untrusted LLM/user diagram text.

Fix:

- Use `securityLevel: "strict"` by default.
- If interactive diagrams are needed, gate them behind explicit user opt-in and sanitize/iframe them.

### 3. Search result snippets are injected as HTML

Evidence:

- `src/atlas/components/chat/SessionSidebar.tsx:230-234` uses `dangerouslySetInnerHTML` for `messageContent`.

Risk:

- Search results are derived from chat content. Rendering them as raw HTML is unnecessary and exposes a direct XSS surface.

Fix:

- Render as text, or sanitize through a dedicated sanitizer such as DOMPurify before injection.

### 4. API keys are persisted as ordinary settings

Evidence:

- `src/lib/stores/settings/schema.ts:133-149` defines many provider API key fields.
- `src/lib/stores/middleware/persistence.ts:161-173` persists mapped settings to `localStorage`.
- `src-tauri/src/services/settings.rs:45-55` persists settings to SQLite.

Risk:

- Provider keys can live in browser localStorage and SQLite as plain strings.

Fix:

- Move secrets to Stronghold or OS keyring/credential storage.
- Store only key presence metadata in normal settings.
- Remove API keys from frontend persistence serialization.

### 5. MCP HTTP server binds to all interfaces without visible auth

Evidence:

- `src-tauri/src/mcp/server.rs:117-119` binds to `0.0.0.0:8989`.
- `src-tauri/src/mcp/http.rs:33-38` exposes `/mcp`, `/mcp/health`, `/mcp/status`.
- `src-tauri/src/mcp/server.rs:338-427` allows MCP `tools/call` after internal permission checks.

Risk:

- A local desktop app exposing MCP tools to the LAN is a high-risk default. Tool permission checks help, but network clients should not reach this surface unauthenticated.

Fix:

- Bind to `127.0.0.1` by default.
- Require an auth token for HTTP MCP.
- Make LAN binding an explicit advanced setting with warning.
- Add rate limiting and audit logging.

### 6. Web fetch SSRF defense is regex-based and incomplete

Evidence:

- `src-tauri/src/tools/web_fetch.rs:176-188` accepts arbitrary HTTP/HTTPS URLs and calls `reqwest`.
- `src-tauri/src/tools/permission.rs:429-454` blocks localhost/private ranges using regex patterns.

Risk:

- OWASP warns regex/string URL filtering is bypass-prone due to parser confusion, redirects, encoded IPs, IPv6 forms, and DNS rebinding.

Fix:

- Parse URL with `url::Url`.
- Resolve DNS, validate final IPs, block private/link-local/loopback/multicast/reserved ranges.
- Disable redirects or revalidate every redirect hop.
- Pin resolved IP through the request path where possible.
- Enforce max response size before buffering.

### 7. Terminal and command execution surface is broad

Evidence:

- `src-tauri/src/terminal/mod.rs:216-230` executes arbitrary shell text via PowerShell or `sh -c`.
- `src-tauri/src/commands/terminal.rs:7-74` exposes terminal spawn/write/resize/kill commands to the frontend.
- Tool settings include YOLO and auto-approval modes.

Risk:

- This is expected for an agentic workbench, but it must be treated as a privileged subsystem.

Fix:

- Default to confirm for every command with filesystem/network impact.
- Log all executed commands with cwd, caller, tool id, and approval source.
- Enforce workspace sandboxing at the command layer, not only in prompt/tool policy.

## Half-Built / Placeholder Features

Concrete signals:

- `TASK.md` states `SummaryMiddleware` and `CompactionMiddleware` are placeholders while inline logic still handles DB queries.
- `src/components/settings/ui/UnderConstructionBanner.tsx` explicitly says modules are visual preview configurations with pending Tauri integration.
- Under-construction panels are used in:
  - `src/components/settings/Tabs/skills/SkillRegistry.tsx`
  - `src/components/settings/Tabs/system/UpdatesSettings.tsx`
  - `src/components/settings/Tabs/plugins/CommandsSettings.tsx`
  - `src/components/settings/Tabs/plugins/HooksSettings.tsx`
- `src-tauri/src/mcp/http.rs:108-112` has placeholder integration tests.
- `src-tauri/src/rag/session_memory.rs:166` falls back to text search with dummy scores.
- `src/services/globe/AnimationLoop.ts` is explicitly a placeholder.
- `src-tauri/src/services/tts_service/mod.rs:32` has `new_dummy()` fallback.

Interpretation:

The app contains a lot of UI that looks product-real but is still not fully wired. That is the biggest source of future confusion: users and developers cannot reliably tell which controls are authoritative.

Rule:

Every settings panel must declare one of three states in code metadata: `wired`, `partial`, or `preview`. Preview panels must not imply live behavior.

## Performance Findings

### 1. Frontend bundle is too large

Evidence from production build:

- `dist/assets/index-*.js`: 4.47 MB minified, 1.27 MB gzip.
- `dist/assets/MapContainer-*.js`: 1.13 MB minified, 305 KB gzip.
- `dist/assets/index-*.css`: 457 KB.
- Vite warns about chunks larger than 500 KB.

Likely causes:

- Heavy renderer stack: Cesium, Mermaid, OpenUI, charts, KaTeX, syntax highlighting, maps, widgets.
- Some heavy features are lazy-loaded, but `MermaidDiagram` and markdown plugin stack are still imported through chat rendering.

Fix:

- Lazy-load Mermaid rendering only when a Mermaid block appears.
- Lazy-load KaTeX/math plugins only when math syntax appears.
- Split workbench/map/widget routes into manual chunks.
- Keep initial chat shell under 700 KB gzip as a quality gate.

### 2. Oversized files still dominate complexity

Largest current files by line count:

- `src/components/workbench/CesiumMapRenderer.tsx`: 1,177
- `src/atlas/sections/MediaSection.tsx`: 1,072
- `src-tauri/src/agent/runner/loop.rs`: 1,000
- `src-tauri/src/canvas/session.rs`: 989
- `src-tauri/src/agent/tools/progressive.rs`: 852
- `src-tauri/src/agent/workflow.rs`: 795
- `src-tauri/src/agent/swarm.rs`: 780
- `src/atlas/components/chat/AssistantMessage.tsx`: 753
- `src-tauri/src/agent/runner/tool_dispatch.rs`: 748

Fix:

- Enforce file limits:
  - Rust: 700 lines warning, 900 hard fail.
  - TS/TSX app code: 350 lines warning, 500 hard fail.
  - Demo/gallery files may exceed only under `atlas/sections` with explicit exemption.

### 3. Streaming hot path is improved but not fully clean

Evidence:

- `src-tauri/src/chat/service.rs:141-146` now uses `tokio::try_join!` for provider, history, and settings.
- `src-tauri/src/agent/runner/loop.rs:168-175` parallelizes memory settings.
- `src-tauri/src/agent/runner/loop.rs:184-206` avoids duplicate history fetch when messages are provided.
- `src-tauri/src/agent/runner/loop.rs:211-228` shows cached recall path, but leaves unused old variables.

Risk:

- The implementation is moving in the right direction but still has transitional code and warnings.

Fix:

- Finish deleting dead transition variables.
- Add TTFT instrumentation at each stage: DB insert, provider resolve, history fetch, runner start, first provider byte, first frontend render.

### 4. React rendering has many always-on timers and animation loops

Evidence:

- Many components use `setInterval`, `setTimeout`, and `requestAnimationFrame`.
- Examples include system metrics, terminal panel, minimap, sparkline, smooth markdown, voice oscilloscope, Cesium renderer.

Risk:

- The app can burn CPU/GPU while inactive or hidden.

Fix:

- Centralize animation/polling scheduling.
- Respect `document.visibilityState`.
- Respect `lowResourceMode` globally.
- Require cleanup tests for long-lived listeners and timers.

## Maintainability Findings

### What is good

- The runner has been split into `runner/{config,helpers,loop,actions,escalation,background,tool_dispatch}.rs`.
- `ChatService` exists and has started moving logic out of `commands/chat.rs`.
- `ProviderRegistry` exists and helps reduce provider creation duplication.
- DB query modules are partially split under `src-tauri/src/db/queries/`.
- Codegraph is available and useful for architectural navigation.

### What is still risky

- `src-tauri/src/lib.rs` has a giant `invoke_handler` list and startup routine.
- `AppState` is a large service locator with many mutable global fields.
- There are two tool registry paths, v1 and v2, plus progressive/lazy tools.
- `commands/chat.rs` and `chat/service.rs` duplicate similar send-message logic.
- Frontend settings exist in multiple forms: schema, bridge, mapper, slices, tab components.
- Many IPC calls are still untyped or use `any`.

## Quality Gate Failures

### Clippy is not enforceable today

`cargo clippy --all-targets -- -D warnings` fails with 214+ errors. Categories include:

- unused imports and variables
- doc comment misuse
- too many function arguments
- type complexity
- missing `Default` impls
- unnecessary clones/sorts/conversions
- style issues in generated API response structs

This means the project cannot honestly claim strict Rust hygiene yet.

### Tests are not healthy

`cargo test --all-targets` builds but fails when running the lib test binary:

`STATUS_ENTRYPOINT_NOT_FOUND`

This needs investigation before adding more backend behavior. Possible causes include native DLL/runtime mismatch from Tauri/WebView/audio/vector dependencies or a stale target artifact.

### NPM security is currently clean

`npm audit` found 0 vulnerabilities. This is good, but dependency count is high and bundle size indicates frontend dependency pressure.

### Rust security audit is missing

`cargo audit` is not installed, so Rust advisory status is unknown.

Add `cargo-deny` or `cargo-audit` to CI.

## Code Quality Rules Going Forward

### Security rules

1. CSP must never be `null` in production.
2. No raw `dangerouslySetInnerHTML` without a named sanitizer or sandbox boundary.
3. LLM-generated Mermaid must use `securityLevel: "strict"` or sandbox mode.
4. API keys and tokens must not be stored in localStorage or plain SQLite.
5. MCP HTTP must bind to localhost by default and require auth.
6. Web fetch must use parsed URL + DNS/IP validation, not regex-only filtering.
7. Tool execution must be deny/confirm by default for file, network, shell, and MCP actions.
8. Every privileged command must produce an audit log event.

### Architecture rules

1. Tauri commands should be thin adapters only.
2. Business logic belongs in `service.rs`.
3. SQL belongs only in `db/queries/*`.
4. Provider/tool additions must go through registries, not new hardcoded match arms across UI and backend.
5. `AppState` additions require an owner module and a lifecycle note.
6. No new duplicate frontend settings mapping layer without deleting an old one.

### Performance rules

1. Initial JS gzip budget: 700 KB target, 1 MB hard fail.
2. Any dependency above 100 KB gzip must be lazy-loaded unless needed on first paint.
3. Polling/timers must pause when the window is hidden.
4. Streaming path must record TTFT metrics.
5. Markdown, Mermaid, math, chart, and OpenUI renderers must load on demand.

### Rust rules

1. `cargo check --all-targets` must pass.
2. `cargo clippy --all-targets` must pass before release; initially allow a short denylist migration file if needed.
3. No `unwrap()` or `expect()` in non-test code unless accompanied by a clear invariant comment.
4. No command handler over 7 arguments; use request structs.
5. No file over 900 Rust lines without an approved exemption.

### TypeScript rules

1. `invoke<T>()` must be typed.
2. `any` must be banned in app logic except integration boundary adapters.
3. Settings schema must be the single source of truth.
4. Components over 500 lines must split by behavior, not by arbitrary visual chunks.
5. Long-lived listeners must return cleanup functions and have tests.

## Priority Remediation Plan

### Sprint 0: Safety and build hygiene

1. Add production CSP.
2. Change Mermaid to strict/sandbox mode.
3. Remove raw HTML injection in search snippets.
4. Move API keys out of localStorage/plain settings.
5. Bind MCP HTTP to localhost and add token auth.
6. Install and run Rust advisory tooling.
7. Fix `cargo test` runtime failure.

### Sprint 1: CI-grade quality gates

1. Make `cargo clippy --all-targets` pass without `-D warnings`.
2. Then ratchet selected lints to deny.
3. Add frontend lint/type gate for `any` and typed IPC.
4. Add file-size check script.
5. Add bundle-size check script.

### Sprint 2: Finish the streaming architecture cleanup

1. Remove transitional unused runner variables.
2. Finish middleware extraction for summary and compaction.
3. Add TTFT spans and frontend render timing.
4. Add regression tests for first chunk, cancellation, tool call streaming, and background recall.

### Sprint 3: Reduce complexity hotspots

1. Split `CesiumMapRenderer.tsx`.
2. Split `runner/loop.rs`.
3. Split `runner/tool_dispatch.rs`.
4. Split `AssistantMessage.tsx`.
5. Consolidate chat send logic so `commands/chat.rs` delegates fully to `ChatService`.

## Final Assessment

Would this be a mess to work in later?

Yes, if new features keep landing at the current pace without a quality gate. The codebase is already complex enough that every new feature can accidentally touch streaming, settings, tools, permissions, rendering, and persistence.

No, if the next phase is a disciplined stabilization pass. The codebase has enough structure to recover: modules exist, tests exist, registries are emerging, the runner split has started, and the app builds. The priority is to make those boundaries real and enforceable.

The shortest path to a healthier Zen is not a rewrite. It is: harden the security boundary, finish the half-split architecture, make CI strict, and stop allowing preview UI to masquerade as wired product behavior.
