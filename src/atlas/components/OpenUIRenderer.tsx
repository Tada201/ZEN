/* ── OpenUIRenderer ────────────────────────────────────────────
   Renders OpenUI Lang code using the official @openuidev/react-lang
   Renderer with the default openuiLibrary + function-map tool provider.
─────────────────────────────────────────────────────────────── */

import { useState, useMemo, useEffect } from "react";
import { Renderer, type RendererProps } from "@openuidev/react-lang";
import { 
  AlertCircle, 
  Terminal,
  Loader2, 
  AlertTriangle 
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
 * to the backend API. Each tool call hits the Express endpoint.
 */
function createToolProvider(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return new Proxy(
    {} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
    {
      get(_target, toolName: string) {
        // Return a function that calls the backend tool endpoint
        return async (args: Record<string, unknown>) => {
          try {
            const res = await fetch("/chat-api/tools/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toolName, args }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(
                (err as { error?: string }).error ?? `Tool call failed: HTTP ${res.status}`
              );
            }
            return await res.json();
          } catch (err) {
            console.error(`[OpenUI] Tool "${toolName}" failed:`, err);
            throw err;
          }
        };
      },
    }
  );
}

const defaultToolProvider = createToolProvider();

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
  /** Custom tool provider (function map). Falls back to API proxy. */
  toolProvider?: RendererProps["toolProvider"];
  /** Callback when a component triggers an action */
  onAction?: RendererProps["onAction"];
}

export function OpenUIRenderer({
  content,
  isStreaming = false,
  toolProvider,
  onAction,
}: OpenUIRendererProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [renderErrors, setRenderErrors] = useState<any[]>([]);

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

    // 4. Resiliency: Convert positional arguments to keyword arguments.
    // AI often generates `Stack([a, b])` instead of `Stack(children=[a, b])`.
    // And `Text("Hello")` instead of `Text(content="Hello")`.
    const containers = [
      'Stack', 'VStack', 'HStack', 'Card', 'Grid', 'Row', 'Col',
      'stack', 'vstack', 'hstack', 'card', 'grid', 'row', 'col',
      'Text', 'text', 'TextContent',
      'BarChart', 'LineChart', 'PieChart', 'AreaChart',
      'Root', 'root',
      'Tag', 'tag',
    ];
    containers.forEach(name => {
      // Handle array: Component([a, b], ...) -> Component(children=[a, b], ...)
      // We stop at the first ']' followed by a comma or closing parenthesis to avoid overshooting
      const positionalArrayRegex = new RegExp(`(${name})\\s*\\(\\s*(\\[[^\\]]*\\])\\s*(,|\\)|\\s+[a-zA-Z_]\\w*\\s*=)`, 'g');
      extractedCode = extractedCode.replace(positionalArrayRegex, (match, n, array, next) => {
        // If the component is a chart, use 'labels' instead of 'children' for the first array arg
        const propName = n.toLowerCase().includes('chart') ? 'labels' : 'children';
        return `${n}(${propName}=${array}${next}`;
      });
    });

    // Handle string: Component("Hello", ...) -> Component(content="Hello", ...)
    // Specialized Text normalization for variant positional arg: Text("Hello", "variant") -> Text(content="Hello", variant="variant")
    extractedCode = extractedCode.replace(/Text\s*\(\s*("[^"]*"|'[^']*')\s*,\s*("[^"]*"|'[^']*')\s*\)/g, 'Text(content=$1, variant=$2)');
    
    containers.forEach(name => {
      // General positional string fix - restricted to avoid capturing across component boundaries
      const positionalStringRegex = new RegExp(`(${name})\\s*\\(\\s*("[^"]*"|'[^']*')\s*(,|\\)|\\s+[a-zA-Z_]\\w*\\s*=)`, 'g');
      extractedCode = extractedCode.replace(positionalStringRegex, '$1(content=$2$3');
    });

    // Handle Series positional arguments: Series("Name", [1, 2, 3]) -> Series(name=$1, data=$2)
    extractedCode = extractedCode.replace(/Series\s*\(\s*("[^"]*"|'[^']*')\s*,\s*(\[[^\]]*\])\s*\)/g, 'Series(name=$1, data=$2)');

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
      extractedCode += `\nroot = Stack(children=[${assignedVars.join(', ')}], gap=4)`;
    }

    console.log("[OpenUI] Extracted Code:", extractedCode);
    console.log("[OpenUI] Library Components:", Object.keys(extendedLibrary.catalog || {}));
    
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
                  <div className="relative min-h-[100px]">
                    <Renderer
                      response={extractedCode}
                      library={extendedLibrary}
                      isStreaming={isStreaming}
                      toolProvider={toolProvider ?? defaultToolProvider}
                      onAction={onAction}
                      queryLoader={<QueryLoader />}
                      onError={(errors) => setRenderErrors(errors)}
                    />
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
              className="rounded-2xl border border-border/40 bg-slate-950 overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-white/5 bg-white/5 px-4 py-2 relative z-10">
                <Terminal className="h-3 w-3 text-slate-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">OpenUI Lang Source</span>
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
