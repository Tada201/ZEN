# Codex/ChatGPT-style tool call & execution UX

Make the chat timeline's tool-call cards read like Codex/ChatGPT: one quiet
action line in the execution trace (e.g. "Editing `foo.rs`", "Updated `foo.rs`
+12 −3"), expandable into a proper detail view — a **diff viewer** for file
edits, a clean **input box → output box** split for other tools, and a rendered
**image** for image generation. Governed by `RULES.md` §"Chat Timeline
Rendering" (concise summaries by default; raw payloads only behind an explicit
diagnostic disclosure).

Confirmed decisions:
- Orchestration metadata (batch IDs, iteration counts, agent-owner chains,
  handoff summaries): **hide completely** from chat cards.
- Parallel tool calls: **flatten to a simple vertical list** (drop batch-lane
  grid + progress bars).

## Files touched

Frontend only — no backend changes needed (edit tools already return diffs,
image tool already returns `image_uri`).

1. `src/atlas/components/chat/ToolCallCard.tsx` — collapsed line + expansion body.
2. `src/atlas/components/chat/AgentExecutionTrace.tsx` — quiet header, flatten list.
3. `src/atlas/components/chat/AssistantMessage.tsx` — drop duplicate status rows.
4. `src/atlas/components/chat/AssistantMessageTrace.tsx` — trim `chat_status` rows.
5. `src/atlas/components/chat/AgentDelegationLane.tsx` — sole subagent UI.
6. **NEW** `src/atlas/components/chat/tool/parseUnifiedDiff.ts` — diff-string → hunks.
7. **NEW** `src/atlas/components/chat/tool/ToolDetailView.tsx` — input/output panels.
8. `test/verify-tool-execution-card-ux.mjs` — update pinned contract.

Reused as-is: `DiffCard` render primitive (hunks/add/remove styling already
built at [DiffCard.tsx](../../../src/atlas/components/genui/premium/DiffCard.tsx)),
`toolOutputPreview.ts` parsing, image auto-inject + `toAssetUrl` +
`isSafeGeneratedHref` (image-in-chat path already works, documented below).

## 1. Collapsed action line (in the execution trace)

Each `ToolTraceRow` collapsed line = status icon + verb + target + a compact
delta, matching Codex phrasing:
- File edit: "Editing `foo.rs`" (running) → "Updated `foo.rs` +12 −3" (done),
  using `FileChange.linesAdded/linesRemoved` already parsed by
  `toolOutputPreview`. Read: "Read `foo.rs`". Create: "Created `foo.rs`".
- Terminal: "Ran `cargo test`" → result summary ("Tests passed: 42 passed").
- Search: "Searched the web · *query*".
- Image: "Generated image · *prompt excerpt*".
- Remove the text status **pill** ([ToolCallCard.tsx:160-170](../../../src/atlas/components/chat/ToolCallCard.tsx#L160)) — colored icon + delta carry state. Keep duration.
- **Remove the metadata footer entirely** ([ToolCallCard.tsx:219-224](../../../src/atlas/components/chat/ToolCallCard.tsx#L219)) — no agent/batch/iter/filler.

## 2. Expansion body — routed by tool kind (new `ToolDetailView`)

The expanded card dispatches on what the output contains:

**(a) File edits → diff viewer.** When `outputPreview.files[].diff` exists, parse
the unified-diff string into `{ hunks, additions, deletions }` via the new
`parseUnifiedDiff.ts`, then render with the existing `DiffCard` primitive (it
already does add/remove/context line styling + hunk headers). This gives the
"agentic coding app" diff-on-expand the user asked for. Multiple files → one
`DiffCard` per file. Files with no diff string (created) → show the new-content
snippet via `CodeBlock`.

**(b) Image generation → rendered image.** Input panel shows the **prompt**
(`input.prompt`/`input.query`); output panel renders the image from
`outputPreview.imageUri` through `toAssetUrl` (same path as chat). A "View /
Export to workspace" affordance mirrors `InteractiveImage`.

**(c) Other/unconventional tools → Input box then Output box.** Two labelled,
prettified panels stacked vertically:
- **Input**: pretty-printed args (`JSON.stringify(input, null, 2)`) in a
  monospace panel with a header "Input", secrets redacted (reuse existing
  `redactDisplayValue`).
- **Output**: for terminal tools, a terminal panel — `$ command` header,
  stdout/stderr `<pre>`, exit-code chip (green 0 / red non-zero) from
  `outputPreview.stdout/stderr/exitCode`. For everything else, the result
  preview (search results / summary / content) or pretty-printed JSON.
- Keep the "Technical details" `<details>` as the last-resort raw disclosure
  for errors, satisfying RULES.md.

Approval context + Deny/Approve controls stay as they are.

## 3. AgentExecutionTrace — quiet header + flat list

- Collapsed header label: N===1 → the single tool's action line; N>1 → "Ran N
  tools" (+ "· N running" / "· N failed" only when relevant). Replaces the
  6-fragment `collapsedSummary` ([AgentExecutionTrace.tsx:117](../../../src/atlas/components/chat/AgentExecutionTrace.tsx#L117)).
- Remove the batch metadata chip row ([AgentExecutionTrace.tsx:194-208](../../../src/atlas/components/chat/AgentExecutionTrace.tsx#L194)).
- Flatten: drop `shouldShowBatchLanes`/`ToolBatchLane` grid + progress bars;
  always render a flat vertical `ToolTraceRow` list with the thin connector line.
  Delete the now-unused `ToolBatchLane` component.

## 4. Kill duplicate `chat_status` action rows

`chat_status` phases (`Preparing tool call`, `Tool call ready`, `Provider
ready`, `Agent is working`) duplicate the tool card. In `AssistantMessage.tsx`
tighten `VISIBLE_CHAT_STATUS_PHASES` so they stop rendering alongside the trace.
Keep `clarification_request`, `approval_request`, and error rows (RULES.md
requires approvals/errors stay visible).

## 5. Unify subagent delegation

Make `AgentDelegationLane` the single delegation UI ("Delegated to X · Ns",
expandable to task/result). Remove `ExpandableSubAgentCard.tsx` after confirming
no live render site remains (grep shows only tests + self reference it).

## How local generated images reach the chat (already works — for reference)

`generate_image` returns `{ status, image_uri: "asset://localhost/.../generated_images/..." }`.
On the `tool:complete` event, [useToolEvents.ts:155](../../../src/atlas/hooks/stream/useToolEvents.ts#L155)
appends `![Generated Image](<image_uri>)` to the owning assistant message.
`MarkdownContent`'s `img` renderer → `InteractiveImage` → `toAssetUrl`
(`convertFileSrc`) → Tauri asset protocol; `isSafeGeneratedHref`
([generatedLinks.ts:57](../../../src/lib/security/generatedLinks.ts#L57)) allows
the `generated_images` dir. No change needed; the tool card just adds an
in-card preview of the same URI.

## Verification

1. Update + run `node test/verify-tool-execution-card-ux.mjs` — assert footer
   metadata gone, diff viewer present for file edits, input/output split for
   other tools, image render for image gen. Keep approval/error/grouping asserts.
2. Run neighbouring verifiers (`verify-agent-delegation-lane-model.mjs`,
   `verify-subagent-*`); adjust only where they pin removed behavior.
3. `npm run build` (tsc + vite) clean — no `any`, no unused symbols after
   deleting `ToolBatchLane`/`ExpandableSubAgentCard`.
4. Manual `npm run dev:tauri`: run a turn exercising an edit_file, a terminal
   command, a web_search, and generate_image. Confirm each collapses to one
   clean line and expands to diff / terminal / input+output / image respectively.

## Risks / tradeoffs

- Unified-diff parsing is the one new logic surface; keep it small and unit-test
  it in the verifier. Malformed diffs fall back to the raw `CodeBlock`.
- Removing batch lanes loses parallel-progress visualization (accepted);
  per-row status + header "N running" still convey it.
- Deleting `ExpandableSubAgentCard`/`ToolBatchLane` is safe only after grep
  confirms no live callers — verified pre-delete.
