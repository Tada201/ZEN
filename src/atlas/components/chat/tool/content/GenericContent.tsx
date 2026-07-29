import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolOutputPreview } from "../toolOutputPreview";
import { Panel } from "./primitives";
import { TruncatedOutput } from "./TruncatedOutput";

interface GenericContentProps {
  outputPreview: ToolOutputPreview;
  input: Record<string, unknown>;
}

function redactInput(value: Record<string, unknown>): string {
  const text = JSON.stringify(value, null, 2);
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(text)) {
    return text.replace(
      /("(?:[^"]*(?:api[_-]?key|authorization|bearer|credential|password|secret|token)[^"]*)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"',
    );
  }
  return text;
}

function OutputBlock({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Panel label={label}>
      <div className="group relative">
        <TruncatedOutput
          content={content}
          headLines={8}
          tailLines={8}
          className="text-foreground"
        />

        {content && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground transition-colors duration-200"
            aria-label="Copy output"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </Panel>
  );
}

export function GenericContent({ outputPreview, input }: GenericContentProps) {
  const hasInput = Object.keys(input).length > 0;
  const outputText = outputPreview.content || outputPreview.summary || outputPreview.raw;

  return (
    <div className="flex flex-col gap-2">
      {hasInput && (
        <details className="rounded-md bg-muted px-2 py-1.5">
          <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wide text-muted-foreground">
            Technical details
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {redactInput(input)}
          </pre>
        </details>
      )}

      {(outputPreview.content || outputPreview.summary || outputPreview.raw) && (
        <OutputBlock content={outputText} label="Output" />
      )}

      {!hasInput && !outputPreview.content && !outputPreview.summary && !outputPreview.raw && (
        <Panel label="Output">
          <div className="text-[12px] leading-relaxed text-muted-foreground">No preview available.</div>
        </Panel>
      )}
    </div>
  );
}
