import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { CodeBlock } from "./CodeBlock";
import { sanitizeMermaidSvg } from "@/lib/security/generatedContent";

type MermaidApi = typeof import("mermaid").default;

let mermaidImportPromise: Promise<MermaidApi> | null = null;

const loadMermaid = () => {
  mermaidImportPromise ??= import("mermaid").then((module) => module.default);
  return mermaidImportPromise;
};

export function MermaidDiagram({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (isNearViewport) {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isNearViewport]);

  useEffect(() => {
    if (isStreaming) {
      setSvg("");
      setError(null);
      return;
    }

    if (!isNearViewport) {
      return;
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        const mermaid = await loadMermaid();

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === "dark" ? "dark" : "default",
          securityLevel: "strict",
        });

        const id = `mermaid-${Math.random().toString(36).substring(7)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);

        if (isMounted) {
          setSvg(sanitizeMermaidSvg(renderedSvg));
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
  }, [code, resolvedTheme, isStreaming, isNearViewport]);

  if (isStreaming) {
    return (
      <div ref={containerRef} className="space-y-2 my-6">
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 px-3 py-2 rounded-lg border border-warning/20">
          <span className="w-2 h-2 rounded-full bg-warning motion-safe:animate-pulse" />
          <span>Rendering Mermaid Diagram...</span>
        </div>
        <CodeBlock code={code} language="mermaid" />
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="space-y-2 my-6">
        <div className="flex flex-col gap-1 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-destructive" />
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

  if (!isNearViewport) {
    return (
      <div
        ref={containerRef}
        className="my-6 h-32 rounded-xl border border-border/40 bg-card/90"
        aria-hidden="true"
      />
    );
  }

  if (!svg) {
    return (
      <div
        ref={containerRef}
        className="my-6 h-32 motion-safe:animate-pulse rounded-xl border border-border/40 bg-card/90 shadow-sm"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-6 overflow-hidden flex justify-center bg-card/90 p-6 rounded-xl border border-border/40 shadow-sm min-h-[128px] transition-[height,opacity] duration-300 ease-in-out"
      // Mermaid is strict-mode rendered and then DOMPurify-sanitized before SVG injection.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

