# Context Display Redesign — Premium Input Panel

## Goal

Redesign context display + handling so it is **accurate**, **model-aware**, and
**flexible**, with one canonical taxonomy shared backend→frontend and a three-tier
display (badge → hover popover → full panel).

Decisions locked with the user:
- **Taxonomy**: adopt the 6 product buckets everywhere — Messages, System tools,
  MCP tools, Skills, System prompt, Meta context.
- **Window source**: the selected model's real context window (`max_context_length`),
  falling back to the run's `max_context_tokens` cap when the model window is unknown.

## Problems being fixed

1. Three divergent naming systems (Rust `SectionCategory`, panel `LayerSummary`
   cards, the target popover) — drift-prone.
2. Tools folded into `system_prompt`; no separate system-vs-MCP accounting.
3. Context window hardcoded to 100K (`RunConfig.max_context_tokens`) — not the
   model's real ceiling. `max_context_tokens` also doubles as the compaction
   trigger, so the two must be carried separately.
4. The hover-popover tier (screenshot 2) does not exist in code.

## Canonical taxonomy (6 buckets)

| Bucket        | Source                                                                 |
|---------------|------------------------------------------------------------------------|
| Messages      | live conversation (`conversation_tokens`)                              |
| System tools  | catalog cost of authorized **built-in** tool definitions               |
| MCP tools     | catalog cost of authorized **`ext:`** tool definitions                 |
| Skills        | skills catalog section                                                 |
| System prompt | safety preamble, agent instructions, rules, canvas, graph, roles       |
| Meta context  | recall + summaries + meta-tool protocol prose                          |

Note on tools: deferred discovery keeps full schemas out of live context, so
System/MCP tool counts measure the **authorized catalog surface** (what the
schemas would cost) — informational, computed once per run from
`authorized_tool_ids`. This is called out in code comments so the number isn't
mistaken for live context cost.

## Backend changes (`src-tauri`)

1. **`agent/runner/context_breakdown.rs`**
   - Replace `SectionCategory` 5-variant enum with the 6 buckets above
     (`Messages`, `SystemTools`, `McpTools`, `Skills`, `SystemPrompt`,
     `MetaContext`). Keep `#[serde(rename_all = "kebab-case")]`.
   - Remap `section_category()` for every `ContextSectionId`.
   - Extend `LayerTotals` + `ContextBreakdownPayload` with `system_tools_tokens`
     and `mcp_tools_tokens`. Add `model_context_window: Option<usize>` distinct
     from `context_window` (the compaction cap) so the UI can show the true
     model ceiling while the cap still drives the amber/rose status.
   - Compute tool catalog cost: for each id in `authorized_tool_ids`, look up its
     `ToolInfo` (name + description + parameters schema), estimate tokens, and
     split by `is_external_tool` (`ext:` prefix).

2. **`agent/middleware/core.rs`** — thread the resolved model window into
   `EnrichmentContext` (new `model_context_window: Option<usize>`), set by the
   runner from the active model's `max_context_length`.

3. **`commands/chat/send.rs`** — resolve the active model's `max_context_length`
   (via the provider/model registry) and pass it into the runner/context, WITHOUT
   overwriting `max_context_tokens` (compaction cap stays independent).

4. **`commands/context_viewer.rs`** — extend `ContextSnapshot` / `LayerSnapshot`
   with the two new tool layers + `model_context_window`; update `id_str` /
   `category_str` for the new enum.

## Frontend changes (`src`)

5. **`lib/types/contextBreakdown.ts`** — rewrite `SectionCategory` to the 6
   buckets; update `SECTION_CATEGORY_COLOR` / `_LABEL`; add
   `systemToolsTokens`, `mcpToolsTokens`, `modelContextWindow` to
   `ContextBreakdown` + `ContextSnapshot`. Keep camelCase contract in sync.

6. **New `context/ContextWindowPopover.tsx`** — the middle tier from screenshot 2:
   header `used / window (util%)`, a stacked bar, and the 6 buckets each with a
   color dot, label, and percentage. Uses `modelContextWindow ?? contextWindow`.

7. **`ContextTrigger.tsx` / `ChatInputFooter.tsx`** — wrap the badge in a
   hover/click popover (Radix `HoverCard` or existing popover primitive) that
   renders `ContextWindowPopover`; clicking still opens the full right panel.

8. **`context/ContextViewerBadge.tsx`** — use `modelContextWindow ?? contextWindow`
   for the denominator so the badge reflects the real model window.

9. **`context/ContextViewerPanel.tsx`** — replace the 5 fixed `LayerSummary`
   cards with the 6 canonical buckets; keep the sorted section list + technical-
   details disclosure; show both the model window and the compaction cap on the
   gauge (cap as a secondary marker).

## Verification

- `cargo build` + `cargo build --tests` (test binary can't launch in this env —
  `STATUS_ENTRYPOINT_NOT_FOUND` — so I'll verify logic by inspection and the
  existing serde-drift tests where they compile).
- `npm run build` (tsc + vite) for the frontend contract.
- Manual: confirm badge/popover/panel all agree and the window tracks the
  selected model.

## Out of scope

- Changing compaction thresholds or the deferred-discovery mechanism.
- Per-message context explosion (kept as one Messages bucket by design).
