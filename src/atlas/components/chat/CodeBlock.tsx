import { useState, useCallback, useMemo } from "react";
import { Copy, Check, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactData } from "./types";
import { getLanguageGrammarName, highlightToHtml } from "./prismHighlight";

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
  const normalizedLanguage = getLanguageGrammarName(language ?? "plaintext");

  const highlightedHtml = useMemo(
    () => highlightToHtml(code, language),
    [code, language],
  );

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-200">
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-1.5">
        <span className="font-mono text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
          {language ?? "plaintext"}
        </span>
        <div className="flex items-center gap-1.5">
          {onOpenArtifact && language && language.toLowerCase() !== "openui" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              copy(code);
            }}
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <pre className="max-h-[400px] overflow-y-auto overflow-x-auto p-3 text-[12px] leading-relaxed bg-muted">
        <code
          className={`font-mono text-foreground language-${normalizedLanguage}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

