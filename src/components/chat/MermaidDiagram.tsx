import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useTheme } from "@/lib/hooks/useTheme";

export function MermaidDiagram({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    if (isStreaming) {
      setSvg("");
      setError(false);
      return;
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
          securityLevel: "loose",
        });
        
        const id = `mermaid-${Math.random().toString(36).substring(7)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        
        if (isMounted) {
          setSvg(renderedSvg);
          setError(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [code, theme, isStreaming]);

  if (isStreaming) {
    return (
      <div className="my-6 flex flex-col justify-center items-center h-32 bg-card/30 rounded-xl border border-border/40 shadow-sm animate-pulse">
        <div className="text-muted-foreground text-sm font-mono opacity-70">Drawing diagram...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-6 p-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl font-mono text-xs overflow-auto">
        <pre>{code}</pre>
        <div className="mt-2 text-[10px] uppercase font-bold tracking-wider opacity-70">
          Invalid Mermaid Syntax
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
      className="my-6 overflow-auto flex justify-center bg-card/30 p-6 rounded-xl border border-border/40 shadow-sm"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}
