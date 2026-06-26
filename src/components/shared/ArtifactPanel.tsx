import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Archive, Check, Code2, Copy, Download, Eye, FileCode2, Search } from "lucide-react";
import { SandboxedIframe } from "@/atlas/components/SandboxedIframe";
import { useChatStore } from "@/lib/stores/useChatStore";
import { cn } from "@/lib/utils";

const MermaidDiagram = React.lazy(() => import("@/atlas/components/chat/MermaidDiagram").then((module) => ({ default: module.MermaidDiagram })));
const MarkdownContent = React.lazy(() => import("@/atlas/components/chat/MarkdownContent").then((module) => ({ default: module.MarkdownContent })));

export function ArtifactPanel({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const allArtifacts = useChatStore((state) => state.artifacts);
  const globalArtifacts = useChatStore((state) => state.globalArtifacts);
  const activeArtifactId = useChatStore((state) => state.activeArtifactId);
  const setActiveArtifact = useChatStore((state) => state.setActiveArtifact);
  const loadAllArtifacts = useChatStore((state) => state.loadAllArtifacts);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const [scope, setScope] = useState<"session" | "all">("session");
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (scope === "all") loadAllArtifacts();
  }, [loadAllArtifacts, scope]);

  // When scoped to "session", only show artifacts tagged with the current session.
  // Fall back to showing all artifacts for backward-compatible artifacts that
  // predate the chatId tagging (no chatId field).
  const sessionArtifacts = useMemo(() => {
    if (!activeSessionId) return allArtifacts;
    return allArtifacts.filter((a) => !a.chatId || a.chatId === activeSessionId);
  }, [allArtifacts, activeSessionId]);
  const source = scope === "session" ? sessionArtifacts : globalArtifacts;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((artifact) => `${artifact.title} ${artifact.type} ${artifact.language || ""}`.toLowerCase().includes(needle));
  }, [query, source]);
  const activeArtifact = source.find((artifact) => artifact.id === activeArtifactId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!activeArtifactId && filtered[0]?.id) setActiveArtifact(filtered[0].id);
  }, [activeArtifactId, filtered, setActiveArtifact]);

  const copy = async () => {
    if (!activeArtifact) return;
    await navigator.clipboard.writeText(activeArtifact.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!activeArtifact) return;
    const extension = activeArtifact.language || activeArtifact.type || "txt";
    const url = URL.createObjectURL(new Blob([activeArtifact.content], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeArtifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const preview = () => {
    if (!activeArtifact) return null;
    const language = activeArtifact.language?.toLowerCase();
    const content = activeArtifact.content.trim();
    const isSvg = activeArtifact.type === "svg" || language === "svg" || content.startsWith("<svg");
    if (isSvg || activeArtifact.type === "html" || activeArtifact.type === "openui") {
      return <SandboxedIframe content={activeArtifact.content} title={activeArtifact.title} className="h-full w-full bg-white" />;
    }
    if (language === "mermaid") {
      return <Suspense fallback={<PanelLoading />}><div className="h-full overflow-auto p-5"><MermaidDiagram code={activeArtifact.content} /></div></Suspense>;
    }
    if (activeArtifact.type === "markdown" || language === "markdown" || language === "md") {
      return <Suspense fallback={<PanelLoading />}><div className="h-full overflow-auto p-5"><MarkdownContent content={activeArtifact.content} /></div></Suspense>;
    }
    return <CodeView content={activeArtifact.content} />;
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", !isEmbedded && "border border-border") }>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["session", "all"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setScope(value)} className={cn("rounded px-2.5 py-1 text-xs", scope === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
              {value === "session" ? "Session" : "All"}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artifacts" className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Archive className="h-7 w-7 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No artifacts yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Generated code, diagrams, SVG, HTML, and UI previews will stay here with the conversation.</p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {filtered.map((artifact) => (
              <button key={artifact.id} type="button" onClick={() => setActiveArtifact(artifact.id ?? null)} className={cn("flex min-w-40 max-w-56 items-center gap-2 rounded-md border px-2.5 py-2 text-left", activeArtifact?.id === artifact.id ? "border-primary/40 bg-primary/10" : "border-transparent bg-muted/35 hover:border-border") }>
                <FileCode2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{artifact.title}</span><span className="block truncate text-[11px] text-muted-foreground">{artifact.language || artifact.type}</span></span>
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-3">
              <div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{activeArtifact?.title}</p><p className="truncate text-[11px] text-muted-foreground">{activeArtifact?.language || activeArtifact?.type}</p></div>
              <div className="flex items-center gap-1">
                <PanelButton label="Preview" active={mode === "preview"} onClick={() => setMode("preview")} icon={<Eye />} />
                <PanelButton label="Code" active={mode === "code"} onClick={() => setMode("code")} icon={<Code2 />} />
                <PanelButton label="Copy" onClick={copy} icon={copied ? <Check /> : <Copy />} />
                <PanelButton label="Download" onClick={download} icon={<Download />} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-card/20">{mode === "preview" ? preview() : <CodeView content={activeArtifact?.content || ""} />}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active?: boolean; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={cn("flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5", active && "bg-muted text-primary")}>{icon}</button>;
}

function CodeView({ content }: { content: string }) {
  return <pre className="h-full overflow-auto p-4 text-xs leading-relaxed text-foreground"><code>{content}</code></pre>;
}

function PanelLoading() {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Rendering preview…</div>;
}
