import { useEffect, useState } from "react";
import {
  RotateCw,
  Home,
  ExternalLink,
  Shield,
  Lock,
  Search,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeBrowserPreviewUrl } from "@/lib/security/browserPreviewUrl";

interface BrowserPreviewProps {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

export function BrowserPreview({ initialUrl = "about:blank", onUrlChange }: BrowserPreviewProps) {
  const safeInitialUrl = normalizeBrowserPreviewUrl(initialUrl) ?? "about:blank";
  const [url, setUrl] = useState(safeInitialUrl);
  const [inputValue, setInputValue] = useState(safeInitialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [history, setHistory] = useState<string[]>([safeInitialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);

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

  const handleNavigate = (newUrl: string) => {
    const formattedUrl = normalizeBrowserPreviewUrl(newUrl);
    if (!formattedUrl) {
      setError("This preview only allows public HTTP(S) addresses.");
      return;
    }

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
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/5 bg-[#1e1e1e] shadow-2xl">
      <div className="flex select-none items-center gap-2 border-b border-border/5 bg-[#252526] p-2">
        <div className="flex items-center gap-1 border-r border-border/5 pr-2">
          <button type="button" onClick={goBack} disabled={historyIndex === 0} className="rounded p-1.5 transition-colors hover:bg-card/5 disabled:opacity-20" aria-label="Go back">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={goForward} disabled={historyIndex === history.length - 1} className="rounded p-1.5 transition-colors hover:bg-card/5 disabled:opacity-20" aria-label="Go forward">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={reload} className="rounded p-1.5 transition-colors hover:bg-card/5" aria-label="Reload preview">
            <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2 rounded-md border border-border/5 bg-[#1e1e1e] px-3 py-1.5 shadow-inner transition-all focus-within:border-primary/50">
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
          <Search className="h-3.5 w-3.5 cursor-pointer opacity-20 transition-opacity hover:opacity-100" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-1 border-l border-border/5 pl-2">
          <button
            type="button"
            onClick={() => url !== "about:blank" && window.open(url, "_blank", "noopener,noreferrer")}
            disabled={url === "about:blank"}
            className="rounded p-1.5 opacity-60 transition-colors hover:bg-card/5 hover:opacity-100 disabled:opacity-20"
            aria-label="Open preview in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button type="button" className="rounded p-1.5 opacity-60 transition-colors hover:bg-card/5 hover:opacity-100" aria-label="Browser options">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-2 text-[11px] text-destructive" role="alert">{error}</p>}
      </div>

      <div className="relative flex-1 bg-card">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px]">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="font-mono text-xs text-muted-foreground">Loading secure preview...</p>
          </div>
        )}

        {url === "about:blank" ? (
          <div className="flex h-full select-none flex-col items-center justify-center bg-[#1e1e1e] text-primary-foreground/20">
            <div className="mb-6 rounded-full bg-card/5 p-6"><Home className="h-12 w-12 opacity-10" /></div>
            <h2 className="mb-2 text-xl font-bold tracking-tight">Home</h2>
            <p className="max-w-xs text-center text-sm leading-relaxed opacity-50">Enter a URL above to preview your app or browse the web directly within Zen.</p>
          </div>
        ) : (
          <iframe
            key={`${url}:${reloadKey}`}
            src={url}
            className="h-full w-full border-none"
            title="Preview"
            sandbox="allow-forms allow-scripts"
            onLoad={() => setIsLoading(false)}
          />
        )}
      </div>
    </div>
  );
}
