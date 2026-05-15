import { useState, useEffect } from "react";
import { 
  X, Copy, Check, Download, MoreHorizontal, Code2, PanelRight, Eye 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ArtifactData } from "./types";
import { MarkdownContent } from "./MarkdownContent";
import { OpenUIRenderer } from "../OpenUIRenderer";
import { SandboxedIframe } from "../SandboxedIframe";
import { useCopy } from "./CodeBlock";

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
  const isHtml = artifact.type === "html" || 
                 (artifact.type === "code" && artifact.language === "html") ||
                 content.trim().toLowerCase().startsWith("<!doctype html") ||
                 content.trim().toLowerCase().startsWith("<html");

  const isPreviewable = ["markdown", "svg", "openui"].includes(artifact.type) || isHtml;
  
  useEffect(() => {
    if (!isPreviewable) setViewMode("code");
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
      "flex flex-col bg-background/80 backdrop-blur-sm sm:relative sm:inset-auto sm:z-fixed sm:h-full sm:shrink-0 sm:border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300",
      embedded ? "w-full h-full border-l-0 shadow-none relative inset-auto z-auto" : "fixed inset-0 z-[100] sm:w-[420px] md:w-[480px] lg:w-[540px] xl:w-[600px]"
    )}>
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border/60 bg-muted/20 px-4 backdrop-blur-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 shadow-inner">
          {artifact.type === "code" ? <Code2 className="h-5 w-5 text-primary" /> : <PanelRight className="h-5 w-5 text-primary" />}
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold tracking-tight text-foreground">{artifact.title}</div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            <span>{artifact.type}</span>
            {artifact.language && (
              <>
                <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                <span>{artifact.language}</span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-muted/60"
                onClick={() => copy(artifact.content)}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy Code</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-muted/60"
                onClick={download}>
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setViewMode(viewMode === "preview" ? "code" : "preview")}>
                {viewMode === "preview" ? <Code2 className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                Switch to {viewMode === "preview" ? "Code" : "Preview"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClose} className="text-destructive">
                <X className="mr-2 h-4 w-4" />
                Close Panel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 h-6 w-px bg-border/60" />
          
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* View Toggle */}
      {isPreviewable && (
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 bg-muted/5">
          <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 shadow-inner">
            <button
              className={cn(
                "px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all",
                viewMode === "preview" ? "bg-background text-primary shadow-sm ring-1 ring-border/20" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("preview")}
            >
              Preview
            </button>
            <button
              className={cn(
                "px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all",
                viewMode === "code" ? "bg-background text-primary shadow-sm ring-1 ring-border/20" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("code")}
            >
              Code
            </button>
          </div>
          
          {viewMode === "code" && artifact.language && (
            <Badge variant="outline" className="h-6 rounded-lg bg-muted/20 px-2 font-mono text-[10px] tracking-tight">
              {artifact.language}
            </Badge>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-auto bg-card selection:bg-primary/20 relative">
        {viewMode === "code" ? (
          <div className="h-full bg-[#0d1117] font-mono">
            <pre className="p-6 text-[13px] leading-relaxed text-[#e6edf3] whitespace-pre-wrap">
              <code>{artifact.content}</code>
            </pre>
          </div>
        ) : (
          <div className="h-full animate-fade-in">
            {artifact.type === "markdown" ? (
              <div className="p-8 text-sm max-w-none prose prose-slate dark:prose-invert">
                <MarkdownContent content={artifact.content} />
              </div>
            ) : isHtml ? (
              <div className="h-full bg-white">
                <SandboxedIframe content={artifact.content} title={artifact.title} />
              </div>
            ) : artifact.type === "openui" ? (
<div className="h-full p-0">
                 <OpenUIRenderer content={artifact.content} isStreaming={isStreaming} />
               </div>
            ) : artifact.type === "svg" ? (
              <div className="flex h-full items-center justify-center bg-muted/5 p-12">
                <SandboxedIframe content={artifact.content} title={artifact.title} />
              </div>
            ) : (
              <div className="p-8 bg-[#0d1117] text-[#e6edf3]">
                <pre className="text-[13px] leading-relaxed"><code>{artifact.content}</code></pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
