import { useMemo } from "react";
import { toAssetUrl } from "@/lib/utils/assetUrl";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import { CodeBlock } from "../CodeBlock";
import { DiffCard } from "../../genui/premium/DiffCard";
import type { ArtifactData, FileChange, ToolCall } from "../types";
import type { ToolOutputPreview } from "./toolOutputPreview";
import { parseUnifiedDiff } from "./parseUnifiedDiff";

interface ToolDetailViewProps {
  toolCall: ToolCall;
  outputPreview: ToolOutputPreview;
  onViewArtifact?: (artifact: ArtifactData) => void;
}

function toInputRecord(value: ToolCall["input"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function redactInput(value: Record<string, unknown>): string {
  const text = JSON.stringify(value, null, 2);
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(text)) {
    return text.replace(
      /("(?:[^"]*(?:api[_-]?key|authorization|bearer|credential|password|secret|token)[^"]*)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"',
    );
  }
  return text;
}

function filenameOf(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function isTerminalTool(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("terminal") ||
    lower.includes("shell") ||
    lower.includes("command") ||
    lower.includes("bash") ||
    lower.includes("exec")
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/20">
      <div className="border-b border-border/50 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="px-2 py-1.5">{children}</div>
    </div>
  );
}

function FileDetail({ file }: { file: FileChange }) {
  const parsed = useMemo(() => (file.diff ? parseUnifiedDiff(file.diff) : undefined), [file.diff]);

  if (parsed && parsed.hunks.length > 0) {
    return (
      <DiffCard
        data={{
          filename: file.path,
          hunks: parsed.hunks,
          additions: parsed.additions || file.linesAdded || 0,
          deletions: parsed.deletions || file.linesRemoved || 0,
        }}
      />
    );
  }

  if (file.diff) {
    // Malformed diff string — show it raw rather than dropping it.
    return <CodeBlock code={file.diff} language="diff" />;
  }

  return (
    <Panel label={`${file.changeType} · ${filenameOf(file.path)}`}>
      <div className="font-mono text-[11px] text-muted-foreground">
        {file.path}
        {(file.linesAdded !== undefined || file.linesRemoved !== undefined) && (
          <span className="ml-2">
            +{file.linesAdded || 0} −{file.linesRemoved || 0}
          </span>
        )}
      </div>
    </Panel>
  );
}

/**
 * Expanded tool-card body. Dispatches on the tool output:
 *  (a) file edits → per-file diff viewer,
 *  (b) image generation → prompt + rendered image,
 *  (c) everything else → Input box then Output box.
 */
export function ToolDetailView({ toolCall, outputPreview, onViewArtifact }: ToolDetailViewProps) {
  const input = useMemo(() => toInputRecord(toolCall.input), [toolCall.input]);

  // (a) File edits → diff viewer (one card per file).
  if (outputPreview.files.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {outputPreview.files.map((file) => (
          <FileDetail key={file.path} file={file} />
        ))}
      </div>
    );
  }

  // (b) Image generation → prompt input + rendered image.
  if (outputPreview.imageUri && isSafeGeneratedHref(outputPreview.imageUri)) {
    const prompt =
      typeof input.prompt === "string"
        ? input.prompt
        : typeof input.query === "string"
          ? input.query
          : "";
    return (
      <div className="flex flex-col gap-2">
        {prompt && (
          <Panel label="Prompt">
            <div className="text-[12px] leading-relaxed text-foreground">{prompt}</div>
          </Panel>
        )}
        <Panel label="Image">
          <img
            src={toAssetUrl(outputPreview.imageUri)}
            alt={prompt || "Generated image"}
            loading="lazy"
            className="max-h-72 w-auto rounded-md border border-border/40"
          />
        </Panel>
      </div>
    );
  }

  // (c) Other tools → Input box, then Output box.
  const hasInput = Object.keys(input).length > 0;
  const isTerminal = isTerminalTool(toolCall.name);

  return (
    <div className="flex flex-col gap-2">
      {hasInput && (
        <Panel label="Input">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {redactInput(input)}
          </pre>
        </Panel>
      )}

      {isTerminal ? (
        <Panel label="Terminal">
          {typeof input.command === "string" && (
            <div className="mb-1 font-mono text-[11px] text-foreground">$ {input.command}</div>
          )}
          {(outputPreview.stdout || outputPreview.stderr) && (
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
              {[outputPreview.stdout, outputPreview.stderr].filter(Boolean).join("\n")}
            </pre>
          )}
          {outputPreview.exitCode !== undefined && (
            <span
              className={
                outputPreview.exitCode === "0"
                  ? "mt-1 inline-block rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success"
                  : "mt-1 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
              }
            >
              exit {outputPreview.exitCode}
            </span>
          )}
        </Panel>
      ) : outputPreview.results.length > 0 ? (
        <Panel label="Output">
          <div className="flex flex-col gap-1.5">
            {outputPreview.results.slice(0, 5).map((result, index) => (
              <div key={`${result.title}-${index}`} className="min-w-0">
                <div className="truncate text-[12px] text-foreground">{result.title}</div>
                {result.summary && (
                  <div className="line-clamp-2 text-[11px] text-muted-foreground">{result.summary}</div>
                )}
                {result.url && (
                  <div className="truncate text-[10px] text-primary/70">{result.url}</div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ) : outputPreview.artifact ? (
        <Panel label="Output">
          <button
            type="button"
            onClick={() => onViewArtifact?.(outputPreview.artifact!)}
            className="flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
          >
            Open {outputPreview.artifact.title}
          </button>
        </Panel>
      ) : outputPreview.content || outputPreview.summary ? (
        <Panel label="Output">
          <div className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">
            {outputPreview.content || outputPreview.summary}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
