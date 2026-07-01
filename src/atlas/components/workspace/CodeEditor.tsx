import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { X, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  path: string;
  name: string;
  content: string;
  language: string;
}

export function CodeEditor({ activeFile }: { activeFile: string | null }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFile) return;

    const existingTab = tabs.find(t => t.path === activeFile);
    if (existingTab) {
      setActiveTabPath(activeFile);
      return;
    }

    // Fetch file content
    const fetchFile = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/chat-api/read-file?path=${encodeURIComponent(activeFile)}`);
        if (!resp.ok) throw new Error("Failed to read file");
        const data = await resp.json();
        
        const ext = activeFile.split(".").pop() || "plaintext";
        const languageMap: Record<string, string> = {
          js: "javascript",
          ts: "typescript",
          tsx: "typescript",
          jsx: "javascript",
          py: "python",
          css: "css",
          html: "html",
          json: "json",
          md: "markdown"
        };

        const newTab: Tab = {
          path: activeFile,
          name: activeFile.split("/").pop() || "untitled",
          content: data.content,
          language: languageMap[ext] || "plaintext"
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabPath(activeFile);
      } catch (err) {
        console.error("Editor error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFile();
  }, [activeFile, tabs]);

  const activeTab = tabs.find(t => t.path === activeTabPath);

  const closeTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.path !== path);
    setTabs(newTabs);
    if (activeTabPath === path) {
      setActiveTabPath(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null);
    }
  };

  if (tabs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/5">
        <FileCode className="h-16 w-16 mb-4 opacity-10" />
        <p className="text-sm font-medium tracking-tight">Select a file to start editing</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Tabs Header */}
      <div className="flex bg-[#252526] border-b border-border/20 overflow-x-auto no-scrollbar h-9">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            onClick={() => setActiveTabPath(tab.path)}
            className={cn(
              "flex items-center gap-2 px-3 h-full border-r border-border/20 cursor-pointer transition-colors text-[11px] group min-w-[120px] max-w-[200px]",
              activeTabPath === tab.path 
                ? "bg-[#1e1e1e] text-foreground border-t-2 border-t-primary" 
                : "bg-[#2d2d2d] text-muted-foreground hover:bg-[#2a2d2e]"
            )}
          >
            <span className="truncate flex-1">{tab.name}</span>
            <X 
              className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:bg-card/10 rounded-sm transition-all"
              onClick={(e) => closeTab(tab.path, e)}
            />
          </div>
        ))}
      </div>

      {/* Editor Content */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-50 bg-background/40 backdrop-blur-[1px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {activeTab && (
          <Editor
            height="100%"
            theme="vs-dark"
            language={activeTab.language}
            value={activeTab.content}
            options={{
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              minimap: { enabled: false },
              scrollbar: {
                vertical: "visible",
                horizontal: "visible",
                useShadows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
              },
              lineNumbers: "on",
              renderLineHighlight: "all",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 10 }
            }}
          />
        )}
      </div>
    </div>
  );
}
