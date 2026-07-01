import { useState, useEffect } from 'react';
import {
  RotateCw, 
  Home, 
  ExternalLink,
  Shield,
  Lock,
  Search,
  MoreVertical,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrowserPreviewProps {
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

export function BrowserPreview({ initialUrl = "about:blank", onUrlChange }: BrowserPreviewProps) {
  const [url, setUrl] = useState(initialUrl);
  const [inputValue, setInputValue] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    if (initialUrl !== url) {
      setUrl(initialUrl);
      setInputValue(initialUrl);
    }
  }, [initialUrl]);

  const handleNavigate = (newUrl: string) => {
    let formattedUrl = newUrl;
    if (!/^https?:\/\//i.test(newUrl) && !newUrl.startsWith('about:')) {
      formattedUrl = 'https://' + newUrl;
    }
    
    setUrl(formattedUrl);
    setInputValue(formattedUrl);
    onUrlChange?.(formattedUrl);
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(formattedUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const prevUrl = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setUrl(prevUrl);
      setInputValue(prevUrl);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const nextUrl = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setUrl(nextUrl);
      setInputValue(nextUrl);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-border/5 rounded-lg overflow-hidden shadow-2xl">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-[#252526] border-b border-border/5 select-none">
        <div className="flex items-center gap-1 pr-2 border-r border-border/5">
          <button 
            onClick={goBack} 
            disabled={historyIndex === 0}
            className="p-1.5 rounded hover:bg-card/5 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={goForward} 
            disabled={historyIndex === history.length - 1}
            className="p-1.5 rounded hover:bg-card/5 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 1000);
            }} 
            className="p-1.5 rounded hover:bg-card/5 transition-colors"
          >
            <RotateCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-primary")} />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex-1 flex items-center bg-[#1e1e1e] rounded-md px-3 py-1.5 gap-2 border border-border/5 focus-within:border-primary/50 transition-all shadow-inner">
          <div className="flex items-center gap-1.5 opacity-40">
            {url.startsWith('https') ? (
              <Lock className="w-3 h-3 text-green-500" />
            ) : (
              <Shield className="w-3 h-3" />
            )}
          </div>
          <form 
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              handleNavigate(inputValue);
            }}
          >
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-[13px] text-primary-foreground/80 placeholder:text-primary-foreground/20 font-mono"
              placeholder="Search or enter address..."
              spellCheck={false}
              autoComplete="off"
            />
          </form>
          <div className="flex items-center gap-1.5 opacity-20 hover:opacity-100 transition-opacity">
            <Search className="w-3.5 h-3.5 cursor-pointer" />
          </div>
        </div>

        <div className="flex items-center gap-1 pl-2 border-l border-border/5">
          <button className="p-1.5 rounded hover:bg-card/5 transition-colors opacity-60 hover:opacity-100">
            <ExternalLink className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded hover:bg-card/5 transition-colors opacity-60 hover:opacity-100">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Browser Content */}
      <div className="flex-1 bg-card relative group">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground text-xs font-mono animate-pulse">Loading secure preview...</p>
          </div>
        )}
        
        {url === "about:blank" ? (
          <div className="h-full flex flex-col items-center justify-center bg-[#1e1e1e] text-primary-foreground/20 select-none">
            <div className="p-6 rounded-full bg-card/5 mb-6">
              <Home className="w-12 h-12 opacity-10" />
            </div>
            <h2 className="text-xl font-bold mb-2 tracking-tight">Home</h2>
            <p className="text-sm opacity-50 max-w-xs text-center leading-relaxed">
              Enter a URL above to preview your app or browse the web directly within Zen.
            </p>
          </div>
        ) : (
          <iframe 
            src={url}
            className="w-full h-full border-none"
            title="Preview"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          />
        )}
      </div>
    </div>
  );
}

