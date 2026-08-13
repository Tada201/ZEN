# Agent runtime streaming contract

Zen renders agent turns through typed, ordered runtime projections rather than
per-token component-local state.

## Runtime path

```text
Tauri event
  -> normalized event
  -> per-run scheduler
  -> canonical text/tool/artifact/agent projection
  -> compatibility Message projection
  -> stable chat renderer
```

Text and reasoning use `src/atlas/agentRuntime/`. Provider bursts are queued and
revealed through one frame-paced scheduler. `chat:done` supplies the canonical
target and enters a drain phase; it must not replace visible partial text in one
render.

Tool lifecycle updates and agent lifecycle updates are frame-batched. Artifact
deltas are keyed by chat, message, and artifact identity. GenUI keeps a stable
building state until streaming has finished before mounting the heavy renderer.

## Message ownership

`useChatQueries.mapDbMessageToMessage` is the persisted-message projection and
hydrates the ordered `steps_json` ledger. Live runtime updates project into the
same `Message` shape. Display components must not call
`normalizeVercelMessage` for live rows; normalization/reconstruction belongs at
the query or compatibility boundary.

`normalizeVercelMessage` remains available for legacy reload fixtures and old
payload compatibility while persisted records migrate toward the ordered
ledger. New live records must preserve stable IDs and must not reconstruct tool
ownership during render.

## Subagents

The parent timeline renders a compact lifecycle summary. Child tool details are
attached by stable trace/spawn identity and remain available in the dedicated
agent panel or disclosure surface. Lifecycle bursts are coalesced before the
parent message projection is updated.

## Verification

Focused contracts:

- `test:agent-runtime-reducer`
- `test:chat-runtime-bridge`
- `test:agentic-batching-contract`
- `test:stream-reveal-pacing`
- `test:chat-render-stability`
- `test:chat-transition-content`
- `test:agentic-ui`

A live Tauri/WebView2 performance recording remains a release gate. Capture
Chrome Performance traces for plain text bursts, text/tool/text transitions,
parallel tools, subagent activity, GenUI building, cancellation, and reload
mid-run. Record first visible text, dropped frames, long tasks, and drain
completion before declaring device-level smoothness.
