import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useTheme } from "next-themes";
import { CodeBlock } from "./CodeBlock";

export function MermaidDiagram({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (isStreaming) {
      setSvg("");
      setError(null);
      return;
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "loose",
        });
        
        const id = `mermaid-${Math.random().toString(36).substring(7)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unknown syntax or parser error");
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [code, resolvedTheme, isStreaming]);

  if (isStreaming) {
    return (
      <div className="space-y-2 my-6">
        <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Rendering Mermaid Diagram...</span>
        </div>
        <CodeBlock code={code} language="mermaid" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 my-6">
        <div className="flex flex-col gap-1 text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Mermaid Syntax / Parser Error</span>
          </div>
          <p className="text-xs opacity-80">{error}</p>
        </div>
        <div className="opacity-80">
          <CodeBlock code={code} language="mermaid" />
        </div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-6 flex justify-center items-center h-32 bg-card/30 rounded-xl border border-border/40 shadow-sm animate-pulse">
        <div className="text-muted-foreground text-sm">Rendering diagram...</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="my-6 overflow-hidden flex justify-center bg-card/30 p-6 rounded-xl border border-border/40 shadow-sm min-h-[128px] transition-[height,opacity] duration-300 ease-in-out"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}

