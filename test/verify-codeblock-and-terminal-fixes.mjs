import { readFileSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const block = readFileSync("src/atlas/components/chat/CodeBlock.tsx", "utf8");
check(
  "CodeBlock container redesigned with border-border/[0.08] and backdrop-blur",
  /border-border\/\[0\.08\]/.test(block) && /backdrop-blur/.test(block),
);
check(
  "CodeBlock title bar uses border-b border-border/[0.06] and bg-card/[0.02]",
  /border-border\/\[0\.06\]/.test(block) && /bg-card\/\[0\.02\]/.test(block),
);
check(
  "CodeBlock code text uses theme text-foreground/90, not hardcoded white",
  /text-foreground\/90/.test(block) && !/text-\\[#e6edf3\\]/.test(block),
);

const card = readFileSync("src/atlas/components/chat/ToolCallCard.tsx", "utf8");
check(
  "ToolCallCard detects shell execution tools",
  /const isShellTool = useMemo/.test(card) &&
    /command|bash|shell|execute/.test(card),
);
check(
  "ToolCallCard renders terminal title bar with macOS-style traffic lights",
  /bg-rose-500\/80/.test(card) && /bg-amber-500\/80/.test(card) && /bg-emerald-500\/80/.test(card),
);
check(
  "ToolCallCard displays exit code inside terminal block",
  /Process exited with code \{exitCode\}/.test(card),
);
check(
  "ToolCallCard gates default inputs/outputs to non-shell tools only",
  /\!isShellTool\s*&&\s*\(exactCommandText\s*\|\|\s*inputDetail\)/.test(card) &&
    /\!isShellTool\s*&&\s*\(stdout\s*\|\|\s*stderr\s*\|\|\s*exitCode\s*!==\s*undefined/.test(card),
);

if (process.exitCode) {
  console.error("\nOne or more codeblock/terminal verifier checks failed.");
} else {
  console.log("\nAll codeblock/terminal verifier checks passed.");
}
