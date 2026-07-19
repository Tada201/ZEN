// Rule 2 (frontend-rules.md > Chat Timeline Rules):
//   "Do not display raw internal JSON, full tool arguments, provider payloads,
//    prompt bodies, event metadata, stack traces, stdout/stderr dumps, or
//    full subagent transcripts in the normal chat timeline."
//
// Rule 4 (frontend-rules.md > Chat Timeline Rules):
//   "Approval and error states are exceptions to the quiet default: they
//    must be visible, actionable, and written in user language."
//
// Rule 8 (frontend-rules.md > Chat Timeline Rules):
//   "Chat labels must use product language, not implementation names.
//    Prefer 'Reading files', 'Running tests', 'Approval needed', or
//    'Delegated to reviewer' over raw tool ids, event kinds, or JSON keys."
//
// Rule 9 (frontend-rules.md > Chat Timeline Rules):
//   "Any verifier for chat execution UI must assert the user-facing contract
//    above, not brittle snapshots of old internal component structure."
//
// This verifier pins R2 + R4 + R8 onto the Phase 4 deep-research surface.
// ProcessStepItem, ResearchAgentCard, and the run header must:
//   - carry state via Lucide icons + theme tokens, not via JSON dump;
//   - surface only product-language labels and visible actionable failures;
//   - keep private phase values (agent_spawn / agent_complete / agent_error)
//     confined to comparison contexts, never rendered into JSX text.
// Per Rule 9, assertions focus on labels and rendering contracts, not on
// private classnames or hook order.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const ownerFiles = [
  "../src/atlas/components/chat/DeepResearchMessage.tsx",
  "../src/atlas/components/chat/DeepResearchRunMessage.tsx",
  "../src/atlas/components/chat/ResearchClarificationCard.tsx",
  "../src/atlas/components/chat/ResearchAgentCard.tsx",
  "../src/atlas/components/chat/deepResearchTypes.ts",
];

const sources = ownerFiles.map((path) => ({
  path,
  content: readFileSync(new URL(path, import.meta.url), "utf8"),
}));
const combinedSurface = sources
  .map((s) => `// \u2500\u2500\u2500 ${s.path} \u2500\u2500\u2500\n` + s.content)
  .join("\n");

const runFile = sources.find((s) =>
  s.path.endsWith("DeepResearchRunMessage.tsx"),
).content;
const cardFile = sources.find((s) =>
  s.path.endsWith("ResearchAgentCard.tsx"),
).content;
const typesFile = sources.find((s) =>
  s.path.endsWith("deepResearchTypes.ts"),
).content;
const routerFile = sources.find((s) =>
  s.path.endsWith("DeepResearchMessage.tsx"),
).content;
const clarificationFile = sources.find((s) =>
  s.path.endsWith("ResearchClarificationCard.tsx"),
).content;

// ── R2 — No raw JSON dump in the deep-research surface ──────────────────
// A regression that pulls step/agent/message objects into a <pre> or a
// text node would re-introduce the internal execution log leak.
const bannedJsonLeak =
  /\{\s*JSON\.stringify\s*\(\s*(step|agent|message|message\.metadata|metadata)\b/;
assert(
  !bannedJsonLeak.test(combinedSurface),
  "Deep research surface must not stringify raw step/agent/message/metadata objects in user-facing JSX (R2)",
);

const bannedPreJson = /<pre[^>]*>[^<{]*\{[^}]*JSON\.stringify/;
assert(
  !bannedPreJson.test(combinedSurface),
  "Deep research surface must not render raw JSON in <pre> blocks (R2)",
);

// ── R8 — step.phase / step.id appear ONLY in comparison contexts ──────────
// Phase values ('agent_spawn' / 'agent_complete' / 'agent_error') are
// internal data-classification keys. They must never be interpolated into
// JSX text. The only legitimate uses are === / !== / == / != comparisons
// and pre-render filters. Positively pin that ALL step.phase usages are
// inside comparison operators — any other usage means a leak.
function assertOnlyInComparisons(file, identifier) {
  const total = (file.match(new RegExp(`\\b${identifier}\\b`, "g")) || []).length;
  const inComparison = (
    file.match(
      new RegExp(`\\b${identifier}\\b\\s*(===|!==|==|!=)`, "g"),
    ) || []
  ).length;
  assert(
    total === inComparison,
    `${identifier} must only appear in === / !== / == / != comparison contexts (R8, ${total - inComparison} non-comparison usages in source; render step.text instead)`,
  );
}
// step.phase and s.phase both key off the same set of phase strings.
assertOnlyInComparisons(runFile, "step\\.phase");
assertOnlyInComparisons(runFile, "s\\.phase");

// step.id is similarly internal — also gate it. Note: `key={...}` props are
// excluded by requiring comparison operators; key usage would be token-only.
const stepIdRenderInCard = /\{[^}]*\bstep\.id\b[^}]*\}/;
assert(
  !stepIdRenderInCard.test(cardFile),
  "ResearchAgentCard must not interpolate step.id into user-facing JSX (R8)",
);

// agent.index and agent.id are used internally for React keys and map state;
// the user-facing surface uses agent.name (humanized). The ONLY accepted
// interpolation is `key={agent.index}` for React's reconciliation. Any other
// interpolation is a R8 leak. Strip comments first (so a stray JSDoc reference
// doesn't false-positive), then strip the legitimate key props, then assert
// no remaining JSX interpolation references the internal ids.
function stripJsComments(file) {
    return file
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/[^\n]*$/gm, '');
}
function assertNotInterpolatedAgentId(file) {
    const stripped = stripJsComments(file).replace(
        /key=\{[^}]*\bagent\.index\b[^}]*\}/g,
        '',
    );
    const remaining = stripped.match(
        /\{[^}]*\b(agent\.id|agent\.index)\b[^}]*\}/,
    );
    assert(
        !remaining,
        `agent.id / agent.index must NOT appear in user-facing JSX interpolation (R8); only \`key={agent.index}\` react-key props are accepted. Found: ${remaining?.[0] ?? ''}`,
    );
}
assertNotInterpolatedAgentId(runFile);

// ── ProcessStepItem ownership + iconographic state carry ───────────────
// ProcessStepItem is internal to DeepResearchRunMessage.tsx, not exported.
// It must carry state via Lucide icons + theme tokens, not via JSON or text
// pills that dump implementation values.
assert(
  /function\s+ProcessStepItem\s*\(\s*\{\s*step\s*\}\s*:/.test(runFile) &&
    /CheckCircle2\b[^>]*text-success\b/.test(runFile) &&
    /Loader2\b[^>]*text-primary\b[^>]*animate-spin\b/.test(runFile) &&
    /XCircle\b[^>]*text-destructive\b/.test(runFile) &&
    /CircleDashed\b[^>]*text-muted-foreground\b/.test(runFile) &&
    !/export\s+function\s+ProcessStepItem\b/.test(runFile),
  "ProcessStepItem must live in DeepResearchRunMessage.tsx, use Lucide icons + theme tokens for state, and stay non-exported (R2)",
);

// The step text rendered to the user is step.text (truncated), not the
// implementation detail step.phase or step.id.
assert(
  /step\.text\b/.test(runFile) &&
    /line-clamp-2\b/.test(runFile),
  "ProcessStepItem must render step.text (truncated via line-clamp-2), never step.phase or step.id (R8)",
);

// ── ResearchAgentCard ownership + bidirectional StepStatusIcon pin ──────
// ResearchAgentCard owns the per-agent card in its own file (Phase 4 split)
// and the run view imports it for consumption. StepStatusIcon is private to
// the card file — the run view must NOT reference it; ProcessStepItem owns
// the same vocabulary inline.
assert(
  /export\s+function\s+ResearchAgentCard\b/.test(cardFile) &&
    /import\s*\{[^}]*\bResearchAgentCard\b[^}]*\}\s*from\s*["']\.\/ResearchAgentCard["']/.test(runFile) &&
    /function\s+StepStatusIcon\s*\(/.test(cardFile) &&
    !/\bStepStatusIcon\b/.test(runFile),
  "ResearchAgentCard (with private StepStatusIcon) must own the per-agent card; the run view must NOT reference StepStatusIcon (Phase 4 split ownership)",
);

assert(
  /<Sparkles\b/.test(cardFile) &&
    /formatAgentDuration\b/.test(cardFile) &&
    /subQuestion\.length\s*>\s*\d+/.test(cardFile),
  "ResearchAgentCard must use a Sparkles icon header, truncate the sub-question, and render StepStatusIcon rows (R2/R8)",
);

// StepStatusIcon uses the same Lucide + theme vocabulary as ProcessStepItem.
assert(
  /CheckCircle2\b[^>]*text-success\b/.test(cardFile) &&
    /Loader2\b[^>]*text-primary\b[^>]*animate-spin\b/.test(cardFile) &&
    /XCircle\b[^>]*text-destructive\b/.test(cardFile) &&
    /CircleDashed\b[^>]*text-muted-foreground\b/.test(cardFile),
  "ResearchAgentCard.StepStatusIcon must share the Lucide + theme-token state vocabulary with ProcessStepItem (R2)",
);

// Agent empty states are user-language, not raw step counts.
const agentEmptyStates = [
  "No results",
  "Searching...",
  "No results \u2014 all fetches failed",
];
for (const phrase of agentEmptyStates) {
  assert(
    cardFile.includes(phrase),
    `ResearchAgentCard must surface the product-language empty state "${phrase}" (R8)`,
  );
}

// ── R8 — Run header is product language ─────────────────────────────────
// The run header must use user-facing labels, not raw implementation tags.
const requiredHeaderLabels = [
  "Deep Research",
  "Research activity",
  "Process",
  "Agents",
  "Stop",
  "Retry research",
];
for (const label of requiredHeaderLabels) {
  assert(
    combinedSurface.includes(label),
    `Deep research surface must surface the product-language label "${label}" (R8)`,
  );
}

// Run-header status strings must surface readable research-state labels.
assert(
  /Research complete\b/.test(runFile) &&
    /Research interrupted\b/.test(runFile) &&
    /Agent is actively researching\b/.test(runFile),
  "Run header must surface 'Research complete' / 'Research interrupted' / 'Agent is actively researching' as readable state labels (R8)",
);

// ── R4 — Failure visibility (exceptions to the quiet default) ──────────
// Per Rule 4, approval/error states must be VISIBLE and actionable in user
// language. The run view surfaces them through partial-results warning,
// connection-lost warning, and the stale retry button.
const r4FailureLabels = [
  "Connection was lost",
  "Research interrupted (partial results)",
  "Retry research",
];
for (const label of r4FailureLabels) {
  assert(
    runFile.includes(label),
    `Run view must surface the actionable failure text "${label}" so failures are visible and actionable (R4)`,
  );
}

// Progress chips surface numeric counts in product labels (done / active / pending).
const progressChipLabels = [" done", " active", " pending", " planned investigation tasks"];
for (const label of progressChipLabels) {
  assert(
    runFile.includes(label),
    `Run header must render progress counter with product-language suffix "${label.trim()}" (R8)`,
  );
}

// Progress chip tonal palette — finished/active/pending chips route through
// success/primary/muted theme tokens, not raw hex. Each chip's three classes
// must co-occur within a short window so they belong to the same span and
// the chip contracts survive class-list reordering (R4 visibility).
// Because each class string can legitimately appear in many places
// throughout the file (other pills, badges, status text), the helper walks
// ALL occurrences of every class and asserts SOME combination fits the
// maxGap window — first-occurrence matching is too brittle.
function allIndexesOf(haystack, needle) {
    const positions = [];
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        positions.push(idx);
        idx += needle.length;
    }
    return positions;
}
function assertChipClassesCooccur(file, classes, label, maxGap = 280) {
    for (const cls of classes) {
        assert(
            file.includes(cls),
            `${label} progress chip missing required theme-token class "${cls}" (R4 visibility)`,
        );
    }
    const positions = classes.map((cls) => allIndexesOf(file, cls));
    // classes.length is exactly 3 per chip; triple-nested enumeration is fine.
    for (const a of positions[0]) {
        for (const b of positions[1]) {
            for (const c of positions[2]) {
                const min = Math.min(a, b, c);
                const max = Math.max(a, b, c);
                if (max - min <= maxGap) return;
            }
        }
    }
    assert.fail(
        `${label} progress chip classes never co-occur within ${maxGap} chars — chip token palette is wrong (R4 visibility)`,
    );
}
assertChipClassesCooccur(
    runFile,
    ['bg-success/10', 'text-success', 'border-emerald-500/20'],
    'done',
);
assertChipClassesCooccur(
    runFile,
    ['bg-primary/10', 'text-primary', 'border-primary/20'],
    'active',
);
assertChipClassesCooccur(
    runFile,
    ['bg-muted/10', 'text-muted-foreground', 'border-border/20'],
    'pending',
);

// Stale retry button is product language and is reachable only on failure.
assert(
  /function\s+StaleRetryButton\b/.test(runFile) &&
    /Retry research\b/.test(runFile) &&
    /isStaleEmpty\b/.test(runFile),
  "StaleRetryButton must read 'Retry research' and be guarded by the isStaleEmpty failure path (R4/R8)",
);

// No leaked implementation literals in user-facing strings. Phase values
// are DATA — they should not surface as JSX text. The ban targets the
// rendered pattern (literal text followed by a closing tag), so legitimate
// filter expressions like s.phase === 'agent_spawn' are not flagged.
const bannedUserImplementationLiterals = [
  "[DEEP_RESEARCH]",
  "agent_spawn\">",
  "agent_complete\">",
  "agent_error\">",
];
for (const literal of bannedUserImplementationLiterals) {
  assert(
    !combinedSurface.includes(literal),
    `Deep research surface must not expose the implementation literal "${literal}" as user-facing text (R8)`,
  );
}

// ── Phase 4 split ownership + router surface ────────────────────────────
assert(
  /export\s+function\s+DeepResearchMessage\b/.test(routerFile) &&
    /ResearchClarificationCard\b/.test(routerFile) &&
    /DeepResearchRunMessage\b/.test(routerFile) &&
    !/function\s+ProcessStepItem\b/.test(routerFile) &&
    !/function\s+StaleRetryButton\b/.test(routerFile) &&
    !/function\s+StepStatusIcon\b/.test(routerFile),
  "DeepResearchMessage.tsx must stay a thin router; ProcessStepItem/StaleRetryButton/StepStatusIcon live in the focused split files",
);

assert(
  /export\s+interface\s+ResearchStep\b/.test(typesFile) &&
    /\bAgentInfo\b/.test(typesFile) &&
    /\bDeepResearchRunMessageProps\b/.test(typesFile),
  "deepResearchTypes.ts must own the shared ResearchStep / AgentInfo / DeepResearchRunMessageProps types",
);

assert(
  /export\s+function\s+ResearchClarificationCard\b/.test(clarificationFile) &&
    /researchClarification\b/.test(clarificationFile) &&
    /onContinueResearch\b/.test(clarificationFile),
  "ResearchClarificationCard.tsx must own the clarification form routing through researchClarification metadata + onContinueResearch",
);

// ── Visual tokens: no orphaned neon / hardcoded palette in the run view ──
// Matches the chat-side contract: status colors come from theme tokens,
// not from raw hex or "text-neon" style literals.
assert(
  !/text-\[#00ff9f\]/.test(combinedSurface) &&
    !/text-neon\b/.test(combinedSurface) &&
    !/bg-\[#/.test(combinedSurface),
  "Deep research surface must avoid hardcoded neon / hex colors; route through theme tokens (text-primary/text-success/text-warning/text-destructive)",
);

console.log("deep research summary ok");
