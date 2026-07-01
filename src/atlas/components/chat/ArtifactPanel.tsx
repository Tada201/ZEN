import React, { Suspense, useState, useEffect } from "react";
import { 
  X, Copy, Check, Download, Code2, PanelRight, Eye 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ArtifactData } from "./types";
import { SandboxedIframe } from "../SandboxedIframe";
import { useCopy } from "./CodeBlock";

const MarkdownContent = React.lazy(() => import("./MarkdownContent").then(m => ({ default: m.MarkdownContent })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));

const PreviewFallback = () => (
  <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
    Loading preview...
  </div>
);

export function ArtifactPanel({ 
  artifact, 
  onClose, 
  isStreaming,
  embedded = false
}: { 
  artifact: ArtifactData; 
  onClose: () => void; 
  isStreaming?: boolean;
  embedded?: boolean;
}) {
  const { copied, copy } = useCopy();
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  const content = artifact.content || "";
  const trimmedContent = content.trim().toLowerCase();

  const isHtml = artifact.type === "html" || 
                 (artifact.type === "code" && artifact.language?.toLowerCase() === "html") ||
                 trimmedContent.startsWith("<!doctype html") ||
                 trimmedContent.startsWith("<html");

  const isSvg = artifact.type === "svg" ||
                (artifact.type === "code" && artifact.language?.toLowerCase() === "svg") ||
                trimmedContent.startsWith("<svg") ||
                (trimmedContent.startsWith("<?xml") && trimmedContent.includes("<svg"));

  const isPreviewable = ["markdown", "svg", "openui"].includes(artifact.type) || isHtml || isSvg;
  
  useEffect(() => {
    if (!isPreviewable) {
      setViewMode("code");
    } else {
      setViewMode("preview");
    }
  }, [artifact.type, isPreviewable]);

  const download = () => {
    const extMap: Record<string, string> = {
      typescript: "ts", javascript: "js", tsx: "tsx", jsx: "jsx",
      python: "py", rust: "rs", go: "go", css: "css", html: "html",
      json: "json", markdown: "md", sql: "sql", svg: "svg"
    };
    
    const mimeMap: Record<string, string> = {
      ts: "text/typescript", js: "text/javascript", tsx: "text/tsx", jsx: "text/jsx",
      py: "text/x-python", rs: "text/rust", go: "text/x-go", css: "text/css",
      html: "text/html", json: "application/json", md: "text/markdown",
      sql: "text/x-sql", svg: "image/svg+xml"
    };

    const ext = artifact.language ? (extMap[artifact.language] ?? artifact.language)
      : artifact.type === "markdown" ? "md" : artifact.type === "svg" ? "svg" : "txt";
    
    const mime = mimeMap[ext] || "text/plain";
    const blob = new Blob([artifact.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.title.includes(".") ? artifact.title : `${artifact.title}.${ext}`;
    a.click();
    // Use a timeout to ensure the download starts before the URL is revoked
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className={cn(
      "flex flex-col bg-[#1e1e24] sm:relative sm:inset-auto sm:z-fixed sm:h-full sm:shrink-0 sm:border-l border-border/80 shadow-none animate-in slide-in-from-right duration-200",
      embedded ? "w-full h-full border-l-0 shadow-none relative inset-auto z-auto" : "fixed inset-y-0 right-0 z-[100] sm:w-[320px] md:w-[360px] lg:w-[400px] xl:w-[450px]"
    )}>
      {/* Header */}
      <div className="flex h-11 items-center gap-2 border-b border-border/80 bg-[#18181c] px-3 select-none">
        {artifact.type === "code" ? (
          <Code2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
        ) : (
          <PanelRight className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
        )}
        
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground font-sans tracking-wide">
            {artifact.title}
          </div>
        </div>
        
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={() => copy(artifact.content)}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy Code</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={download}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>

          <div className="mx-0.5 h-4 w-px bg-muted" />
          
          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Tabs Bar */}
      {isPreviewable && (
        <div className="flex h-9 border-b border-border bg-[#18181c] select-none text-[11px] font-sans font-medium tracking-wide">
          <button
            className={cn(
              "px-4 flex items-center gap-1.5 border-r border-border/80 h-full transition-colors font-medium",
              viewMode === "preview" 
                ? "bg-[#1e1e24] text-foreground border-b-2 border-b-primary" 
                : "bg-[#131316] text-muted-foreground hover:bg-[#18181c]/60 hover:text-foreground"
            )}
            onClick={() => setViewMode("preview")}
          >
            <Eye className="h-3.5 w-3.5" /> PREVIEW
          </button>
          <button
            className={cn(
              "px-4 flex items-center gap-1.5 border-r border-border/80 h-full transition-colors font-medium",
              viewMode === "code" 
                ? "bg-[#1e1e24] text-foreground border-b-2 border-b-primary" 
                : "bg-[#131316] text-muted-foreground hover:bg-[#18181c]/60 hover:text-foreground"
            )}
            onClick={() => setViewMode("code")}
          >
            <Code2 className="h-3.5 w-3.5" /> SOURCE
          </button>
          
          <div className="flex-1 flex items-center justify-end px-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
            {artifact.language || artifact.type}
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-auto bg-[#1e1e24] selection:bg-primary/20 relative">
        {viewMode === "code" ? (
          <div className="h-full bg-[#1e1e1e] font-mono overflow-auto">
            <pre className="p-4 text-[12px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap select-text font-mono">
              <code>{artifact.content}</code>
            </pre>
          </div>
        ) : (
          <div className="h-full animate-fade-in bg-[#1e1e24]">
            {artifact.type === "markdown" ? (
              <div className="p-5 text-xs max-w-none prose prose-slate dark:prose-invert">
                <Suspense fallback={<PreviewFallback />}>
                  <MarkdownContent content={artifact.content} />
                </Suspense>
              </div>
            ) : isHtml ? (
              <div className="h-full bg-card">
                <SandboxedIframe content={artifact.content} title={artifact.title} />
              </div>
            ) : artifact.type === "openui" ? (
              <div className="h-full p-0">
                <Suspense fallback={<PreviewFallback />}>
                  <OpenUIRenderer content={artifact.content} isStreaming={isStreaming} chatId={artifact.chatId} />
                </Suspense>
              </div>
            ) : isSvg ? (
              <div className="flex h-full items-center justify-center p-4 bg-[#1e1e24]">
                <SandboxedIframe content={artifact.content} title={artifact.title} />
              </div>
            ) : (
              <div className="p-5 bg-[#1e1e1e] text-[#d4d4d4] font-mono">
                <pre className="text-[12px] leading-relaxed"><code>{artifact.content}</code></pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
