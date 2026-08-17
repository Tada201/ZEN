/**
 * Design-token guard — dependency-free lint for theme drift.
 *
 * Fails when frontend code reintroduces the two drift sources we just fixed:
 *   1. Off-scale spacing/radius arbitrary values  (p-[7px], gap-[13px], rounded-[9px])
 *   2. Raw hex colors in .tsx                      (#1e1e1e) — bypasses theming
 *
 * On-scale arbitrary values (p-[8px]) and hex inside .css theme sources are
 * allowed. This is the "value, not the token" rule: a raw length is fine as
 * long as it lands on the 4px scale — an off-scale value is what breaks rhythm.
 *
 * Usage: node scripts/design-token-guard.mjs        (report + exit 1 on new)
 *        node scripts/design-token-guard.mjs --update  (rebaseline allowlist)
 *
 * ponytail: baseline allowlist freezes pre-existing offenders (41 hex files)
 * so the guard blocks NEW drift without a big-bang migration. Drain the
 * baseline opportunistically; delete entries as files are cleaned.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const srcDir = join(root, "src");
const baselinePath = join(root, "scripts", "design-token-guard.baseline.json");

// Legal 4px scale in px. Ties round up. 0 and multiples allowed.
const SCALE = new Set([0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64]);
const SPACING_PREFIX = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|inset|top|left|right|bottom|w|h|size)-\[([^\]]+)\]/g;
const RADIUS_ARBITRARY = /\brounded(?:-[a-z]+)?-\[([^\]]+)\]/g;
const HEX = /#[0-9a-fA-F]{6}\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** px value from an arbitrary token body, or null if not a fixed px length. */
function pxValue(body) {
  const m = body.trim().match(/^(-?\d*\.?\d+)px$/);
  return m ? Math.abs(parseFloat(m[1])) : null;
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  const offenders = [];
  for (const re of [SPACING_PREFIX, RADIUS_ARBITRARY]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const px = pxValue(m[1]);
      if (px !== null && !SCALE.has(px)) offenders.push(`off-scale ${m[0]}`);
    }
  }
  if (HEX.test(text)) offenders.push("raw-hex");
  return offenders;
}

const files = walk(srcDir);
const current = {};
for (const f of files) {
  const rel = relative(root, f).split(sep).join("/");
  const o = scan(f);
  if (o.length) current[rel] = [...new Set(o)].sort();
}

if (process.argv.includes("--update")) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
  process.stdout.write(`Baselined ${Object.keys(current).length} files.\n`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  /* first run: no baseline yet */
}

const newOffenders = [];
for (const [file, kinds] of Object.entries(current)) {
  const known = new Set(baseline[file] ?? []);
  const fresh = kinds.filter((k) => !known.has(k));
  if (fresh.length) newOffenders.push(`  ${file}: ${fresh.join(", ")}`);
}

if (newOffenders.length) {
  process.stderr.write(
    "Design-token drift — use theme tokens, not raw hex / off-scale px:\n" +
      newOffenders.join("\n") +
      "\n\nScale (px): 0 2 4 6 8 10 12 16 20 24 28 32 36 40 48. Snap off-scale up.\n" +
      "Colors: hsl(var(--token)). If intentional, re-baseline: npm run lint:tokens -- --update\n",
  );
  process.exit(1);
}
process.stdout.write(`Design-token guard: ${files.length} files clean vs baseline.\n`);
