import Prism from "prismjs";

// Language grammars loaded once, shared by CodeBlock and DiffCard.
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  rb: "ruby",
  cs: "csharp",
  golang: "go",
  yml: "yaml",
};

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", tsx: "tsx", py: "python", rs: "rust", go: "go",
  java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", css: "css", scss: "css", json: "json", md: "markdown",
  markdown: "markdown", yml: "yaml", yaml: "yaml", sql: "sql",
  sh: "bash", bash: "bash", zsh: "bash",
};

export function getLanguageGrammarName(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  return ALIASES[normalized] || normalized;
}

/** Infer a Prism language from a file path/extension, for diff headers. */
export function languageFromPath(path: string): string {
  const ext = path.replace(/\\/g, "/").split("/").pop()?.split(".").pop()?.toLowerCase();
  return (ext && EXT_TO_LANG[ext]) || "plaintext";
}

export function escapeHtml(code: string): string {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Highlight `code` to a Prism token HTML string, falling back to escaped text. */
export function highlightToHtml(code: string, language?: string): string {
  const lang = getLanguageGrammarName(language ?? "plaintext");
  const grammar = Prism.languages[lang];
  if (grammar) {
    try {
      return Prism.highlight(code, grammar, lang);
    } catch (err) {
      console.error("Prism highlighting failed:", err);
    }
  }
  return escapeHtml(code);
}
