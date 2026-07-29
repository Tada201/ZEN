/**
 * Bulk glassmorphism removal for GenUI premium cards.
 *
 * NOTE: This script only processes simple double-quoted class strings.
 * It intentionally skips template literals that contain ${...} interpolation,
 * so any glass classes inside conditional className blocks (e.g. cn()/clsx()
 * template literals) must be fixed manually.
 *
 * Always review the diff after running and run `npx tsc --noEmit`.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "src/atlas/components/genui/premium";

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => path.join(DIR, f));

/**
 * Transform a single Tailwind token to remove glass/opacity patterns.
 * Returns undefined if the token should be removed entirely.
 */
function transformToken(token) {
  if (token.includes("${")) return token; // leave template interpolations alone

  // Remove backdrop blur and saturation
  if (/^backdrop-blur(-[a-z0-9]+)?$/.test(token)) return undefined;
  if (/^backdrop-saturate-\d+$/.test(token)) return undefined;

  // Backgrounds
  if (token === "bg-background/95") return "bg-background";
  if (/^bg-background\/\d+$/.test(token)) return "bg-card";
  if (/^bg-background\/\[.+\]$/.test(token)) return "bg-card";

  if (token === "bg-card/5" || token === "bg-card/10") return "bg-muted";
  if (token === "bg-card/[0.01]" || token === "bg-card/[0.03]") return "bg-card";
  if (/^bg-card\/\[.+\]$/.test(token)) return "bg-muted";
  if (/^bg-card\/\d+$/.test(token)) return "bg-muted";

  if (token === "bg-black/60") return "bg-muted";
  if (token === "bg-black/75") return "bg-card";

  if (/^bg-muted\/\d+$/.test(token)) return "bg-muted";
  if (/^bg-muted\/\[.+\]$/.test(token)) return "bg-muted";

  if (/^bg-primary\/\[0\.0[34]\]$/.test(token)) return "bg-muted";
  if (/^bg-primary\/\[0\.\d+\]$/.test(token)) return "bg-primary/10";
  if (/^bg-primary\/\d+$/.test(token)) return "bg-primary/10";

  if (/^bg-emerald-500\/\d+$/.test(token)) return "bg-emerald-500/10";
  if (/^bg-amber-500\/\d+$/.test(token)) return "bg-amber-500/10";
  if (/^bg-rose-500\/\d+$/.test(token)) return "bg-rose-500/10";
  if (/^bg-blue-500\/\d+$/.test(token)) return "bg-blue-500/10";
  if (/^bg-purple-400\/\d+$/.test(token)) return "bg-purple-400/10";

  // Borders
  if (/^border-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-border";
  if (/^border-b-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-b-border";
  if (/^border-t-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-t-border";
  if (/^border-r-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-r-border";
  if (/^border-l-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-l-border";

  if (/^border-primary\/\d+$/.test(token)) return "border-primary";
  if (/^border-primary\/\[.+\]$/.test(token)) return "border-primary";

  if (/^border-emerald-500\/\d+$/.test(token)) return "border-emerald-500";
  if (/^border-amber-500\/\d+$/.test(token)) return "border-amber-500";
  if (/^border-rose-500\/\d+$/.test(token)) return "border-rose-500";
  if (/^border-blue-500\/\d+$/.test(token)) return "border-blue-500";
  if (/^border-emerald-400\/\d+$/.test(token)) return "border-emerald-400";
  if (/^border-amber-400\/\d+$/.test(token)) return "border-amber-400";
  if (/^border-rose-400\/\d+$/.test(token)) return "border-rose-400";
  if (/^border-blue-400\/\d+$/.test(token)) return "border-blue-400";
  if (/^border-purple-400\/\d+$/.test(token)) return "border-purple-400";

  // Rings
  if (/^ring-primary\/\d+$/.test(token)) return "ring-primary";
  if (/^ring-primary\/\[.+\]$/.test(token)) return "ring-primary";

  // Text
  if (/^text-primary-foreground\/\d+$/.test(token) || /^text-primary-foreground\/\[.+\]$/.test(token)) {
    const opacity = token.split("/").pop();
    const num = parseFloat(opacity);
    if (isNaN(num)) return "text-primary-foreground";
    if (num < 50) return "text-muted-foreground";
    return "text-primary-foreground";
  }

  if (token === "text-primary/60") return "text-primary";
  if (token === "text-primary/70") return "text-primary";
  if (token === "text-primary/80") return "text-primary";

  // Hover / accent
  if (token === "hover:bg-card/10" || token === "hover:bg-card/[0.05]") return "hover:bg-muted";
  if (/^hover:bg-card\/\[.+\]$/.test(token)) return "hover:bg-muted";
  if (token === "hover:bg-primary/[0.03]") return "hover:bg-muted";
  if (token === "hover:text-primary-foreground/70") return "hover:text-primary-foreground";

  // Shadows with opacity
  if (token === "shadow-black/70") return "shadow-lg";
  if (token === "shadow-black/60") return "shadow-lg";

  return token;
}

function processClassString(str) {
  const tokens = str.split(/\s+/).filter(Boolean);
  let changed = false;
  const newTokens = [];
  for (const token of tokens) {
    const transformed = transformToken(token);
    if (transformed === undefined) {
      changed = true;
      continue;
    }
    if (transformed !== token) changed = true;
    newTokens.push(transformed);
  }
  if (!changed) return str;

  // Dedupe while preserving order
  const seen = new Set();
  const deduped = [];
  for (const t of newTokens) {
    if (!seen.has(t)) {
      seen.add(t);
      deduped.push(t);
    }
  }
  return deduped.join(" ");
}

function processFile(file) {
  let content = fs.readFileSync(file, "utf8");

  // Only process simple double-quoted class strings. Skip template literals
  // with interpolation to avoid mangling JavaScript expressions.
  const glassTokenPattern = /(?:backdrop-blur|backdrop-saturate|bg-background\/|bg-card\/|bg-muted\/|bg-black\/|bg-primary\/|bg-emerald-500\/|bg-amber-500\/|bg-rose-500\/|bg-blue-500\/|bg-purple-400\/|border-.*?border\/|border-primary\/|border-emerald-500\/|border-amber-500\/|border-rose-500\/|border-blue-500\/|border-emerald-400\/|border-amber-400\/|border-rose-400\/|border-blue-400\/|border-purple-400\/|ring-primary\/|text-primary-foreground\/|text-primary\/|hover:bg-card\/|hover:bg-primary\/|hover:text-primary-foreground\/|shadow-black\/)/;

  content = content.replace(/"[^"]*"/g, (match) => {
    if (!glassTokenPattern.test(match)) return match;
    const inner = match.slice(1, -1);
    return `"${processClassString(inner)}"`;
  });

  return content;
}

for (const file of files) {
  const newContent = processFile(file);
  fs.writeFileSync(file, newContent);
}

console.log(`Processed ${files.length} premium card files.`);
