/* ── OpenUIRenderer ────────────────────────────────────────────
   Renders OpenUI Lang code using the official @openuidev/react-lang
   Renderer with the default openuiLibrary + function-map tool provider.
─────────────────────────────────────────────────────────────── */

import { useState, useMemo, useEffect } from "react";
import { Renderer, type RendererProps } from "@openuidev/react-lang";
import { 
  AlertCircle, 
  Terminal,
  Loader2 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { extendedLibrary } from "./genui";
export { extendedLibrary };
import { SourceEditor } from "./SourceEditor";

import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/styles/index.css";

/* ── Default Tool Provider (function map) ─────────────────── */

/**
 * Creates a function-map toolProvider that proxies tool calls
 * to the backend API via Tauri IPC.
 */
/* ── Custom Loading Spinner ───────────────────────────────── */

function QueryLoader() {
  return (
    <div className="flex items-center gap-2 py-3 px-4 text-sm text-muted-foreground animate-pulse">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span>Fetching data…</span>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */

interface OpenUIRendererProps {
  /** Raw OpenUI Lang code from the LLM response */
  content: string;
  /** Whether the LLM is still streaming */
  isStreaming?: boolean;
  /** Custom tool provider for trusted callers only. Model-generated UI gets no backend tool bridge by default. */
  toolProvider?: RendererProps["toolProvider"];
  /** Callback when a component triggers an action */
  onAction?: RendererProps["onAction"];
  /** The unique session id for this chat thread. Kept for caller compatibility; never grants tool access. */
  chatId?: string;
}

export function OpenUIRenderer({
  content,
  isStreaming = false,
  toolProvider,
  onAction,
}: OpenUIRendererProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [renderErrors, setRenderErrors] = useState<any[]>([]);
  // Gate on stream state alone: a whitespace-only-but-complete payload is a
  // valid (if empty) program, and gating on content.trim() left the
  // "Building interface..." loader up forever after chat:done.
  const hasStableSurface = !isStreaming;

  // Clear errors when content changes (essential for HMR and Retries)
  useEffect(() => {
    setRenderErrors([]);
  }, [content]);

  const { extractedCode, chatterText } = useMemo(() => {
    // 1. Try to find code inside markdown blocks first (if the model ignored instructions)
    const codeBlockMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
    let raw = codeBlockMatch ? codeBlockMatch[1] : content;

    // 2. Find the first assignment (e.g. root = or header =)
    // We look for anything that looks like "identifier ="
    const assignmentRegex = /^[\w.]+\s*=/m;
    const match = raw.match(assignmentRegex);
    
    if (!match) {
      // No assignments found? Maybe it's a single expression.
      // If it looks like a component call, treat it as root.
      if (raw.trim().match(/^\w+\s*\(/)) {
        return { extractedCode: `root = ${raw.trim()}`, chatterText: "" };
      }
      return { extractedCode: "", chatterText: raw };
    }

    const firstAssignmentIndex = match.index!;
    const chatterText = raw.substring(0, firstAssignmentIndex).trim();
    let extractedCode = raw.substring(firstAssignmentIndex).trim();

    // 3. Normalization: Always enforce newlines between assignments for the parser.
    // Matches a variable assignment that comes after a closing parenthesis, bracket, or quote.
    // We avoid lookbehind for maximum browser compatibility.
    extractedCode = extractedCode.replace(/([\)|\]|}|"|'])\s+([a-zA-Z_]\w*\s*=)/g, '$1\n$2');

    // 4. Resiliency: The parser is strictly positional and does not support keyword/named arguments.
    // The LLM generates valid positional arguments naturally. We ensure no broken keyword conversions are performed.

    // 5. Root assignment fallback - Smarter heuristic to avoid comments/strings
    // Only matches assignments that look like UI components (Capital Letter + '(')
    const varRegex = /(?:^|\n)([a-zA-Z_]\w*)\s*=\s*[A-Z]\w*\(/g;
    let varMatch;
    let hasRoot = false;
    const assignedVars: string[] = [];
    
    while ((varMatch = varRegex.exec(extractedCode)) !== null) {
      if (varMatch[1] === 'root') {
        hasRoot = true;
      } else {
        assignedVars.push(varMatch[1]);
      }
    }
    
    if (!hasRoot && assignedVars.length > 0) {
      extractedCode += `\nroot = Stack([${assignedVars.join(', ')}], 4)`;
    }

    return { extractedCode, chatterText };
  }, [content]);

  return (
    <div className="group/openui relative w-full overflow-visible transition-all">
      {/* View Mode Toggle - Only show when code is available and not streaming */}
      {extractedCode && !isStreaming && (
        <div className="absolute -top-10 right-0 z-20 flex items-center gap-2 opacity-0 group-hover/openui:opacity-100 transition-opacity">
          <div className="flex items-center rounded-lg border border-border/50 bg-background/80 backdrop-blur-md p-1 shadow-sm">
            <button
              onClick={() => setViewMode("preview")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition-all",
                viewMode === "preview" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              UI
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition-all",
                viewMode === "code" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              CODE
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area - Flush layout */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {viewMode === "preview" ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {chatterText && !isStreaming && (
                <div className="mb-6 text-sm text-foreground leading-relaxed">
                  {chatterText}
                </div>
              )}
              
              <div className="space-y-6">
                {extractedCode ? (
                  <div className="relative min-h-[100px] overflow-x-auto w-full max-w-full rounded-xl bg-card/95 border border-border/45 p-5 shadow-lg backdrop-blur-sm">
                    {hasStableSurface ? <Renderer
                      response={extractedCode}
                      library={extendedLibrary}
                      isStreaming={false}
                      toolProvider={toolProvider}
                      onAction={onAction}
                      queryLoader={<QueryLoader />}
                      onError={(errors) => setRenderErrors(errors)}
                    /> : <div className="flex items-center gap-3 py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-xs font-medium">Building interface...</span></div>}
                    {/* Fallback indicator if nothing is rendered after a delay */}
                    {!isStreaming && renderErrors.length === 0 && (
                      <div className="absolute inset-0 -z-10 flex items-center justify-center text-muted-foreground/20 italic text-[10px]">
                        Render initialized...
                      </div>
                    )}
                  </div>
                ) : isStreaming ? (
                  <div className="flex items-center gap-3 py-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs font-medium">Building interface...</span>
                  </div>
                ) : null}

                {renderErrors.length > 0 && !isStreaming && (
                  <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                    <div className="flex items-center gap-2 text-destructive mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-widest">Render Errors</span>
                    </div>
                    <ul className="space-y-1.5">
                      {renderErrors.map((err, i) => (
                        <li key={i} className="font-mono text-[11px] text-muted-foreground leading-relaxed">
                          • {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-border/40 bg-background overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-border/5 bg-card/5 px-4 py-2 relative z-10">
                <Terminal className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">OpenUI Lang Source</span>
              </div>
              <SourceEditor 
                content={extractedCode} 
                maxHeight="550px"
                className="border-0 rounded-none bg-transparent"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
