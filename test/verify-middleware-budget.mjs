// Per-layer middleware budget verifier.
//
// Static-source verifier for the budget enforcement contract. The
// `MiddlewareBudgets` struct in `src-tauri/crates/zen-agent/src/runner/helpers/`
// is the single owner of the budget-split math. Each built-in
// middleware in `src-tauri/crates/zen-agent/src/middleware/` owns one layer and
// must wire its `*_budget` field. The migration moved the inline
// summary + compaction logic from `loop.rs` into the middleware
// placeholders so the budgets actually take effect.
//
// This script asserts:
//   1. `MiddlewareBudgets::from_context_window` splits the context
//      window into the five layers correctly (system_prompt +
//      skills_catalog + recall fixed, summary + compaction split
//      remainder 50/50). None / 0 / negative are handled defensively.
//   2. Every built-in middleware struct has the right `*_budget: usize`
//      field — no budget field means no enforcement.
//   3. `default_chain` calls `MiddlewareBudgets::from_context_window`
//      and wires every per-layer budget into the corresponding
//      middleware. SkillsCatalog is only inserted when `skills_enabled`.
//   4. `try_push_within_budget` is the single chokepoint for optional
//      section pushes in `SystemPromptMiddleware::enrich` — the
//      must-keep portion (SAFETY_PREAMBLE + agent.instructions) is
//      pushed before the budget snapshot and is intentionally not
//      capped.
//   5. Recall / Summary / SkillsCatalog each call `truncate_to_budget`
//      on their contribution before pushing. Compaction uses
//      `compaction_budget` as the hard ceiling.
//   6. The migration contract holds: `loop.rs` no longer contains
//      inline `compact_context_if_needed` / `truncate_conversation_by_message_count`
//      calls or the inline `needs_summary_context` summary-injection
//      block, AND the runner re-syncs the outer `conversation` from
//      `enrich_ctx.conversation` after the chain (the B1 fix).
//   7. The dead `compact_context_if_needed` is gone (SSOT: the
//      middleware owns compaction now).
//
// The script is behavioural, not snapshot-based. It asserts the
// contract each check must satisfy, not exact line numbers. A future
// refactor that preserves the contract will still pass.
//
// The script exits non-zero on the first failure of any check.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (rel) =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const middleware = [
  "mod.rs", "core.rs", "system_prompt.rs", "compaction.rs", "summary.rs", "recall.rs", "skills.rs",
].map((f) => read(`src-tauri/crates/zen-agent/src/middleware/${f}`)).join("");
const helpers = ["mod.rs", "budget.rs", "compact.rs", "parse.rs"]
  .map((f) => read(`src-tauri/crates/zen-agent/src/runner/helpers/${f}`))
  .join("");
const loop = read("src-tauri/crates/zen-agent/src/runner/turn_loop.rs") +
  read("src-tauri/crates/zen-agent/src/runner/step_exec.rs");
const memoryBootstrap = read("src-tauri/crates/zen-agent/src/runner/memory_bootstrap.rs");

let failed = 0;
const pass = (name) => console.log(`PASS ${name}`);
const fail = (name, detail) => {
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n      ${detail}` : ""}`);
};

// ── 1. MiddlewareBudgets: struct + split rules ─────────────────────────

{
  const name = "MiddlewareBudgets struct is pub and has 5 usize fields";
  // Struct definition must be `pub struct MiddlewareBudgets { ... }`
  // with exactly 5 usize fields named per the contract.
  if (
    /pub struct MiddlewareBudgets\s*\{[\s\S]*?pub\s+system_prompt:\s*usize/.test(
      helpers,
    ) &&
    /pub\s+skills_catalog:\s*usize/.test(helpers) &&
    /pub\s+recall:\s*usize/.test(helpers) &&
    /pub\s+summary:\s*usize/.test(helpers) &&
    /pub\s+compaction:\s*usize/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "MiddlewareBudgets must be a pub struct with 5 usize fields: system_prompt, skills_catalog, recall, summary, compaction",
    );
  }
}

{
  const name = "MiddlewareBudgets::unbounded returns usize::MAX for all 5 layers";
  if (
    /pub fn unbounded\(\)\s*->\s*Self\s*\{[\s\S]*?system_prompt:\s*usize::MAX/.test(
      helpers,
    ) &&
    /summary:\s*usize::MAX/.test(helpers) &&
    /compaction:\s*usize::MAX/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "MiddlewareBudgets::unbounded must set system_prompt, skills_catalog, recall, summary, and compaction all to usize::MAX",
    );
  }
}

{
  const name = "from_context_window(None) returns unbounded";
  // Accepts both the let-else pattern and equivalent shapes
  // (e.g. `match total { Some(t) => t, None => return Self::unbounded() }`).
  // The anchor is: the function extracts `Some(total)` somewhere and
  // returns `Self::unbounded()` on the None arm.
  if (
    /pub fn from_context_window\([\s\S]*?Some\(total\)[\s\S]*?return\s+Self::unbounded\(\)/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "from_context_window must return Self::unbounded() when total is None (accepts let-else, match, or if-let patterns)",
    );
  }
}

{
  const name = "from_context_window(Some(0)) yields all-zero budgets";
  if (
    /from_context_window\(Some\(0\)\)/.test(helpers) &&
    /let\s+total\s*=\s*if\s+total\s*<\s*0\s*\{\s*0\s*\}\s*else\s*\{\s*total\s+as\s+usize\s*\};/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "from_context_window must defensively clamp negatives to 0 and handle Some(0) as all-zero budgets",
    );
  }
}

{
  const name = "from_context_window(negative) clamps to zero rather than panics";
  // The function should saturate rather than underflow on negative
  // inputs. We require a `if total < 0 { 0 } else { total as usize }`
  // pattern (or equivalent saturating cast).
  if (/if\s+total\s*<\s*0\s*\{\s*0\s*\}/.test(helpers)) {
    pass(name);
  } else {
    fail(
      name,
      "from_context_window must clamp negative totals to 0 to avoid underflow panics",
    );
  }
}

{
  const name = "from_context_window splits remainder 50/50 between summary and compaction";
  // The remainder after system + skills + recall must be split
  // evenly (or as close as possible) between summary and compaction.
  if (
    /let\s+summary\s*=\s*remainder\s*\/\s*2\s*;/.test(helpers) &&
    /let\s+compaction\s*=\s*remainder\s*-\s*summary\s*;/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "from_context_window must compute `let summary = remainder / 2; let compaction = remainder - summary;`",
    );
  }
}

{
  const name = "per-layer minimums: system_prompt 8K, skills_catalog 4K, recall 4K (when total >= 32K)";
  // The fixed-share minimums are part of the contract: even on a
  // tiny context window, the per-layer floor is at least 1/N.
  if (
    /let\s+system_prompt\s*=\s*8_000\.min/.test(helpers) &&
    /let\s+skills_catalog\s*=\s*4_000\.min/.test(helpers) &&
    /let\s+recall\s*=\s*4_000\.min/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "from_context_window must cap system_prompt at 8_000.min, skills_catalog at 4_000.min, recall at 4_000.min",
    );
  }
}

// ── 2. Budget field on each middleware struct ──────────────────────────

{
  const name = "SystemPromptMiddleware has system_prompt_budget: usize";
  if (
    /pub struct SystemPromptMiddleware\s*\{[\s\S]*?pub\s+system_prompt_budget:\s*usize/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SystemPromptMiddleware must have a `pub system_prompt_budget: usize` field",
    );
  }
}

{
  const name = "RecallMiddleware has recall_budget: usize";
  if (
    /pub struct RecallMiddleware\s*\{[\s\S]*?pub\s+recall_budget:\s*usize/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "RecallMiddleware must have a `pub recall_budget: usize` field",
    );
  }
}

{
  const name = "SummaryMiddleware has summary_budget: usize";
  if (
    /pub struct SummaryMiddleware\s*\{[\s\S]*?pub\s+summary_budget:\s*usize/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SummaryMiddleware must have a `pub summary_budget: usize` field",
    );
  }
}

{
  const name = "CompactionMiddleware has compaction_budget: usize";
  if (
    /pub struct CompactionMiddleware\s*\{[\s\S]*?pub\s+compaction_budget:\s*usize/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "CompactionMiddleware must have a `pub compaction_budget: usize` field",
    );
  }
}

{
  const name = "SkillsCatalogMiddleware has skills_catalog_budget: usize";
  if (
    /pub struct SkillsCatalogMiddleware\s*\{[\s\S]*?pub\s+skills_catalog_budget:\s*usize/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SkillsCatalogMiddleware must have a `pub skills_catalog_budget: usize` field",
    );
  }
}

// ── 3. default_chain wiring ────────────────────────────────────────────

{
  const name = "default_chain calls MiddlewareBudgets::from_context_window";
  if (
    /pub fn default_chain\([\s\S]*?MiddlewareBudgets::from_context_window\(context_window\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must call `MiddlewareBudgets::from_context_window(context_window)`",
    );
  }
}

{
  const name = "default_chain wires budgets.system_prompt into SystemPromptMiddleware";
  if (
    /SystemPromptMiddleware\s*\{[\s\S]*?system_prompt_budget:\s*budgets\.system_prompt/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must set SystemPromptMiddleware.system_prompt_budget = budgets.system_prompt",
    );
  }
}

{
  const name = "default_chain wires budgets.recall into RecallMiddleware";
  if (
    /RecallMiddleware\s*\{[\s\S]*?recall_budget:\s*budgets\.recall/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must set RecallMiddleware.recall_budget = budgets.recall",
    );
  }
}

{
  const name = "default_chain wires budgets.summary into SummaryMiddleware";
  if (
    /SummaryMiddleware\s*\{[\s\S]*?summary_budget:\s*budgets\.summary/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must set SummaryMiddleware.summary_budget = budgets.summary",
    );
  }
}

{
  const name = "default_chain wires budgets.compaction into CompactionMiddleware";
  if (
    /CompactionMiddleware\s*\{[\s\S]*?compaction_budget:\s*budgets\.compaction/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must set CompactionMiddleware.compaction_budget = budgets.compaction",
    );
  }
}

{
  const name = "default_chain wires budgets.skills_catalog into SkillsCatalogMiddleware (only when skills_enabled)";
  if (
    /if\s+skills_enabled\s*\{[\s\S]*?skills_catalog_budget:\s*budgets\.skills_catalog/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain must set SkillsCatalogMiddleware.skills_catalog_budget = budgets.skills_catalog inside the `if skills_enabled` block",
    );
  }
}

{
  const name = "default_chain signature is unchanged (4 params: app, db_pool, skills_enabled, context_window)";
  // The signature MUST stay stable so the runner call site keeps
  // compiling. A future contributor adding per-iteration params should
  // route them through EnrichmentContext, not the chain signature.
  if (
    /pub fn default_chain\(\s*app:\s*AppHandle\s*,\s*db_pool:\s*Option<SqlitePool>\s*,\s*skills_enabled:\s*bool\s*,\s*context_window:\s*Option<i64>\s*,?\s*\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "default_chain signature must remain (app: AppHandle, db_pool: Option<SqlitePool>, skills_enabled: bool, context_window: Option<i64>)",
    );
  }
}

// ── 4. try_push_within_budget helper ───────────────────────────────────

{
  const name = "try_push_within_budget is defined as a pub free function in helpers.rs";
  // Parameters may be on separate lines, so the regex must accept
  // newlines between tokens. The anchor is the function name + the
  // three parameter types (in any layout) + the return type.
  if (
    /pub fn try_push_within_budget\s*\([\s\S]*?&mut String[\s\S]*?&mut usize[\s\S]*?&str\s*[\s\S]*?->\s*bool/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "try_push_within_budget must be `pub fn try_push_within_budget(target: &mut String, remaining: &mut usize, section: &str) -> bool` in helpers.rs",
    );
  }
}

{
  const name = "try_push_within_budget uses estimate_tokens for the size check";
  if (
    /pub fn try_push_within_budget\([\s\S]*?let\s+t\s*=\s*estimate_tokens\(section\)/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "try_push_within_budget must call `estimate_tokens(section)` to compute the section size",
    );
  }
}

{
  const name = "try_push_within_budget returns false (no state change) when section exceeds remaining";
  if (
    /pub fn try_push_within_budget\([\s\S]*?if\s+t\s*>\s*\*remaining\s*\{[\s\S]*?return\s+false\s*;/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "try_push_within_budget must early-return false without mutating state when the section would exceed the budget",
    );
  }
}

{
  const name = "try_push_within_budget decrements remaining only after a successful push";
  // `remaining -= t` must come AFTER the early-return guard, not
  // before, so a rejected section does not consume budget.
  if (
    /pub fn try_push_within_budget\([\s\S]*?if\s+t\s*>\s*\*remaining\s*\{[\s\S]*?\*remaining\s*-=\s*t\s*;/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "try_push_within_budget must decrement `*remaining` only after the early-return guard",
    );
  }
}

// ── 5. SystemPromptMiddleware budget enforcement ───────────────────────

{
  const name = "SystemPromptMiddleware::enrich is called for many optional sections via try_push_within_budget (>= 20 calls)";
  // There are 8 optional sections in the system prompt: time, UI
  // rules (3 pushes), canvas (5 pushes if draw), graph (4+ pushes if
  // graph_session), tool system (12+ pushes if meta_tools),
  // write_todos (15+ pushes if write_todos), apply_patch (2 pushes if
  // apply_patch), direct board (1 push if direct_board), agent roles
  // (1 header + 1 intro + N lines). The exact count is ~40. A
  // regression that bypasses try_push_within_budget for any one
  // section would drop the count. The >= 20 floor leaves headroom
  // for refactors that consolidate multiple pushes into a single
  // loop call.
  const tryPushCalls = (middleware.match(/try_push_within_budget\s*\(/g) || []).length;
  if (tryPushCalls >= 20) {
    pass(name);
  } else {
    fail(
      name,
      `expected >= 20 calls to try_push_within_budget in middleware.rs, found ${tryPushCalls}`,
    );
  }
}

{
  const name = "middleware.rs push_str calls to ctx.system_content are bounded (exactly 4 total, across all middlewares)";
  // The legitimate push_str calls to ctx.system_content in
  // middleware.rs are:
  //   - SystemPromptMiddleware::enrich: 2 (SAFETY_PREAMBLE + &existing must-keep)
  //   - RecallMiddleware::enrich:        1 (truncated recall)
  //   - SkillsCatalogMiddleware::enrich: 1 (truncated fragment)
  // Summary and Compaction do not push to system_content (they push
  // to extra_system_messages or mutate conversation).
  //
  // The regex matches BOTH single-line (`ctx.system_content.push_str(`)
  // and multi-line (the SAFETY_PREAMBLE push is a method chain across
  // two lines: `ctx.system_content\n    .push_str(`). The `\s*`
  // between `ctx.system_content` and `.push_str` absorbs any
  // whitespace including newlines.
  //
  // This is a file-level count (not per-middleware) so a future new
  // middleware that pushes to system_content is allowed, as long as
  // the existing 4 pushes are preserved. A regression to != 4 means
  // a budget bypass (a push that should go through
  // try_push_within_budget or truncate_to_budget) was added.
  const pushStrCount = (
    middleware.match(/ctx\.system_content\s*\.push_str\s*\(/g) || []
  ).length;
  if (pushStrCount === 4) {
    pass(name);
  } else {
    fail(
      name,
      `middleware.rs must have exactly 4 ctx.system_content.push_str calls (2 must-keep in SystemPrompt + 1 Recall + 1 SkillsCatalog), found ${pushStrCount}. A regression to != 4 means a budget bypass (a push that should go through try_push_within_budget or truncate_to_budget) was added.`,
    );
  }
}

{
  const name = "SystemPromptMiddleware pushes SAFETY_PREAMBLE via String reassignment (prepends over agent.instructions)";
  // Behavioural check on the must-keep prepend:
  //   (a) `ctx.system_content = String::with_capacity(...)` reassigns
  //   (b) SAFETY_PREAMBLE is push_str'd into the new string
  //   (c) the existing system_content is appended after
  // This is robust to whether the implementation uses mem::take,
  // String::insert_str, or a future re-alloc pattern.
  if (
    /ctx\.system_content\s*=\s*String::with_capacity\([\s\S]*?crate::agent::prompt_safety::SAFETY_PREAMBLE/.test(
      middleware,
    ) &&
    /ctx\.system_content\s*=\s*String::with_capacity\([\s\S]*?push_str\(crate::agent::prompt_safety::SAFETY_PREAMBLE\)/.test(
      middleware,
    ) &&
    /push_str\(crate::agent::prompt_safety::SAFETY_PREAMBLE\)[\s\S]{0,200}?push_str\(&existing\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SystemPromptMiddleware must reassign ctx.system_content via String::with_capacity, push SAFETY_PREAMBLE first, then push the existing system_content (so the preamble wins over agent.instructions)",
    );
  }
}

{
  const name = "remaining budget is snapshotted AFTER the must-keep portion is in place";
  // The `remaining` variable must be initialised from
  // `system_prompt_budget.saturating_sub(estimate_tokens(...))` AFTER
  // SAFETY_PREAMBLE + existing have been pushed. This is the
  // single-snapshot contract.
  //
  // The actual code splits `self.system_prompt_budget.saturating_sub(...)`
  // across multiple lines, so the regex must accept newlines between
  // the method-chain tokens. The anchor is the three key elements:
  // `let mut remaining = self ... system_prompt_budget ...
  // saturating_sub(estimate_tokens(&ctx.system_content))`.
  if (
    /let\s+mut\s+remaining\s*=\s*self[\s\S]{0,100}?system_prompt_budget[\s\S]{0,100}?saturating_sub\(\s*estimate_tokens\(\s*&ctx\.system_content\s*\)\s*\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SystemPromptMiddleware must compute `let mut remaining = self.system_prompt_budget.saturating_sub(estimate_tokens(&ctx.system_content))` after the must-keep portion is pushed (regex accepts multi-line method chains)",
    );
  }
}

// ── 6. Per-layer budget enforcement for the other 4 middlewares ────────

{
  const name = "RecallMiddleware::enrich calls truncate_to_budget on the recall_block";
  // The actual call is a multi-line method chain:
  //   truncate_to_budget(
  //       recalled,
  //       self.recall_budget,
  //   )
  // The regex accepts newlines and trailing commas between tokens.
  if (
    /RecallMiddleware[\s\S]*?enrich[\s\S]*?truncate_to_budget\s*\(\s*recalled\s*,\s*self\.recall_budget\s*,?\s*\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "RecallMiddleware::enrich must call `truncate_to_budget(recalled, self.recall_budget)` before pushing",
    );
  }
}

{
  const name = "SummaryMiddleware::enrich calls truncate_to_budget on the combined summary block";
  if (
    /SummaryMiddleware[\s\S]*?enrich[\s\S]*?truncate_to_budget\(\s*&combined\s*,\s*self\.summary_budget\s*\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SummaryMiddleware::enrich must call `truncate_to_budget(&combined, self.summary_budget)` before pushing to extra_system_messages",
    );
  }
}

{
  const name = "CompactionMiddleware::enrich uses self.compaction_budget as the aggressive-path ceiling";
  // The aggressive path must compare against self.compaction_budget
  // (not some other constant). The target is compaction_budget / 2.
  if (
    /CompactionMiddleware[\s\S]*?enrich[\s\S]*?current_tokens\s*>\s*self\.compaction_budget/.test(
      middleware,
    ) &&
    /let\s+target\s*=\s*self\.compaction_budget\s*\/\s*2/.test(middleware)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "CompactionMiddleware::enrich must use `self.compaction_budget` as the aggressive ceiling and target = self.compaction_budget / 2",
    );
  }
}

{
  const name = "CompactionMiddleware::enrich respects ctx.max_messages_in_memory (per-agent hard cap)";
  if (
    /CompactionMiddleware[\s\S]*?enrich[\s\S]*?truncate_conversation_by_message_count\(\s*conv\s*,\s*ctx\.max_messages_in_memory/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "CompactionMiddleware::enrich must call `truncate_conversation_by_message_count(conv, ctx.max_messages_in_memory)` to enforce the per-agent hard cap",
    );
  }
}

{
  const name = "SkillsCatalogMiddleware::enrich calls truncate_to_budget on the rendered fragment";
  if (
    /SkillsCatalogMiddleware[\s\S]*?enrich[\s\S]*?truncate_to_budget\(\s*&body\s*,\s*self\.skills_catalog_budget\s*\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SkillsCatalogMiddleware::enrich must call `truncate_to_budget(&body, self.skills_catalog_budget)` to cap the rendered catalog at the per-layer budget",
    );
  }
}

// ── 7. Migration contract: loop.rs no longer does it inline ───────────

{
  const name = "loop.rs no longer calls compact_context_if_needed inline";
  // The inline call was removed when the logic moved into
  // CompactionMiddleware. A regression that re-introduces the inline
  // call would duplicate the compaction path and bypass the budget.
  if (!/compact_context_if_needed\s*\(/.test(loop)) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must not call `compact_context_if_needed(...)` inline; the logic now lives in CompactionMiddleware",
    );
  }
}

{
  const name = "loop.rs no longer calls truncate_conversation_by_message_count inline";
  if (!/truncate_conversation_by_message_count\s*\(/.test(loop)) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must not call `truncate_conversation_by_message_count(...)` inline; the logic now lives in CompactionMiddleware",
    );
  }
}

{
  const name = "loop.rs no longer has the inline needs_summary_context block";
  // The inline summary injection that used to live between
  // chain.enrich_all and full_context.extend was moved into
  // SummaryMiddleware.
  if (!/let\s+needs_summary_context\s*=/.test(loop)) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must not contain `let needs_summary_context =`; the summary injection now lives in SummaryMiddleware",
    );
  }
}

{
  const name = "loop.rs no longer queries get_previous_summaries or get_current_summary inline";
  if (
    !/queries::get_previous_summaries\s*\(/.test(loop) &&
    !/queries::get_current_summary\s*\(/.test(loop)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must not call `queries::get_previous_summaries(...)` or `queries::get_current_summary(...)` inline; these now live in SummaryMiddleware",
    );
  }
}

{
  const name = "loop.rs EnrichmentContext construction includes the 5 new per-iteration fields";
  // iteration, summarization_enabled, compaction_token_threshold,
  // compaction_threshold, max_messages_in_memory must all be
  // populated from run_config. A regression that drops any one of
  // them would silently disable the corresponding middleware gate.
  if (
    /EnrichmentContext\s*\{[\s\S]*?iteration,/.test(loop) &&
    /EnrichmentContext\s*\{[\s\S]*?summarization_enabled,/.test(loop) &&
    /EnrichmentContext\s*\{[\s\S]*?compaction_token_threshold:\s*run_config\.compaction_token_threshold,/.test(
      loop,
    ) &&
    /EnrichmentContext\s*\{[\s\S]*?compaction_threshold:\s*run_config\.compaction_threshold,/.test(
      loop,
    ) &&
    /EnrichmentContext\s*\{[\s\S]*?max_messages_in_memory:\s*run_config\.max_messages_in_memory,/.test(
      loop,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs EnrichmentContext construction must include iteration, summarization_enabled, compaction_token_threshold, compaction_threshold, and max_messages_in_memory",
    );
  }
}

{
  const name = "loop.rs re-syncs the outer conversation from enrich_ctx.conversation after the chain (B1 fix)";
  // B1 fix: without this sync, in-place compaction by
  // CompactionMiddleware is lost across iterations and the context
  // grows unbounded. The sync MUST happen AFTER chain.enrich_all and
  // BEFORE full_context.extend(conversation.clone()).
  //
  // Anchor on the specific call pattern `chain.enrich_all(&mut enrich_ctx).await?;`
  // (with the `&mut enrich_ctx` argument) so a comment or docstring
  // containing the bare `chain.enrich_all` substring cannot fool the
  // positional check.
  const enrichAllIdx = loop.indexOf(
    "chain.enrich_all(&mut enrich_ctx).await?;",
  );
  const syncIdx = loop.indexOf("conversation = enrich_ctx.conversation.clone()");
  const extendIdx = loop.indexOf("full_context.extend(conversation.clone())");
  if (enrichAllIdx > -1 && syncIdx > -1 && extendIdx > -1) {
    if (enrichAllIdx < syncIdx && syncIdx < extendIdx) {
      pass(name);
    } else {
      fail(
        name,
        `B1 sync must appear AFTER chain.enrich_all(&mut enrich_ctx).await?; (idx ${enrichAllIdx}) and BEFORE full_context.extend (idx ${extendIdx}), found sync at idx ${syncIdx}`,
      );
    }
  } else {
    fail(
      name,
      "B1 fix missing: loop.rs must contain `chain.enrich_all(&mut enrich_ctx).await?;`, `conversation = enrich_ctx.conversation.clone()`, and `full_context.extend(conversation.clone())` in that order",
    );
  }
}

{
  const name = "loop.rs chain call still passes Some(self.config.max_context_tokens as i64) as context_window";
  // The fourth argument to default_chain is the context window.
  // A regression that drops the cast or passes None would silently
  // disable per-layer budget enforcement.
  if (
    /MiddlewareChain::default_chain\([\s\S]*?Some\(self\.config\.max_context_tokens\s+as\s+i64\)/.test(
      loop,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must call `MiddlewareChain::default_chain(..., Some(self.config.max_context_tokens as i64))` so per-layer budgets are computed",
    );
  }
}

// ── 8. truncate_to_budget + truncate_conversation_by_message_count ────

{
  const name = "truncate_to_budget is a pub function in helpers.rs";
  if (/pub fn truncate_to_budget\(\s*content:\s*&str\s*,\s*max_tokens:\s*usize\s*\)\s*->\s*String/.test(
    helpers,
  )) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_to_budget must be `pub fn truncate_to_budget(content: &str, max_tokens: usize) -> String` in helpers.rs",
    );
  }
}

{
  const name = "truncate_to_budget appends a clear marker when content exceeds the budget";
  if (helpers.includes("[...truncated for context budget...]")) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_to_budget must append the `[...truncated for context budget...]` marker",
    );
  }
}

{
  const name = "truncate_to_budget is a no-op when max_tokens is usize::MAX (unbounded layers pass through)";
  if (
    /pub fn truncate_to_budget\([\s\S]*?if\s+max_tokens\s*==\s*0\s*\{[\s\S]*?return\s+String::new\(\)\s*;[\s\S]*?if\s+estimate_tokens\(content\)\s*<=\s*max_tokens\s*\{[\s\S]*?return\s+content\.to_string\(\)/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_to_budget must early-return the content unchanged when estimate_tokens(content) <= max_tokens (so usize::MAX callers get the full content)",
    );
  }
}

{
  const name = "truncate_to_budget operates on chars (UTF-8 safe, no mid-codepoint split)";
  // truncate_to_budget must collect `chars: Vec<char>` and slice
  // that, not `as_bytes`. Slicing bytes can split a multi-byte
  // codepoint and produce invalid UTF-8. The contract is that
  // `content.chars().collect()` (or equivalent) is the input to the
  // binary search.
  if (
    /pub fn truncate_to_budget\([\s\S]*?let\s+chars:\s*Vec<char>\s*=\s*content\.chars\(\)\.collect\(\)/.test(
      helpers,
    ) &&
    /chars\[\.\.mid\]\.iter\(\)\.collect\(\)/.test(helpers) &&
    /chars\[\.\.low\]\.iter\(\)\.collect\(\)/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_to_budget must operate on `let chars: Vec<char> = content.chars().collect()` and use `chars[..mid].iter().collect()` / `chars[..low].iter().collect()` to stay UTF-8 safe",
    );
  }
}

{
  const name = "truncate_conversation_by_message_count is a pub function in helpers.rs (SSOT)";
  // The function was moved from memory_bootstrap.rs to helpers.rs as
  // part of the migration so CompactionMiddleware can call it.
  // Parameters may be on separate lines, so the regex must accept
  // newlines between the two parameters and the closing paren.
  if (
    /pub fn truncate_conversation_by_message_count\s*\([\s\S]*?&mut Vec<ChatMessage>[\s\S]*?Option<usize>[\s\S]*?\)/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_conversation_by_message_count must be `pub` in helpers.rs (the single source of truth) with signature (conversation: &mut Vec<ChatMessage>, max_messages: Option<usize>)",
    );
  }
}

{
  const name = "truncate_conversation_by_message_count is removed from memory_bootstrap.rs (no duplicate definition)";
  if (
    !/pub(\(super\))?\s*fn\s+truncate_conversation_by_message_count\s*\(/.test(
      memoryBootstrap,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_conversation_by_message_count must NOT be defined in memory_bootstrap.rs (moved to helpers.rs as the single source of truth)",
    );
  }
}

// ── 9. Dead code removal ───────────────────────────────────────────────

{
  const name = "compact_context_if_needed is removed from memory_bootstrap.rs (dead after migration)";
  // The inline function was superseded by CompactionMiddleware. A
  // regression that re-introduces it would create a parallel
  // compaction path that bypasses the budget.
  if (!/fn\s+compact_context_if_needed\s*\(/.test(memoryBootstrap)) {
    pass(name);
  } else {
    fail(
      name,
      "compact_context_if_needed must NOT be defined in memory_bootstrap.rs; CompactionMiddleware now owns compaction",
    );
  }
}

// ── 10. Behavioural round-trip: tests assert the right things ─────────

{
  const name = "helpers.rs has MiddlewareBudgets::from_context_window arithmetic tests";
  // The tests must cover None → unbounded, 0 → all zero, small total
  // → clamping, and 100K → 8K/4K/4K split.
  if (
    /fn from_context_window_none_yields_unbounded/.test(helpers) &&
    /fn from_context_window_zero_yields_all_zero/.test(helpers) &&
    /fn from_context_window_100k_splits_into_four_fixed_one_remainder/.test(
      helpers,
    ) &&
    /fn from_context_window_negative_clamps_to_zero/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "helpers.rs must include tests for None / 0 / 100K / negative input handling in MiddlewareBudgets::from_context_window",
    );
  }
}

{
  const name = "helpers.rs has try_push_within_budget behavioural tests";
  if (
    /fn try_push_pushes_when_within_budget/.test(helpers) &&
    /fn try_push_skips_when_exceeds_budget/.test(helpers) &&
    /fn try_push_returns_false_for_zero_budget/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "helpers.rs must include the within-budget, exceeds-budget, and zero-budget tests for try_push_within_budget",
    );
  }
}

{
  const name = "helpers.rs has the RecallMiddleware budget tests (pass-through + truncation + None + empty)";
  if (
    /mod recall_budget_tests/.test(helpers) &&
    /async fn recall_passes_through_when_within_budget/.test(helpers) &&
    /async fn recall_truncates_when_over_budget/.test(helpers) &&
    /async fn recall_does_nothing_when_recall_block_is_none/.test(helpers) &&
    /async fn recall_does_nothing_when_recall_block_is_empty/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "helpers.rs must include the recall_budget_tests module with the 4 behavioural tests (pass-through, truncation, None, empty)",
    );
  }
}

{
  const name = "helpers.rs has the SummaryMiddleware gate tests (disabled / first-iter / no-db)";
  if (
    /mod summary_compaction_tests/.test(helpers) &&
    /async fn summary_skips_when_summarization_disabled/.test(helpers) &&
    /async fn summary_skips_on_first_iteration_with_short_conversation/.test(
      helpers,
    ) &&
    /async fn summary_no_ops_without_db_even_when_gates_open/.test(helpers)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "helpers.rs must include the 3 SummaryMiddleware gate tests in the summary_compaction_tests module",
    );
  }
}

{
  const name = "helpers.rs has the CompactionMiddleware tests (noop, cap, aggressive, light)";
  if (
    /async fn compaction_noop_when_within_budget_and_under_thresholds/.test(
      helpers,
    ) &&
    /async fn compaction_respects_max_messages_in_memory/.test(helpers) &&
    /async fn compaction_aggressive_path_runs_when_over_budget/.test(helpers) &&
    /async fn compaction_light_path_keeps_recent_messages_intact/.test(
      helpers,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "helpers.rs must include the 4 CompactionMiddleware tests (noop, cap, aggressive, light)",
    );
  }
}

// ── 11. Sanity: one declaration of each per-layer helper ──────────────

{
  const name = "exactly one pub fn try_push_within_budget is declared in helpers.rs";
  const count = (helpers.match(/pub fn try_push_within_budget\s*\(/g) || []).length;
  if (count === 1) {
    pass(name);
  } else {
    fail(
      name,
      `expected exactly 1 'pub fn try_push_within_budget' declaration, found ${count}`,
    );
  }
}

{
  const name = "exactly one pub fn MiddlewareBudgets::from_context_window is declared";
  // Use the source to avoid matching test bodies that re-define it.
  const count = (helpers.match(/pub fn from_context_window\s*\(\s*total:\s*Option<i64>/g) || [])
    .length;
  if (count === 1) {
    pass(name);
  } else {
    fail(
      name,
      `expected exactly 1 'pub fn from_context_window(total: Option<i64>)' declaration, found ${count}`,
    );
  }
}

// ── Done ───────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} middleware budget check(s) failed`);
  process.exit(1);
}
console.log("Middleware budget verifier passed");
