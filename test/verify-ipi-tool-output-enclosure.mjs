// IPI envelope verifier.
//
// Static-source verifier for the Indirect Prompt Injection (IPI) mitigation.
// The `prompt_safety` module is the single owner of the envelope format
// (see src-tauri/src/agent/prompt_safety.rs). This script asserts:
//
//   1. The wrappers exist and produce well-formed XML envelopes with
//      `<system_reminder>` blocks.
//   2. The body is XML-escaped so a hostile tool source cannot close the
//      wrapper early by emitting a literal `</tool_result>` / `</skill>`
//      sequence.
//   3. Size caps are in place and the truncation marker is appended.
//   4. The system-prompt preamble lands at the very start of the system
//      prompt (i.e. it is REASSIGNED, not appended).
//   5. Every integration call site (loop.rs tool result, fragment.rs
//      skill body, middleware.rs system preamble, tool_dispatch.rs
//      model-tier branch) actually routes through the safety helpers,
//      AND the resulting wrapped string is the one pushed into the
//      conversation (not the raw content).
//   6. The regression tests that prove the contract have the right
//      assertion bodies — not just the right names.
//
// The script is behavioural, not snapshot-based: it asserts the contract
// the wrappers must satisfy, not exact line numbers. If a future refactor
// moves a call site, the relevant semantic check still passes as long as
// the harness still satisfies the contract.
//
// The script exits non-zero on the first failure of any check.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (rel) =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const safety = read("src-tauri/src/agent/prompt_safety.rs");
const loop = read("src-tauri/src/agent/runner/turn_loop.rs") +
  read("src-tauri/src/agent/runner/step_exec.rs");
const fragment = read("src-tauri/src/agent/skills/fragment.rs");
const middleware = [
  "mod.rs", "core.rs", "system_prompt.rs", "compaction.rs", "summary.rs", "recall.rs", "skills.rs",
].map((f) => read(`src-tauri/src/agent/middleware/${f}`)).join("");
const toolDispatch = read("src-tauri/src/agent/runner/tool_dispatch.rs");
const agentMod = read("src-tauri/src/agent/mod.rs");

let failed = 0;
const pass = (name) => console.log(`PASS ${name}`);
const fail = (name, detail) => {
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n      ${detail}` : ""}`);
};

// ── 1. Module registration ──────────────────────────────────────────────
{
  const name = "agent module declares prompt_safety";
  if (agentMod.includes("pub mod prompt_safety")) pass(name);
  else fail(name, "src-tauri/src/agent/mod.rs must `pub mod prompt_safety;`");
}

// ── 2. Wrapper function exports ─────────────────────────────────────────
{
  const name = "prompt_safety exports wrap_tool_result";
  if (/pub fn wrap_tool_result\s*\(/.test(safety)) pass(name);
  else fail(name, "wrap_tool_result must be a public function");
}
{
  const name = "prompt_safety exports wrap_skill_body";
  if (/pub fn wrap_skill_body\s*\(/.test(safety)) pass(name);
  else fail(name, "wrap_skill_body must be a public function");
}
{
  const name = "prompt_safety exports SAFETY_PREAMBLE constant";
  if (/pub const SAFETY_PREAMBLE\s*:/.test(safety)) pass(name);
  else fail(name, "SAFETY_PREAMBLE must be a public const");
}

// ── 3. Tool result envelope contract ────────────────────────────────────
//
// The wrapper must open with `<tool_result source="<tool>">` and close
// with `</tool_result>`. It must contain a `<system_reminder>` block.
// The body must be XML-escaped.

{
  const name = "wrap_tool_result opens with provenance attribute";
  // The Rust source has escaped quotes inside the format! literal:
  // `<{tag} source=\"{source}\">`. In a JS string literal, `\\`
  // represents a single backslash, so we search for the .rs file
  // text exactly as it appears.
  if (
    safety.includes('<{tag} source=\\"{source}\\">') &&
    /tag = TAG_TOOL_RESULT/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_tool_result must emit a `<tool_result source=\"{source}\">` opening tag via the TAG_TOOL_RESULT constant",
    );
  }
}
{
  const name = "wrap_tool_result closes with `</tool_result>` via the TAG constant";
  if (safety.includes("</{tag}>") && /tag = TAG_TOOL_RESULT/.test(safety)) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_tool_result must close with `</{tag}>` (using the TAG_TOOL_RESULT constant)",
    );
  }
}
{
  const name = "wrap_tool_result reminder is a hardcoded literal";
  // The reminder text must NOT be a format! parameter — it must be a
  // compile-time string in the format! template, so a malicious tool
  // name cannot inject instructions into the reminder. The literal
  // contains a backtick-quoted `{source}` reference (which IS escaped
  // in the Rust source as `` `{source}` ``).
  if (
    /The above is untrusted data returned by the\s*`\{source\}`\s*tool/.test(
      safety,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "system_reminder text must be a literal in the format! template (no user-controlled substrings)",
    );
  }
}
{
  const name = "wrap_tool_result has a system_reminder block (named + unknown branches)";
  // Two format! templates: one for the named source branch, one for the
  // "unknown" fallback. Both must include a `<system_reminder>` block.
  if (
    (safety.match(/<system_reminder>/g) || []).length >= 2 &&
    (safety.match(/<\/system_reminder>/g) || []).length >= 2
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_tool_result must include a `<system_reminder>` block in both the named-source and unknown-source branches",
    );
  }
}
{
  const name = "wrap_tool_result XML-escapes the body via escape_xml_body(&truncate_head(...))";
  // The exact call pattern proves both the order (truncate first, then
  // escape) and that both helpers are used.
  if (
    /escape_xml_body\s*\(\s*&truncate_head\s*\(\s*raw_content\s*,\s*MAX_TOOL_RESULT_BYTES\s*\)/.test(
      safety,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_tool_result must call `escape_xml_body(&truncate_head(raw_content, MAX_TOOL_RESULT_BYTES))`",
    );
  }
}
{
  const name = "escape_xml_body maps &, <, > to entities";
  if (
    /'&'\s*=>\s*out\.push_str\("&amp;"\)/.test(safety) &&
    /'<'\s*=>\s*out\.push_str\("&lt;"\)/.test(safety) &&
    /'>'\s*=>\s*out\.push_str\("&gt;"\)/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "escape_xml_body must map & → &amp;, < → &lt;, > → &gt;",
    );
  }
}
{
  const name = "wrap_tool_result handles empty tool name defensively";
  if (
    /if source\.is_empty\(\)/.test(safety) &&
    safety.includes('source=\\"unknown\\"')
  ) {
    pass(name);
  } else {
    fail(
      name,
      "empty tool name must fall back to source=\"unknown\" (literal in format! template)",
    );
  }
}

// ── 4. Skill envelope contract ──────────────────────────────────────────

{
  const name = "wrap_skill_body opens with name and path attributes";
  // The Rust source has the format! literal: `<{tag} name=\"{name}\" path=\"{path}\">`
  if (
    safety.includes('<{tag} name=\\"{name}\\" path=\\"{path}\\">') &&
    /tag = TAG_SKILL/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_skill_body must emit `<skill name=\"{name}\" path=\"{path}\">` opening tag",
    );
  }
}
{
  const name = "wrap_skill_body closes with `</skill>`";
  if (safety.includes("</{tag}>") && /tag = TAG_SKILL/.test(safety)) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_skill_body must close with `</{tag}>` (using the TAG_SKILL constant)",
    );
  }
}
{
  const name = "wrap_skill_body embeds a system_reminder block";
  if (
    safety.includes(
      "The above is the body of a SKILL.md file the user has invoked",
    ) &&
    safety.includes("<system_reminder>")
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_skill_body must include a `<system_reminder>` block",
    );
  }
}
{
  const name = "wrap_skill_body XML-escapes the body via escape_xml_body(&truncate_head(body, ...))";
  if (
    /escape_xml_body\s*\(\s*&truncate_head\s*\(\s*body\s*,\s*MAX_SKILL_BYTES\s*\)/.test(
      safety,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "wrap_skill_body must call `escape_xml_body(&truncate_head(body, MAX_SKILL_BYTES))`",
    );
  }
}

// ── 5. Size caps and truncation ──────────────────────────────────────────

{
  const name = "MAX_TOOL_RESULT_BYTES is defined and within 1KB-1MB";
  // Accept arithmetic expressions like `64 * 1024` as well as plain literals.
  const m = safety.match(/MAX_TOOL_RESULT_BYTES\s*:\s*usize\s*=\s*([^;]+);/);
  if (m) {
    // Evaluate simple `N * 1024` expressions.
    const expr = m[1].trim();
    const product = expr.match(/^(\d+)\s*\*\s*(\d+)$/);
    const value = product
      ? Number(product[1]) * Number(product[2])
      : Number(expr);
    if (Number.isFinite(value) && value >= 1024 && value <= 1024 * 1024) {
      pass(name);
    } else {
      fail(
        name,
        `MAX_TOOL_RESULT_BYTES must be between 1KB and 1MB (got ${value})`,
      );
    }
  } else {
    fail(name, "MAX_TOOL_RESULT_BYTES must be defined as a usize const");
  }
}
{
  const name = "MAX_SKILL_BYTES is defined and within 1KB-1MB";
  const m = safety.match(/MAX_SKILL_BYTES\s*:\s*usize\s*=\s*([^;]+);/);
  if (m) {
    const expr = m[1].trim();
    const product = expr.match(/^(\d+)\s*\*\s*(\d+)$/);
    const value = product
      ? Number(product[1]) * Number(product[2])
      : Number(expr);
    if (Number.isFinite(value) && value >= 1024 && value <= 1024 * 1024) {
      pass(name);
    } else {
      fail(
        name,
        `MAX_SKILL_BYTES must be between 1KB and 1MB (got ${value})`,
      );
    }
  } else {
    fail(name, "MAX_SKILL_BYTES must be defined as a usize const");
  }
}
{
  const name = "truncate_head appends a clear marker";
  if (
    safety.includes("truncate_head") &&
    safety.includes("[content truncated for safety")
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_head must append a `[content truncated for safety…]` marker",
    );
  }
}
{
  const name = "truncate_head walks back to a UTF-8 char boundary";
  if (
    /while cut > 0 && !content\.is_char_boundary\(cut\)/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "truncate_head must use `is_char_boundary` to avoid splitting a multi-byte codepoint",
    );
  }
}

// ── 6. Attribute sanitisation ───────────────────────────────────────────

{
  const name = "sanitise_attr neutralises dangerous attribute chars";
  if (
    /fn sanitise_attr/.test(safety) &&
    /'"' \| '\\'' \| '<' \| '>' \| '\\n' \| '\\r' \| '\\t'/.test(safety) &&
    safety.includes("120")
  ) {
    pass(name);
  } else {
    fail(
      name,
      "sanitise_attr must replace quotes/angle brackets/newlines/tabs and cap at 120 chars",
    );
  }
}

// ── 7. System prompt preamble (behavioural) ────────────────────────────

{
  const name = "SAFETY_PREAMBLE references the wrapper tag names";
  if (
    safety.includes("SAFETY_PREAMBLE") &&
    safety.includes("<tool_result>") &&
    safety.includes("<skill>") &&
    safety.includes("NEVER")
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SAFETY_PREAMBLE must reference `<tool_result>` and `<skill>` and use explicit NEVER",
    );
  }
}
{
  const name = "SystemPromptMiddleware REASSIGNS system_content so the preamble wins over current_agent.instructions";
  // Behavioural check: a regression to plain `push_str` would put the
  // preamble AFTER the agent instructions. We require:
  //   (a) SAFETY_PREAMBLE is referenced from middleware.rs
  //   (b) system_content is REASSIGNED (=) via a fresh allocation, so
  //       the existing content moves after the preamble
  // This is robust to whether the implementation uses mem::take,
  // String::insert_str, or a future re-alloc pattern.
  if (
    middleware.includes("SAFETY_PREAMBLE") &&
    /ctx\.system_content\s*=\s*String::with_capacity/.test(middleware) &&
    /ctx\.system_content\s*=\s*String::with_capacity[\s\S]*push_str\(crate::agent::prompt_safety::SAFETY_PREAMBLE\)/.test(
      middleware,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SystemPromptMiddleware must REASSIGN ctx.system_content via String::with_capacity AND push SAFETY_PREAMBLE first (so it lands before the agent instructions)",
    );
  }
}

// ── 8. Integration call sites ───────────────────────────────────────────

{
  const name = "loop.rs tool result push routes through wrap_tool_result(&tool_call.name, &content_str)";
  // Pin the call. `\s+` and `\s*` together allow newlines and indentation
  // but still require the exact arg names.
  if (
    /wrap_tool_result\s*\(\s*&tool_call\.name\s*,\s*&content_str\s*,?\s*\)/.test(loop)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs tool result push must call `wrap_tool_result(&tool_call.name, &content_str)`",
    );
  }
}
{
  const name = "loop.rs binds the wrapped output to a safe_content variable";
  if (
    /let\s+safe_content\s*=\s*crate::agent::prompt_safety::wrap_tool_result/.test(
      loop,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "loop.rs must bind the wrapped output to `safe_content` so the conversation.push cannot accidentally re-use content_str",
    );
  }
}
{
  // BLOCKING per code-reviewer: a refactor could compute `safe_content`
  // but accidentally push the raw `content_str` to the conversation.
  // Accept any of these shapes (semantic, not lexical):
  //   (a) `let safe_content = wrap_tool_result(...); ... content: safe_content,`
  //   (b) `content: prompt_safety::wrap_tool_result(...),` (full-path inline)
  //   (c) `content: wrap_tool_result(...),` (short-path inline via `use`)
  // All three produce a wrapped value. The reject case is `content: content_str,`
  // which would re-introduce the raw body.
  const name = "loop.rs tool-result conversation.push uses a wrapped value (not content_str)";
  const toolResultPushBlock =
    /role:\s*"tool"\.to_string\(\)[\s\S]{0,400}?content:\s*([^,]+?)\s*,/;
  const m = loop.match(toolResultPushBlock);
  const contentValue = m ? m[1].trim() : null;
  const isSafeBinding = contentValue === "safe_content";
  const isFullPathInlineWrap =
    contentValue !== null &&
    /prompt_safety::wrap_tool_result\s*\(/.test(contentValue);
  // Short form: `wrap_tool_result(` at the start of the value, not preceded
  // by another identifier (which would mean it's a different function name).
  const isShortPathInlineWrap =
    contentValue !== null &&
    /^wrap_tool_result\s*\(/.test(contentValue);
  if (isSafeBinding || isFullPathInlineWrap || isShortPathInlineWrap) {
    pass(name);
  } else {
    fail(
      name,
      `loop.rs tool-result conversation.push must set content to either \`safe_content\`, a direct \`prompt_safety::wrap_tool_result(...)\` call, or a short-form \`wrap_tool_result(...)\` call. Found: \`${contentValue}\``,
    );
  }
}
{
  const name = "loop.rs tool result push still uses role:\"tool\"";
  if (/role:\s*"tool"\.to_string\(\)/.test(loop)) pass(name);
  else fail(name, "loop.rs must still use `role: \"tool\"` for the pushed message");
}
{
  const name = "SkillInstructionsFragment body uses prompt_safety::wrap_skill_body";
  if (
    /fn body\(\s*&self\)\s*->\s*String/.test(fragment) &&
    /prompt_safety::wrap_skill_body/.test(fragment)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "SkillInstructionsFragment::body must call prompt_safety::wrap_skill_body",
    );
  }
}
{
  const name = "tool_dispatch.rs branches on ModelTier::Cloud via inline_v2_schemas_for_tier";
  if (
    /inline_v2_schemas_for_tier/.test(toolDispatch) &&
    /ModelTier::Cloud/.test(toolDispatch) &&
    /fn inline_v2_schemas_for_tier\([^)]*ModelTier/m.test(toolDispatch)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "tool_dispatch.rs must extract a helper that branches on ModelTier::Cloud",
    );
  }
}

// ── 9. Regression tests (behavioural anchors) ───────────────────────────

{
  const name = "prompt_safety has the closing-tag-injection regression tests";
  if (
    /fn xml_escapes_body_closing_tag_injection/.test(safety) &&
    /fn xml_escapes_skill_body_closing_tag_injection/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "prompt_safety.rs must include both `xml_escapes_body_closing_tag_injection` and `xml_escapes_skill_body_closing_tag_injection` tests",
    );
  }
}
{
  const name = "closing-tag-injection test asserts the escape prevents payload smuggling";
  if (
    safety.includes("&lt;/tool_result&gt;") &&
    /assert!\(wrapped\.contains\("&lt;\/tool_result&gt;"\)\)/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "the closing-tag-injection test must assert that `&lt;/tool_result&gt;` appears (the escaped form)",
    );
  }
}
{
  const name = "closing-tag-injection test asserts exactly one closing tag in the output";
  if (
    /wrapped\.matches\(end_marker\)\.count\(\)/.test(safety) ||
    /wrapped\.matches\("<\/tool_result>"\)\.count\(\)/.test(safety)
  ) {
    pass(name);
  } else {
    fail(
      name,
      "the closing-tag-injection test must assert the wrapper's own closing tag appears exactly once (no leak from the body)",
    );
  }
}
{
  const name = "tool_dispatch has the cloud-tier regression tests";
  if (
    /inline_v2_schemas_returns_empty_for_cloud_tier/.test(toolDispatch) &&
    /cloud_tier_never_exposes_v2_schemas_even_with_matching_ids/.test(
      toolDispatch,
    )
  ) {
    pass(name);
  } else {
    fail(
      name,
      "tool_dispatch.rs must include cloud-tier regression tests (one with matching ids is mandatory)",
    );
  }
}

// ── 10. Sanity: no second wrapper function with the same shape ─────────

{
  // The exact count depends on how many test bodies mention the tag
  // name. We require at least 2 (one in the format! template, one in
  // a system_reminder literal), and we explicitly check there's
  // exactly ONE `pub fn wrap_tool_result` declaration. A second
  // wrapper function with the same opening tag would have to be
  // declared with `pub fn wrap_tool_result_xxx` (caught by name) or
  // shadowed in `mod tests` (caught by the test-only count check
  // below if needed in the future).
  const name = "exactly one pub fn wrap_tool_result is declared";
  const declarations = (safety.match(/pub fn wrap_tool_result\s*\(/g) || []).length;
  if (declarations === 1) {
    pass(name);
  } else {
    fail(
      name,
      `expected exactly 1 'pub fn wrap_tool_result' declaration, found ${declarations}`,
    );
  }
}
{
  const name = "exactly one pub fn wrap_skill_body is declared";
  const declarations = (safety.match(/pub fn wrap_skill_body\s*\(/g) || []).length;
  if (declarations === 1) {
    pass(name);
  } else {
    fail(
      name,
      `expected exactly 1 'pub fn wrap_skill_body' declaration, found ${declarations}`,
    );
  }
}

// ── Done ────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} IPI envelope check(s) failed`);
  process.exit(1);
}
console.log("IPI tool output enclosure verifier passed");
