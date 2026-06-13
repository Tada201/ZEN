# Codex Research Agent Guide

## Purpose

Use a research agent to investigate bugs, regressions, feature wiring, and architectural questions before implementation. The researcher should remove uncertainty and return an implementation-ready handoff so the primary agent does not repeat hours of codebase exploration.

The research agent investigates and verifies. The primary agent owns final judgment, code changes, validation, and communication with the user.

## Required Task Brief

Every research request must define the scope before exploration begins. Include:

- User-visible symptom and exact error text.
- Reproduction steps, including mode, provider, model, settings, and relevant hardware.
- Expected behavior and observed behavior.
- Suspected feature area and entry point.
- Known affected files, symbols, events, commands, tools, or schemas.
- Features that depend on the affected path.
- Recent edits or commits that may be related.
- Explicit exclusions to prevent an unbounded scan.
- Required verification commands or acceptance criteria.

When information is unavailable, mark it as unknown. Do not invent details.

### Example Scope

```text
Bug: Voice board requests attempt to manually spawn the internal voice_display agent.
Observed error: spawn_agent arguments do not match schema.
Expected flow: main voice agent completes, backend automatically starts voice_display, and manage_board emits a scoped board:update event.
Suspected files:
- src/atlas/components/voice/voiceModePrompt.ts
- src/atlas/hooks/chat/useSendMessage.ts
- src-tauri/src/agent/runner/voice_display.rs
- src-tauri/src/agent/tools/spawn_tools.rs
- src-tauri/src/agent/tools/manage_board.rs
Dependent features: voice TTS output, board rendering, subagent delegation, tool schema validation, chat/session isolation.
Out of scope: redesigning the board UI or changing unrelated providers.
```

## Research Workflow

### 1. Read Repository Contracts

Before analysis, read:

1. `RULES.md`
2. `AGENTS.md`
3. `docs/architecture/frontend-rules.md` for frontend work
4. The active specification plan referenced by `AGENTS.md`
5. `.agents/rules/codegraph.md`

Treat these files as architecture contracts, not suggestions.

### 2. Establish Repository State

Record:

- Current branch and commit.
- Dirty files relevant to the investigation.
- Whether affected files contain existing user changes.
- Whether generated files or stale indexes could distort results.

Never revert, overwrite, format, or clean unrelated work.

### 3. Use CodeGraph First

For structural questions, start with `codegraph_context`. Then use at most one focused `codegraph_explore` when possible.

Use:

- `codegraph_search` for definitions.
- `codegraph_callers` and `codegraph_callees` for call relationships.
- `codegraph_impact` before changing a shared symbol.
- `codegraph_trace` for entry-point-to-output paths.
- `codegraph_status` if results appear stale.

Use `rg` or direct reads only for literal strings, exact error messages, configuration keys, generated assets, or files identified by CodeGraph. If CodeGraph is unavailable, state that clearly and perform the same focused trace manually.

### 4. Trace the Complete Runtime Path

Do not stop at the file containing the error. Trace the feature end to end:

```text
user action
-> frontend event/state
-> IPC or network request
-> backend command
-> service/runner/provider
-> stream or event transport
-> frontend reducer/store
-> rendered UI
-> completion, error, cancellation, and persistence
```

For tool or agent bugs, additionally trace:

```text
system prompt
-> advertised tool/agent catalog
-> schema discovery
-> emitted tool arguments
-> envelope normalization
-> allowlist/security checks
-> execution
-> audit/events
-> frontend presentation
```

Identify every boundary where identifiers, schemas, state, or ownership can be lost.

### 5. Separate Evidence from Hypotheses

Classify findings as:

- **Confirmed:** directly demonstrated by source, logs, or a reproducing test.
- **Probable:** strongly supported but requires runtime confirmation.
- **Not reproduced:** plausible but unsupported by current evidence.
- **Invalid/outdated:** no longer true in the current codebase.

Every confirmed finding needs file and line references plus a concise explanation of the runtime consequence.

### 6. Check Dependent Behavior

For each proposed fix, inspect:

- Direct callers and consumers.
- Shared types and schemas across Rust and TypeScript.
- Session/chat/run identity and ordering.
- Streaming, completion, retry, cancellation, and stale-event behavior.
- Persistence and history replay.
- Security boundaries, allowlists, permissions, and sensitive data exposure.
- Empty, malformed, duplicated, delayed, and out-of-order payloads.
- Provider-specific differences and compatibility behavior.
- UI loading, error, disabled, and completed states.
- Existing tests that encode the contract.

### 7. Recommend the Smallest Correct Fix

Prefer changing the narrowest ownership boundary that corrects the underlying contract.

Good fixes:

- Preserve one authoritative owner for an operation.
- Normalize compatibility input at a well-defined boundary.
- Add missing identifiers instead of relying on global state.
- Reuse established stores, events, types, and helpers.
- Add a focused regression test for the exact failure.

Avoid:

- Broad refactors unrelated to the bug.
- Duplicating parsing, event reduction, or business logic.
- Silently accepting arbitrary malformed input.
- UI-only masking of backend lifecycle errors.
- Backend fixes that leave frontend state inconsistent.
- New abstractions without demonstrated reuse or complexity reduction.
- Formatting or metadata churn.

## Coding Quality Standards

When the research task includes an approved patch:

- Read the entire local function and its callers before editing.
- Follow existing naming, error handling, and event conventions.
- Keep data contracts typed and explicit.
- Validate inputs at trust boundaries.
- Preserve cancellation and session isolation.
- Avoid unbounded collections, payloads, tasks, and retries.
- Do not expose internal agents, tools, tokens, or implementation metadata to models or renderers unless required.
- Keep comments limited to non-obvious invariants.
- Use `apply_patch` for manual edits.
- Do not modify unrelated dirty files.
- Add tests proportional to the blast radius.

## Verification Standard

Research is incomplete until the proposed behavior is testable. Recommend or run, when authorized:

1. The smallest focused regression test.
2. Type checking for affected frontend code.
3. Targeted Rust tests or `cargo check --no-default-features` for backend changes.
4. Relevant feature suites.
5. Full `npm test` when shared chat, tools, agents, streaming, or stores are affected.
6. `git diff --check`.
7. Manual runtime steps for hardware, provider, microphone, GPU, or external-service behavior.

Never claim real-device or provider behavior was verified through static tests alone.

## Required Research Handoff

Return one concise report using this structure:

```markdown
# Research Handoff

## Scope
- Symptom:
- Expected behavior:
- Reproduction:
- In scope:
- Out of scope:

## Runtime Flow
1. Entry point with file:line.
2. Important handoff with file:line.
3. Failure boundary with file:line.
4. User-visible result with file:line.

## Findings
### [Severity] Short title
- Status: Confirmed | Probable | Not reproduced | Invalid/outdated
- Evidence: file:line and relevant log/test
- Cause:
- User impact:
- Dependent features:

## Recommended Fix
- Files to change:
- Minimal implementation:
- Compatibility/security considerations:
- Files that should not change:

## Verification
- Existing tests:
- Tests to add:
- Commands to run:
- Manual checks:

## Open Questions
- Only unresolved facts that materially affect implementation.
```

The report must contain enough detail for the primary agent to implement without repeating broad searches. Include exact symbols, payload shapes, setting keys, event names, and ownership boundaries when relevant. Do not paste entire files or large logs.

## Completion Criteria

The research agent is done only when it has:

- Defined the bug or feature boundary.
- Traced the full relevant runtime path.
- Identified the root cause or clearly stated what evidence is missing.
- Assessed dependent features and regression risk.
- Proposed a minimal, codebase-consistent fix.
- Supplied focused and broader verification steps.
- Produced the structured handoff for the primary agent.

Finding a suspicious line is not completion. The goal is an evidence-backed implementation decision.
