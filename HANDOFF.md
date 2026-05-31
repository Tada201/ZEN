# Zen Handoff

Last updated: 2026-05-31

## Current Git State

- Active branch: `main`
- Remote tracking: `origin/main`
- Latest committed checkpoint: see `git log --oneline -n 3`
- Working tree expectation after this handoff is committed: clean
- Published checkpoint before this handoff update: `ddb4c0d Stabilize streaming agent workflow`
- Removed local stale branch: `001-integrated-workbench`
- Remaining remote-only branch: `origin/001-integrated-workbench`

## Required First Reads

Before planning or editing, read:

- `RULES.md`
- `docs/architecture/frontend-rules.md`
- `.agents/rules/agents_response.md`
- `specs/003-streaming-architecture-redesign/plan.md`
- `HANDOFF_INSTRUCTIONS.md`

Use CodeGraph first for architecture/symbol tracing when it works. In this session CodeGraph sometimes returned weak context or transport issues, so targeted `rg`/file reads were used as fallback.

## What Was Completed

### Streaming And TTFT

- Added local-first assistant feedback so the UI responds immediately after send.
- Improved first chunk handling with `chat:chunk:first` and frontend dedupe.
- Reduced frontend chunk buffering issues across mixed text/thought streams.
- Added TTFT markers across DB insert, provider ready, LLM invoked, first chunk, first render, completion/error.
- Stream completion and error events now finalize visible assistant state and clear loading.
- Stop button now immediately marks the visible assistant row as cancelled.
- Backend cancellation emits terminal `chat:done` for cancelled runner/orchestrator paths.
- Parallel tool-result collection now listens to cancellation and aborts pending tool tasks.

### Message Ordering And Reload Stability

- New DB messages now persist millisecond-resolution timestamps.
- DB history query now orders by `created_at` plus `rowid` to avoid same-second reorder bugs.
- Frontend no longer re-sorts fetched messages in a way that can invert user/assistant order after reload.

### Provider And Model Handling

- Added OpenCode provider support and model discovery work.
- Fixed model selector/catalog merge behavior so backend model metadata is normalized into frontend model shape.
- Model selector uses raw model ids where required instead of provider-prefixed values.
- Cached model catalog is used so reload does not leave selector empty while provider fetches.
- Google/Gemini OpenAI-compatible base path updated to `/v1beta/openai`.
- OpenAI-compatible model metadata now reads provider `supported_parameters` where available.
- Provider metadata is used for tools/reasoning capability where possible instead of pure name heuristics.

### Thinking / Reasoning

- OpenAI-compatible streams parse `reasoning`, `reasoning_content`, and `thinking` fields into frontend thought chunks.
- LM Studio reasoning stream parsing was fixed.
- Ollama sends top-level `think` and parses `message.thinking`.
- Anthropic thinking deltas are parsed.
- OpenRouter sends top-level `reasoning` object from effort/budget settings.
- Gemini/Google sends `extra_body.google.thinking_config.include_thoughts` and optional `thinking_budget`.
- Reasoning blocks are preserved in-memory across tool-loop turns via `reasoning_details`.

Known limitation: reasoning details are not fully persisted to DB yet. Anthropic signed/redacted thinking is not replayed as signed Anthropic blocks.

### Markdown, Math, And Render Pacing

- `SmoothMarkdown` normalizes common LaTeX forms:
  - `\[...\]`
  - `\(...\)`
  - bare bracketed display math around aligned/equation environments
- Added display math line-break normalization for KaTeX.
- Streaming render pacing avoids jumping from partial text to final text on done.
- Virtualized message list measures changed rows with `ResizeObserver`.
- Message list stream signature was tightened so fast streams update without excessive full remeasurement.

### Agent Execution UI

- Removed the low-value request pipeline card from normal assistant display.
- Added richer execution trace model/components:
  - agent lifecycle routing
  - tool lifecycle routing
  - action ledger
  - delegation lanes
  - compact tool previews
  - task plan preview model
- Tool call/result events are correlated more consistently with run/batch/execution ids.
- Deleted legacy preview components:
  - `src/atlas/components/chat/tool/ArtifactPreview.tsx`
  - `src/atlas/components/chat/tool/SearchResults.tsx`
  - `src/atlas/components/chat/tool/TerminalWidget.tsx`
  - `src/components/chat/ToolCallCard.tsx`

### Right Panel / UI

- Right panel feature work was restored/improved during the session.
- Generated content/link safety helpers were added under `src/lib/security/`.
- Frontend feature metadata was added under `src/lib/features/`.

## Verification Run Before Commit

Passed:

- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run build`
- `node test/verify-stream-completion-and-abort.mjs`
- `node test/verify-agent-execution-trace-rendering.mjs`
- `node test/verify-stream-reveal-pacing.mjs`

Earlier related checks also passed during the session:

- `node test/verify-first-chunk-dedupe.mjs`
- `npm run test:chat-model-catalog-merge`
- `cargo test --manifest-path src-tauri/Cargo.toml --no-run`

Note: full `cargo test` execution may be unreliable on Windows while `zen.exe` is running or due to `STATUS_ENTRYPOINT_NOT_FOUND`; compile/no-run passed.

## Important Files Recently Changed

Backend:

- `src-tauri/src/commands/chat.rs`
- `src-tauri/src/agent/runner/loop.rs`
- `src-tauri/src/agent/runner/escalation.rs`
- `src-tauri/src/agent/runner/tool_dispatch.rs`
- `src-tauri/src/agent/event_bus.rs`
- `src-tauri/src/db/models.rs`
- `src-tauri/src/db/queries/message.rs`
- `src-tauri/src/db/queries/artifacts.rs`
- `src-tauri/src/llm/openai_compat/stream.rs`
- `src-tauri/src/llm/openai_compat/models.rs`
- `src-tauri/src/llm/openai_compat/types.rs`
- `src-tauri/src/llm/anthropic.rs`
- `src-tauri/src/llm/ollama.rs`
- `src-tauri/src/llm/lmstudio/chat.rs`

Frontend:

- `src/atlas/hooks/chat/useSendMessage.ts`
- `src/atlas/hooks/chat/useChatQueries.ts`
- `src/atlas/hooks/chat/optimisticChatMessages.ts`
- `src/atlas/hooks/chat/localFirstFeedback.ts`
- `src/atlas/hooks/stream/useChatChunkEvent.ts`
- `src/atlas/hooks/useStreamingChat.ts`
- `src/atlas/components/chat/SmoothMarkdown.tsx`
- `src/atlas/components/chat/MarkdownContent.tsx`
- `src/atlas/components/chat/MessageList.tsx`
- `src/atlas/components/chat/messageListStreamSignature.ts`
- `src/atlas/components/chat/AgentExecutionTrace.tsx`
- `src/atlas/components/chat/AssistantMessageTrace.tsx`
- `src/components/settings/ui/ModelInPageSelector.tsx`
- `src/lib/stores/settings/createProviderSlice.ts`
- `src/lib/stores/settings/types.ts`

Tests:

- `test/verify-stream-completion-and-abort.mjs`
- `test/verify-stream-reveal-pacing.mjs`
- `test/verify-agent-execution-trace-rendering.mjs`
- `test/verify-chat-model-catalog-merge.mjs`
- `test/verify-first-chunk-dedupe.mjs`
- Many additional focused verifier scripts under `test/`.

## Remaining High-Value Work

1. Early tool execution:
   - Current behavior waits for provider stream completion before executing tool calls.
   - Codebuff-like CLIs often begin acting as soon as a complete tool call argument object is available.
   - This is the biggest remaining gap for CLI-like task execution speed.

2. Full reasoning persistence:
   - Add DB migration/typed JSON storage for `reasoning_details`.
   - Reload historical reasoning blocks cleanly.
   - Provider-specific replay for Anthropic signed/redacted thinking remains unresolved.

3. Direct IPC channel path:
   - `AgentEvent::emit_via` supports optional channel, but the main chat command path still uses global Tauri events.
   - A direct per-run channel may reduce event ordering/serialization overhead.

4. Provider architecture:
   - Provider registration/fallback/capability logic still has multiple edit points.
   - A provider registry/factory pattern is still recommended by the streaming architecture plan.

5. Tool architecture cleanup:
   - Continue routing privileged tool work through the canonical `ToolService`.
   - Avoid adding new direct tool calls from features.

6. Bundle size:
   - `npm run build` passes but reports large chunks, especially Cesium/maps/diagrams.
   - Continue lazy loading and manual chunk work.

7. Remote branch cleanup:
   - Local stale branch was deleted.
   - Remote `origin/001-integrated-workbench` still exists. Delete only if the owner wants remote cleanup.

## Suggested Smoke Tests For Next Agent/User

After starting the Tauri app:

1. Simple TTFT:
   - Prompt: `Say hello in one short sentence.`
   - Expected: user message and assistant placeholder appear immediately; first token renders quickly; no pipeline clutter.

2. Math render:
   - Prompt: `Prove 1 + 1 = 2 using LaTeX aligned equations.`
   - Expected: KaTeX block renders without overlapping prior messages.

3. Stop button:
   - Prompt: `Write a very long explanation of sorting algorithms.`
   - Click stop mid-stream.
   - Expected: input unlocks immediately, assistant row becomes cancelled, no stuck running state.

4. Tool intent:
   - Prompt: `Check the repo and list the top-level files.`
   - Expected: tool/action trace appears in assistant message, tool cards complete, final answer follows.

5. Reload ordering:
   - Send any prompt, wait for completion, reload app.
   - Expected: user message remains before assistant response.

6. Model selector:
   - Restart app and open model selector before provider fetch completes.
   - Expected: cached models appear; fetched list replaces/merges when ready.

## Notes For Future Agents

- The user prefers direct fixes over long planning.
- Do not run `npm run tauri dev` unless explicitly asked; the app may already be running.
- `cargo check` is acceptable and was used repeatedly.
- Be careful with dirty worktrees. This handoff checkpoint is committed and clean, so future diffs should be easier to inspect.
- Keep frontend UI utilitarian and low-clutter. The user specifically disliked duplicated pipeline/progress displays.
