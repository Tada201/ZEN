# test/fixtures — event-contract snapshots (BIG_MIGRATION.md Phase 0, R5)

`event-snapshot-baseline.jsonl` must be captured from the PRE-migration tree
(tag `pre-workspace-migration`) before Phase 6 begins. Every line is
`{"event": <tauri event name>, "shape": <recursive payload shape>}` appended
by `src-tauri/src/agent/event_snapshot.rs` (feature `event-snapshot`).

## Why the file is not committed yet

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
so the full agent event funnel (`AgentEvent::emit_via` +
`EventBus::bridge_to_tauri`) is exercised and recorded.

For a richer interactive capture (tools, approvals, subagents) run the app:

```powershell
$env:ZEN_EVENT_SNAPSHOT_PATH = "..\test\fixtures\event-snapshot-baseline.jsonl"
npx tauri dev --features event-snapshot
# drive one chat: send a message, run one tool approval, spawn one subagent
```

## Diffing in later phases

Re-run the same capture after Phase 6 (and any phase touching event emission)
and compare the DEDUPLICATED set of `{event, shape}` pairs:

```powershell
Sort-Object -Unique (Get-Content event-snapshot-baseline.jsonl) |
  Compare-Object (Sort-Object -Unique (Get-Content event-snapshot-new.jsonl)
```

Any difference is an R5 event-contract break against the frontend.
