import { useState, useCallback, useMemo } from "react";
import { Copy, Check, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtifactData } from "./types";
import Prism from "prismjs";

// Import commonly used language components for syntax highlighting
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

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  return { copied, copy };
}

function getLanguageGrammarName(lang: string): string {
  const normalized = lang.toLowerCase().trim();
  const map: Record<string, string> = {
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
  return map[normalized] || normalized;
}

export function CodeBlock({
  code,
  language,
  onOpenArtifact,
}: {
  code: string;
  language?: string;
  onOpenArtifact?: (a: ArtifactData) => void;
}) {
  const { copied, copy } = useCopy();

  const highlightedHtml = useMemo(() => {
    const cleanLang = getLanguageGrammarName(language ?? "plaintext");
    const grammar = Prism.languages[cleanLang];
    if (grammar) {
      try {
        return Prism.highlight(code, grammar, cleanLang);
      } catch (err) {
        console.error("Prism highlighting failed:", err);
      }
    }
    // Fallback: escape HTML entities for safety
    return code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }, [code, language]);

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-border/40 bg-slate-950 shadow-sm transition-all duration-300">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-3 py-1.5">
        <Badge variant="outline" className="font-mono text-[10px] text-slate-400 border-slate-600/40 h-5 px-1.5">
          {language ?? "plaintext"}
        </Badge>
        <div className="flex items-center gap-1">
          {onOpenArtifact && language && language.toLowerCase() !== "openui" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onOpenArtifact({
                  type: "code",
                  title: `snippet.${language}`,
                  language,
                  content: code,
                });
              }}
            >
              <PanelRight className="h-3 w-3" />
              View
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] text-slate-400 hover:text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              copy(code);
            }}
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <pre className="max-h-[400px] overflow-y-auto overflow-x-auto p-4 text-[13px] leading-6">
        <code
          className={`font-mono text-[#e6edf3] language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

