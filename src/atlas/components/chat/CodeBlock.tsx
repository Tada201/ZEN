import { useState, useCallback } from "react";
import { Copy, Check, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArtifactData } from "./types";

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
      <pre className="overflow-x-auto p-4 text-[13px] leading-6">
        <code className="font-mono text-[#e6edf3]">{code}</code>
      </pre>
    </div>
  );
}
