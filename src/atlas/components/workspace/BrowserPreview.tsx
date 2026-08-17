import { useEffect, useRef, useState } from "react";
import {
  RotateCw,
  Home,
  ExternalLink,
  Shield,
  Lock,
  Search,
  Monitor,
  Tablet,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeBrowserPreviewUrl } from "@/lib/security/browserPreviewUrl";
import { browserPreviewApi, type ConsoleEntry } from "@/api/browserPreviewApi";
import { IS_TAURI } from "@/api/tauriClient";
import { useWebviewBounds } from "@/atlas/hooks/useWebviewBounds";

interface BrowserPreviewProps {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

// Address-bar navigation is user-typed, so loopback dev servers are permitted;
// agent/chat-supplied `initialUrl` stays SSRF-guarded (no allowLoopback).
const ADDRESS_BAR_OPTS = { allowLoopback: true } as const;

// Responsive presets constrain the native webview host width so a full-screen
// preview can be checked at tablet/phone breakpoints without leaving Zen.
const VIEWPORTS = [
  { id: "responsive", label: "Responsive", icon: Monitor, width: null },
  { id: "tablet", label: "Tablet (768px)", icon: Tablet, width: 768 },
  { id: "mobile", label: "Mobile (390px)", icon: Smartphone, width: 390 },
] as const;
type ViewportId = (typeof VIEWPORTS)[number]["id"];

export function BrowserPreview({ initialUrl = "about:blank", onUrlChange }: BrowserPreviewProps) {
  const safeInitialUrl = normalizeBrowserPreviewUrl(initialUrl) ?? "about:blank";
  const [url, setUrl] = useState(safeInitialUrl);
  const [inputValue, setInputValue] = useState(safeInitialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([safeInitialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [viewportId, setViewportId] = useState<ViewportId>("responsive");
  const viewportWidth = VIEWPORTS.find((v) => v.id === viewportId)?.width ?? null;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const showWebview = url !== "about:blank";
  // The native webview mirrors this host rect (loopback allowed — the panel is
  // the user's address bar; the Rust command re-validates regardless).
  useWebviewBounds(hostRef, url, true, IS_TAURI && showWebview);

  // Console/error drawer, fed by the native capture bridge (Seq2). Errors
  // increment a badge count even while the drawer is closed.
  const [showConsole, setShowConsole] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const errorCount = consoleEntries.filter(
    (e) => e.level === "error" || e.level === "exception" || e.level === "rejection",
  ).length;

  useEffect(() => {
    if (!IS_TAURI || !showWebview) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    browserPreviewApi
      .onConsole((entry) => setConsoleEntries((prev) => [...prev.slice(-499), entry]))
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showWebview]);

  // Clear captured console on navigation to a new committed URL.
  useEffect(() => {
    setConsoleEntries([]);
  }, [url]);

  useEffect(() => {
    const nextUrl = normalizeBrowserPreviewUrl(initialUrl);
    if (!nextUrl || nextUrl === url) return;

    setUrl(nextUrl);
    setInputValue(nextUrl);
    setError(null);
    setHistory((current) => {
      const nextHistory = current.slice(0, historyIndex + 1);
      if (nextHistory[nextHistory.length - 1] === nextUrl) return current;
      nextHistory.push(nextUrl);
      setHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }, [historyIndex, initialUrl, url]);

  // Drive the native webview to the committed url (address-bar or history nav).
  useEffect(() => {
    if (!IS_TAURI || !showWebview) return;
    setIsLoading(true);
    browserPreviewApi
      .navigate(url, true)
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [url, showWebview]);

  const commitUrl = (formattedUrl: string) => {
    setError(null);
    setUrl(formattedUrl);
    setInputValue(formattedUrl);
    onUrlChange?.(formattedUrl);
    setHistory((current) => {
      const newHistory = current.slice(0, historyIndex + 1);
      if (newHistory[newHistory.length - 1] === formattedUrl) return current;
      newHistory.push(formattedUrl);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  const handleNavigate = (newUrl: string) => {
    const formattedUrl = normalizeBrowserPreviewUrl(newUrl, ADDRESS_BAR_OPTS);
    if (!formattedUrl) {
      setError("This preview only allows public HTTP(S) addresses or a local dev server.");
      return;
    }
    commitUrl(formattedUrl);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const prevUrl = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setUrl(prevUrl);
      setInputValue(prevUrl);
      onUrlChange?.(prevUrl);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const nextUrl = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setUrl(nextUrl);
      setInputValue(nextUrl);
      onUrlChange?.(nextUrl);
    }
  };

  const reload = () => {
    if (url === "about:blank") return;
    setIsLoading(true);
    browserPreviewApi.reload().catch(() => {}).finally(() => setIsLoading(false));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/5 bg-editor-surface shadow-2xl">
      <div className="flex select-none items-center gap-2 border-b border-border/5 bg-editor-elevated p-2">
        <div className="flex items-center gap-1 border-r border-border/5 pr-2">
          <button type="button" onClick={goBack} disabled={historyIndex === 0} className="rounded p-1.5 transition-colors hover:bg-card/5 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Go back">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={goForward} disabled={historyIndex === history.length - 1} className="rounded p-1.5 transition-colors hover:bg-card/5 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Go forward">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={reload} className="rounded p-1.5 transition-colors hover:bg-card/5" aria-label="Reload preview">
            <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2 rounded-md border border-border/5 bg-editor-surface px-3 py-1.5 shadow-inner transition-all focus-within:border-primary/50">
          <div className="flex items-center gap-1.5 opacity-40">
            {url.startsWith("https") ? <Lock className="h-3 w-3 text-green-500" /> : <Shield className="h-3 w-3" />}
          </div>
          <form className="flex-1" onSubmit={(event) => { event.preventDefault(); handleNavigate(inputValue); }}>
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="w-full bg-transparent font-mono text-[13px] text-primary-foreground/80 outline-none placeholder:text-primary-foreground/20"
              placeholder="Search or enter address..."
              spellCheck={false}
              autoComplete="off"
              aria-label="Preview address"
            />
          </form>
          <Search className="h-3.5 w-3.5 opacity-20" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-1 border-l border-border/5 pl-2">
          {VIEWPORTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewportId(id)}
              aria-pressed={viewportId === id}
              className={cn(
                "rounded p-1.5 transition-colors hover:bg-card/5",
                viewportId === id ? "text-primary opacity-100" : "opacity-40 hover:opacity-100",
              )}
              aria-label={label}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          {IS_TAURI && (
            <button
              type="button"
              onClick={() => setShowConsole((v) => !v)}
              aria-pressed={showConsole}
              className={cn(
                "relative rounded p-1.5 transition-colors hover:bg-card/5",
                showConsole ? "text-primary opacity-100" : "opacity-40 hover:opacity-100",
              )}
              aria-label="Toggle console"
              title="Console"
            >
              <Terminal className="h-4 w-4" />
              {errorCount > 0 && !showConsole && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-destructive-foreground">
                  {errorCount > 99 ? "99+" : errorCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => url !== "about:blank" && window.open(url, "_blank", "noopener,noreferrer")}
            disabled={url === "about:blank"}
            className="rounded p-1.5 opacity-60 transition-colors hover:bg-card/5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Open preview in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-2 text-[11px] text-destructive" role="alert">{error}</p>}
      </div>

      <div className="relative flex-1 overflow-hidden bg-card">
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px]">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="font-mono text-xs text-muted-foreground">Loading secure preview...</p>
          </div>
        )}

        {!showWebview ? (
          <div className="flex h-full select-none flex-col items-center justify-center bg-editor-surface text-primary-foreground/20">
            <div className="mb-6 rounded-full bg-card/5 p-6"><Home className="h-12 w-12 opacity-10" /></div>
            <h2 className="mb-2 text-xl font-bold tracking-tight">Home</h2>
            <p className="max-w-xs text-center text-sm leading-relaxed opacity-50">Enter a URL above to preview your app or browse the web directly within Zen.</p>
          </div>
        ) : (
          // Transparent placeholder: the native WebView2 is painted over this
          // rect by Rust (it ignores DOM z-index/overflow). Keep it empty.
          <div
            ref={hostRef}
            className={cn("h-full", viewportWidth != null && "mx-auto border-x border-border/10 shadow-2xl")}
            style={viewportWidth != null ? { width: viewportWidth, maxWidth: "100%" } : undefined}
            aria-label="Live preview"
          >
            {!IS_TAURI && (
              <iframe
                key={url}
                src={url}
                className="h-full w-full border-none"
                title="Preview"
                sandbox="allow-forms allow-scripts"
                onLoad={() => setIsLoading(false)}
              />
            )}
          </div>
        )}
      </div>

      {IS_TAURI && showConsole && showWebview && (
        <div className="flex h-40 shrink-0 flex-col border-t border-border/10 bg-editor-inactive">
          <div className="flex items-center justify-between border-b border-border/5 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Terminal className="h-3 w-3" /> Console
              {consoleEntries.length > 0 && <span className="opacity-50">({consoleEntries.length})</span>}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setConsoleEntries([])} className="rounded px-1.5 py-0.5 text-[10px] opacity-50 transition-opacity hover:opacity-100" aria-label="Clear console">Clear</button>
              <button type="button" onClick={() => setShowConsole(false)} className="rounded p-1 opacity-50 transition-opacity hover:opacity-100" aria-label="Close console"><X className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-3 py-1 font-mono text-[11px] leading-relaxed">
            {consoleEntries.length === 0 ? (
              <p className="py-2 opacity-30">No console output captured yet.</p>
            ) : (
              consoleEntries.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words border-b border-border/5 py-0.5",
                    (entry.level === "error" || entry.level === "exception" || entry.level === "rejection") && "text-destructive",
                    entry.level === "warn" && "text-amber-500",
                    entry.level === "debug" && "opacity-50",
                  )}
                >
                  <span className="mr-2 select-none opacity-40">{entry.level}</span>
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
