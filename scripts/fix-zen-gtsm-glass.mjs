/**
 * Bulk glassmorphism removal for Zen/GTSM widgets and panels.
 *
 * NOTE: This script only processes simple double-quoted class strings.
 * It intentionally skips template literals that contain ${...} interpolation.
 * Always review the diff after running and run `npx tsc --noEmit`.
 */
import fs from "node:fs";
import path from "node:path";

const DIRS = ["src/components/Zen", "src/components/GTSM"];

function getTsxFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = DIRS.flatMap(getTsxFiles);

function transformToken(token) {
  if (token.includes("${")) return token;

  // Remove backdrop blur and saturation
  if (/^backdrop-blur(-[a-z0-9]+)?$/.test(token)) return undefined;
  if (/^backdrop-saturate-\d+$/.test(token)) return undefined;

  // Backgrounds
  if (token === "bg-background/95") return "bg-background";
  if (/^bg-background\/\d+$/.test(token)) return "bg-card";
  if (/^bg-background\/\[.+\]$/.test(token)) return "bg-card";

  if (token === "bg-card/5" || token === "bg-card/10") return "bg-muted";
  if (/^bg-card\/\[.+\]$/.test(token)) return "bg-card";
  if (/^bg-card\/\d+$/.test(token)) return "bg-card";

  if (/^bg-muted\/\d+$/.test(token)) return "bg-muted";
  if (/^bg-muted\/\[.+\]$/.test(token)) return "bg-muted";

  if (token === "bg-black/60") return "bg-muted";
  if (token === "bg-black/75") return "bg-card";

  if (/^bg-primary\/\[0\.0[34]\]$/.test(token)) return "bg-muted";
  if (/^bg-primary\/\[0\.\d+\]$/.test(token)) return "bg-primary/10";
  if (/^bg-primary\/\d+$/.test(token)) return "bg-primary/10";

  if (/^bg-cyan-400\/\d+$/.test(token)) return "bg-cyan-400/10";
  if (/^bg-cyan-500\/\d+$/.test(token)) return "bg-cyan-500/10";
  if (/^bg-success\/\d+$/.test(token)) return "bg-success/10";
  if (/^bg-destructive\/\d+$/.test(token)) return "bg-destructive/10";
  if (/^bg-warning\/\d+$/.test(token)) return "bg-warning/10";
  if (/^bg-amber-400\/\d+$/.test(token)) return "bg-amber-400/10";

  // Borders
  if (/^border-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-border";
  if (/^border-b-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-b-border";
  if (/^border-t-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-t-border";
  if (/^border-r-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-r-border";
  if (/^border-l-border(\/\d+|\/\[.+\])?$/i.test(token)) return "border-l-border";

  if (/^border-primary\/\d+$/.test(token)) return "border-primary";
  if (/^border-primary\/\[.+\]$/.test(token)) return "border-primary";

  if (/^border-cyan-400\/\d+$/.test(token)) return "border-cyan-400";
  if (/^border-cyan-500\/\d+$/.test(token)) return "border-cyan-500";
  if (/^border-success\/\d+$/.test(token)) return "border-success";
  if (/^border-destructive\/\d+$/.test(token)) return "border-destructive";
  if (/^border-warning\/\d+$/.test(token)) return "border-warning";
  if (/^border-amber-400\/\d+$/.test(token)) return "border-amber-400";
  if (/^border-rose-400\/\d+$/.test(token)) return "border-rose-400";

  // Text
  if (/^text-muted-foreground\/\d+$/.test(token) || /^text-muted-foreground\/\[.+\]$/.test(token)) {
    return "text-muted-foreground";
  }
  if (/^text-foreground\/\d+$/.test(token) || /^text-foreground\/\[.+\]$/.test(token)) {
    return "text-foreground";
  }
  if (/^text-primary-foreground\/\d+$/.test(token) || /^text-primary-foreground\/\[.+\]$/.test(token)) {
    return "text-primary-foreground";
  }
  if (/^text-primary\/\d+$/.test(token)) return "text-primary";
  if (/^text-cyan-400\/\d+$/.test(token)) return "text-cyan-400";
  if (/^text-success\/\d+$/.test(token)) return "text-success";

  // Hover / ring / accent
  if (/^hover:bg-muted\/\d+$/.test(token)) return "hover:bg-muted";
  if (/^hover:bg-card\/\d+$/.test(token)) return "hover:bg-muted";
  if (/^hover:bg-background\/\d+$/.test(token)) return "hover:bg-muted";
  if (/^hover:bg-primary\/\d+$/.test(token)) return "hover:bg-primary/10";
  if (/^hover:bg-destructive\/\d+$/.test(token)) return "hover:bg-destructive/10";
  if (/^hover:bg-cyan-500\/\d+$/.test(token)) return "hover:bg-cyan-500/10";
  if (/^hover:border-primary\/\d+$/.test(token)) return "hover:border-primary";
  if (/^hover:border-cyan-400\/\d+$/.test(token)) return "hover:border-cyan-400";
  if (/^hover:text-muted-foreground\/\d+$/.test(token)) return "hover:text-muted-foreground";
  if (/^hover:text-foreground\/\d+$/.test(token)) return "hover:text-foreground";

  // Focus rings
  if (/^focus:ring-[a-z]+\/\d+$/.test(token)) return "focus:ring-2";
  if (/^focus:border-[a-z]+\/\d+$/.test(token)) {
    return token.replace(/\/\d+$/, "");
  }

  // Shadows with opacity
  if (token === "shadow-black/30") return "shadow-lg";
  if (token === "shadow-black/60") return "shadow-lg";
  if (token === "shadow-black/70") return "shadow-lg";

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

  const glassTokenPattern = /(?:backdrop-blur|backdrop-saturate|bg-background\/|bg-card\/|bg-muted\/|bg-black\/|bg-primary\/|bg-cyan-400\/|bg-cyan-500\/|bg-success\/|bg-destructive\/|bg-warning\/|bg-amber-400\/|border-.*?border\/|border-primary\/|border-cyan-400\/|border-cyan-500\/|border-success\/|border-destructive\/|border-warning\/|border-amber-400\/|border-rose-400\/|text-muted-foreground\/|text-foreground\/|text-primary-foreground\/|text-primary\/|text-cyan-400\/|text-success\/|hover:bg-muted\/|hover:bg-card\/|hover:bg-background\/|hover:bg-primary\/|hover:bg-destructive\/|hover:bg-cyan-500\/|hover:border-primary\/|hover:border-cyan-400\/|hover:text-muted-foreground\/|hover:text-foreground\/|focus:ring-|focus:border-|shadow-black\/)/;

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

console.log(`Processed ${files.length} Zen/GTSM files.`);
