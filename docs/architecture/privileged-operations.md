# Privileged Operations Audit

This document tracks backend operations that can affect the host system, network,
local files, processes, secrets, or external services. It is a Phase 3.5 working
document, not a permanent exemption list.

## Rule

Privileged operations must be owned by a service or documented helper. Feature
modules may request privileged work, but they should not invent new process,
filesystem, network, or secret-handling behavior.

Required pattern:

```txt
command / feature
  -> service/helper
  -> validation and policy
  -> operation
  -> audit or structured log
```

## Current Findings

### Tool Execution

Status: mostly routed.

- Production execution boundary is `ToolService`.
- MCP, deep research, agent execution, and OpenUI tool commands are expected to
  route through `ToolService`.
- Quality gates check for direct registry execution and direct tool execution.

Remaining work:

- Keep collapsing legacy `agent::tools` wrappers into v2 tools when touched.
- Add tests or exemptions for every production tool that remains privileged.

### Terminal Processes

Status: partially centralized.

- `src-tauri/src/terminal/mod.rs` uses `ProcessManager` for session cleanup.
- `src-tauri/src/services/terminal.rs` still owns PTY session behavior.

Remaining work:

- Keep terminal command execution behind policy gates.
- Do not add new process-spawn paths outside terminal/runtime helpers.

### Speech / Whisper Runtime

Status: partially centralized.

Findings:

- `src-tauri/src/services/runtime_resource.rs` owns bundled/app-data model paths,
  Whisper binary resolution, atomic model writes, command setup, and synchronous
  PID cleanup.
- `src-tauri/src/services/speech_service/mod.rs` still owns Whisper-specific
  model validation, manual model download, watchdog health checks, and
  transcription.
- App startup injects `ProcessManager` into `SpeechService` so the
  `whisper-server` process is tracked for cleanup.

Remaining work:

- Add explicit tests around model path resolution and atomic write behavior.
- Consider replacing the forever-running watchdog loop with a cancellable task
  tied to service shutdown.

### TTS / Piper Runtime

Status: partially centralized.

Findings:

- `src-tauri/src/services/runtime_resource.rs` owns Piper binary and default
  model path resolution plus command setup.
- `src-tauri/src/services/tts_service/mod.rs` still owns synthesis-specific
  stdin/stdout handling and audio playback.
- App startup injects `ProcessManager` into `TtsService` so spawned Piper
  processes are tracked while active.

Remaining work:

- Keep synthesis-specific piping in TTS, but do not add new local binary lookup
  logic there.
- Add a small test seam for config-file resolution if custom voices expand.

### RAG Filesystem And Network

Status: acceptable but should be bounded.

Findings:

- `src-tauri/src/rag/ingestion.rs` reads user-selected files.
- `src-tauri/src/rag/session_memory.rs` writes session memory under the
  workspace.
- `src-tauri/src/rag/embedding.rs` downloads embedding models and writes to a
  model cache.

Remaining work:

- Keep all file ingestion workspace-bound or user-selected.
- Add size limits or explicit caps where a path can read arbitrary files.
- Prefer shared HTTP clients for repeated embedding calls.

### GTSM And External Network

Status: service-owned, performance cleanup remains.

Findings:

- GTSM modules create per-call `reqwest::Client` instances.
- These calls are service-owned and not arbitrary user-controlled web fetches.

Remaining work:

- Introduce shared clients or a lightweight HTTP helper for repeated calls.
- Keep API keys in `SecretService`; do not reintroduce settings-based secrets.

## Non-Goals For This Phase

- Remote MCP support.
- Full frontend restructure.
- RAG scaling redesign.
- Release build tuning beyond current CI/runtime artifact guardrails.

## Phase 3.5 Exit Checklist

- Tool ownership doc is complete.
- Runtime process/resource helper exists.
- Speech and TTS use the helper for resource lookup and process command setup.
- Remaining direct privileged operations are either routed or listed here with a
  clear owner and fix plan.
- `npm run quality:fast`, `npm run test:backend`, and
  `npm run secret:artifacts` pass.
