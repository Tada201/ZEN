import React from "react";
import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";
import { ReasoningBlock } from "./ReasoningBlock";
import { SmoothMarkdown } from "./SmoothMarkdown";
import { MermaidDiagram } from "./MermaidDiagram";
import { ChartBlock } from "./ChartBlock";
import { FileTree } from "./FileTree";
import { SandboxedIframe } from "./SandboxedIframe";
import { ArtifactData } from "./types";

function flattenChildren(children: any): string {
  return React.Children.toArray(children).reduce((text: string, child: any) => {
    if (typeof child === "string") return text + child;
    if (React.isValidElement(child) && child.props.children) {
      return text + flattenChildren(child.props.children);
    }
    return text;
  }, "");
}

interface MarkdownContentProps {
  content: string;
  reasoning?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  onOpenArtifact?: (a: ArtifactData) => void;
  onComplete?: () => void;
}

export function MarkdownContent({
  content,
  reasoning,
  isThinking,
  isStreaming,
  onOpenArtifact,
  onComplete,
}: MarkdownContentProps) {
  let thought: string | null = isThinking ? content : (reasoning || null);
  let mainContent = isThinking ? "" : content;

  if (!thought) {
    const thoughtMatch = /<thought>([\s\S]*?)<\/thought>/.exec(content);
    if (thoughtMatch) {
      thought = thoughtMatch[1];
      mainContent = content.replace(/<thought>[\s\S]*?<\/thought>/, "").trim();
    } else if (content.includes("<thought>")) {
      const index = content.indexOf("<thought>");
      thought = content.slice(index + 9);
      mainContent = content.slice(0, index).trim();
    }
  }

  const components: Components = {
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const codeStr = flattenChildren(children).replace(/\n$/, "");
      if (match) {
        const lang = match[1].toLowerCase();
        if (lang === "openui" || lang === "html") {
          return (
            <div className="my-6 overflow-visible">
              <SandboxedIframe
                content={codeStr}
                type="html"
                title="UI Preview"
                className="w-full min-h-[300px] rounded-xl border border-border/40"
              />
            </div>
          );
        }
        if (lang === "mermaid") {
          return <MermaidDiagram code={codeStr} isStreaming={isStreaming} />;
        }
        if (lang === "chart") {
          return <ChartBlock content={codeStr} isStreaming={isStreaming} />;
        }
        if (lang === "tree") {
          return <FileTree content={codeStr} />;
        }
        return (
          <CodeBlock language={match[1]} code={codeStr} onOpenArtifact={onOpenArtifact} />
        );
      }
      return <code className={className} {...props}>{children}</code>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    blockquote({ children }) {
      const text = flattenChildren(children).trim();
      const alertMatch = /^\[!\s*(\w+)\s*\]/.exec(text);
      if (alertMatch) {
        const type = alertMatch[1].toLowerCase();
        const rest = text.slice(alertMatch[0].length).trim();
        const colors: Record<string, string> = {
          note: "border-blue-500/30 bg-blue-500/5 text-blue-200",
          warning: "border-amber-500/30 bg-amber-500/5 text-amber-200",
          danger: "border-rose-500/30 bg-rose-500/5 text-rose-200",
          tip: "border-emerald-500/30 bg-emerald-500/5 text-emerald-200",
          info: "border-sky-500/30 bg-sky-500/5 text-sky-200",
        };
        const colorClass = colors[type] || colors.info;
        return (
          <div className={`my-4 rounded-lg border-l-4 px-4 py-3 ${colorClass}`}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-1 opacity-70">
              {type}
            </div>
            <div className="text-sm leading-relaxed">{children}</div>
          </div>
        );
      }
      return (
        <blockquote className="my-4 border-l-2 border-primary/20 pl-4 italic text-muted-foreground/80">
          {children}
        </blockquote>
      );
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-sm border-collapse">{children}</table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider font-semibold">{children}</thead>;
    },
    th({ children }) {
      return <th className="px-3 py-2 text-left border-b border-border/20">{children}</th>;
    },
    td({ children }) {
      return <td className="px-3 py-2 border-b border-border/10 text-foreground/80">{children}</td>;
    },
    tr({ children }) {
      return <tr className="hover:bg-muted/20 transition-colors">{children}</tr>;
    },
    h1({ children }) {
      return <h1 className="text-2xl font-bold tracking-tight mt-6 mb-3 text-foreground">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-xl font-bold tracking-tight mt-5 mb-2 text-foreground">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-lg font-semibold tracking-tight mt-4 mb-2 text-foreground">{children}</h3>;
    },
    a({ children, href }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors">
          {children}
        </a>
      );
    },
    hr() {
      return <hr className="my-6 border-border/30" />;
    },
    strong({ children }) {
      return <strong className="font-semibold text-foreground">{children}</strong>;
    },
    sup({ children }) {
      return (
        <sup className="mx-0.5 relative -top-2 inline-flex items-center justify-center rounded-full bg-primary/20 text-[9px] font-black w-3.5 h-3.5 border border-primary/30 text-primary cursor-help hover:bg-primary/30 transition-all select-none">
          {children}
        </sup>
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {thought && (
        <ReasoningBlock content={thought} isThinking={isThinking} />
      )}
      {mainContent && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <SmoothMarkdown
            content={mainContent}
            isStreaming={isStreaming}
            components={components}
            onComplete={onComplete}
          />
        </div>
      )}
    </div>
  );
}
