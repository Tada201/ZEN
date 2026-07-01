import { useState } from "react";
import { Check, Copy, Code, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeSnippetData {
  language: string;
  filename?: string;
  code: string;
  description?: string;
  lineCount?: number;
}

export function CodeSnippetCard({ data }: { data: CodeSnippetData }) {
  const language = data.language || "text";
  const filename = data.filename;
  const code = data.code || "";
  const description = data.description;
  const lineCount = data.lineCount ?? code.split("\n").length;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md overflow-hidden shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/[0.06] bg-card/[0.02]">
        <div className="flex items-center gap-2">
          {filename ? (
            <Terminal className="w-3.5 h-3.5 text-primary-foreground/40" />
          ) : (
            <Code className="w-3.5 h-3.5 text-primary-foreground/40" />
          )}
          <span className="text-[11px] font-mono text-primary-foreground/70 truncate max-w-xs">
            {filename || `${language} snippet`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-primary-foreground/30 uppercase tracking-widest">
            {lineCount} lines · {language}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-6 px-2 text-[10px] font-medium text-primary-foreground/60 hover:text-primary-foreground hover:bg-card/5 border border-border/[0.06] gap-1.5 transition-all"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            Copy
          </Button>
        </div>
      </div>

      <div className="relative p-4 bg-background/60 max-h-72 overflow-y-auto">
        <pre className="text-[11px] font-mono text-primary-foreground/80 whitespace-pre overflow-x-auto leading-relaxed select-all">
          <code>{code}</code>
        </pre>
      </div>

      {description && (
        <div className="px-4 py-2 border-t border-border/[0.04] bg-card/[0.01]">
          <p className="text-[11px] text-primary-foreground/40 leading-normal">{description}</p>
        </div>
      )}
    </div>
  );
}
