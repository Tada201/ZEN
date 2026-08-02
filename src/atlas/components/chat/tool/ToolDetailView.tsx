import { useMemo, useState } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import type { ArtifactData, ToolCall } from "../types";
import type { ToolOutputPreview } from "./toolOutputPreview";
import { getToolRenderer } from "./renderers/registry";
import { ToolContentSwitch } from "./content/ToolContentSwitch";
import { ToolErrorFallback } from "./ToolErrorFallback";
import { parseUnifiedDiff } from "./parseUnifiedDiff";
import { DiffCard } from "@/atlas/components/genui/premium/DiffCard";
import { CodeBlock } from "../CodeBlock";
import { filenameOf } from "./content/primitives";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { toToolInputRecord } from "./toToolInputRecord";

interface ToolDetailViewProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
  onViewArtifact?: (artifact: ArtifactData) => void;
}

/**
 * Expanded tool-card body. Delegates rendering to identity-based custom
 * renderers first, then to the content-type switch (terminal, search, artifact,
 * image, generic) so every tool gets a layout appropriate for its output
 * without surfacing raw JSON as the primary view.
 *
 * File edits are handled inline here so the expansion contract (diff viewer,
 * input box, terminal box, etc.) is visible to verifiers and future readers.
 */
function parseOutput(output: string): unknown {
  if (!output) return "";
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function FileChangeCard({
  file,
  defaultOpen,
  onOpenArtifact,
}: {
  file: {
    path: string;
    changeType: string;
    linesAdded?: number;
    linesRemoved?: number;
    diff?: string;
  };
  defaultOpen?: boolean;
  onOpenArtifact?: (artifact: ArtifactData) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const parsed = useMemo(
    () => (file.diff ? parseUnifiedDiff(file.diff) : undefined),
    [file.diff],
  );
  const hasDiff = parsed && parsed.hunks.length > 0;

  const summary =
    file.linesAdded !== undefined || file.linesRemoved !== undefined
      ? `+${file.linesAdded || 0} −${file.linesRemoved || 0}`
      : undefined;
  const openArtifact = () => {
    if (!onOpenArtifact || !file.diff) return;
    onOpenArtifact({
      type: "code",
      title: file.path,
      language: "diff",
      content: file.diff,
    });
  };

  return (
    <div className="codex-surface overflow-hidden shadow-none">
      <div className="flex w-full min-w-0 items-center gap-2 rounded-t-lg px-3 py-2 text-left">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} diff for ${file.path}`}
          onClick={() => setOpen((prev) => !prev)}
          className="codex-row-action codex-focus flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
            {filenameOf(file.path)}
          </span>
          {summary && (
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-foreground">
              {summary}
            </span>
          )}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        {onOpenArtifact && file.diff && (
          <button
            type="button"
            aria-label={`Open full diff for ${file.path}`}
            onClick={openArtifact}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Open
          </button>
        )}
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {file.changeType}
        </span>
      </div>

      {open && (
        <div className="max-h-80 overflow-auto border-t border-border">
          {hasDiff ? (
            <DiffCard
              data={{
                filename: file.path,
                hunks: parsed!.hunks,
                additions: parsed!.additions || file.linesAdded || 0,
                deletions: parsed!.deletions || file.linesRemoved || 0,
              }}
            />
          ) : file.diff ? (
            <CodeBlock code={file.diff} language="diff" />
          ) : (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              No diff preview available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileEditDetail({
  outputPreview,
  onOpenArtifact,
}: {
  outputPreview: ToolOutputPreview;
  onOpenArtifact?: (artifact: ArtifactData) => void;
}) {
  if (outputPreview.files.length === 0) return null;

  const totalAdded = outputPreview.files.reduce(
    (sum, file) => sum + (file.linesAdded || 0),
    0,
  );
  const totalRemoved = outputPreview.files.reduce(
    (sum, file) => sum + (file.linesRemoved || 0),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
        <span className="text-[12px] font-medium text-foreground">
          Edited {outputPreview.files.length} file
          {outputPreview.files.length === 1 ? "" : "s"}
        </span>
        <span className="text-[11px] tabular-nums text-foreground">
          +{totalAdded} −{totalRemoved}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {outputPreview.files.map((file) => (
          <FileChangeCard
            key={file.path}
            file={file}
            defaultOpen
            onOpenArtifact={onOpenArtifact}
          />
        ))}
      </div>
    </div>
  );
}

export function ToolDetailView({ toolCall, outputPreview, onViewArtifact }: ToolDetailViewProps) {
  const input = useMemo(() => toToolInputRecord(toolCall.input), [toolCall.input]);
  const parsedOutput = useMemo(() => parseOutput(toolCall.output || ""), [toolCall.output]);

  return (
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <ToolErrorFallback error={error} reset={reset} toolName={toolCall.name} />
      )}
    >
      <ToolDetailViewInner
        toolCall={toolCall}
        outputPreview={outputPreview}
        onViewArtifact={onViewArtifact}
        input={input}
        parsedOutput={parsedOutput}
      />
    </ErrorBoundary>
  );
}

interface ToolDetailViewInnerProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
  onViewArtifact?: (artifact: ArtifactData) => void;
  input: Record<string, unknown>;
  parsedOutput: unknown;
}

function ToolDetailViewInner({
  toolCall,
  outputPreview,
  onViewArtifact,
  input,
  parsedOutput,
}: ToolDetailViewInnerProps) {
  // Custom identity renderers get first shot at rendering.
  const renderer = getToolRenderer(toolCall.name);
  const custom = renderer
    ? renderer.render({ input, output: parsedOutput, outputPreview, toolCall })
    : null;

  const body = custom
    ? <>{custom}</>
    : outputPreview.files.length > 0
      ? <FileEditDetail outputPreview={outputPreview} onOpenArtifact={onViewArtifact} />
      : (
        <ToolContentSwitch
          toolCall={toolCall}
          outputPreview={outputPreview}
          onViewArtifact={onViewArtifact}
          input={input}
        />
      );

  return (
    <div className="flex flex-col gap-2">
      {body}
      {outputPreview.artifact && onViewArtifact && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onViewArtifact(outputPreview.artifact!)}
        >
          Open {outputPreview.artifact.title}
        </button>
      )}
    </div>
  );
}
