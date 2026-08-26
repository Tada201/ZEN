# test/fixtures — event-contract snapshots (R5)

`event-snapshot-baseline.jsonl` is the frontend event-contract baseline: the set
of `{event, shape}` pairs the backend is allowed to emit. Every line is
`{"event": <tauri event name>, "shape": <recursive payload shape>}` appended by
`src-tauri/crates/zen-agent/src/event_snapshot.rs` (feature `event-snapshot`).

Renaming an event or changing a payload shape breaks the frontend silently, so
any backend change that touches event emission should be checked against a fresh
capture. The workspace migration recorded in
[docs/architecture/history/BIG_MIGRATION.md](../../docs/architecture/history/BIG_MIGRATION.md)
introduced this fixture for exactly that reason (risk R5).

## Why the file is not committed

The 2026-08-22 capture attempt on the dev box failed at test-binary load
(`STATUS_ENTRYPOINT_NOT_FOUND`, a known local-environment DLL issue that
affects every `cargo test` run on this machine — builds are fine, execution
aborts). Generate it on a healthy machine (CI runner or another dev box).

## Capture commands (headless, no GUI needed)

```powershell
cd src-tauri
$env:ZEN_EVENT_SNAPSHOT_PATH = "..\test\fixtures\event-snapshot-baseline.jsonl"
cargo test --test agentic_test --features event-snapshot
```

The integration test builds a real Tauri app in-process with a MockProvider,
so the full agent event funnel (`AgentEvent::emit_to` +
`EventBus::bridge_to_ui`) is exercised and recorded.

For a richer interactive capture (tools, approvals, subagents) run the app:

```powershell
$env:ZEN_EVENT_SNAPSHOT_PATH = "..\test\fixtures\event-snapshot-baseline.jsonl"
npx tauri dev --features event-snapshot
# drive one chat: send a message, run one tool approval, spawn one subagent
```

## Diffing after a change

Re-run the same capture and compare the DEDUPLICATED set of `{event, shape}`
pairs:

```powershell
Sort-Object -Unique (Get-Content event-snapshot-baseline.jsonl) |
  Compare-Object (Sort-Object -Unique (Get-Content event-snapshot-new.jsonl)
```

Any difference is an R5 event-contract break against the frontend.
