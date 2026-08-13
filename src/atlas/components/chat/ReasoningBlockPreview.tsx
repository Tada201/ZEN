import { useEffect, useState, type ReactNode } from "react";
import { ReasoningBlock } from "./ReasoningBlock";
import { splitReasoningSections } from "./reasoningSections";

const CODE_FENCE = "`".repeat(3);
const RICH_REASONING = String.raw`## Decision path

I compared the local constraints before choosing the smallest safe change.

1. Preserve the existing disclosure state.
2. Keep the live stream cheap to render.
3. Format the completed notes for scanning.

The confidence score is $0.92$ because the observed result is consistent with the expected model:

$$
\text{confidence} = \frac{\text{supporting signals}}{\text{observed signals}} = \frac{11}{12}
$$

after normalizing the evidence.

equation: \(a^2 + b^2 = c^2\)

${CODE_FENCE}ts
const nextState = transitionDisclosure(current, "completed");
return nextState.open ? "show notes" : "show summary";
${CODE_FENCE}

> The final answer should be concise, but the reasoning remains available when audited.`;

const INTERLEAVED_REASONING = `## Context

Inspect the existing stream and constraints.

## Approach

Plan the smallest safe grouping change.

## Validation

Verify the result with focused tests.`;
const INTERLEAVED_REASONING_SECTIONS = splitReasoningSections(INTERLEAVED_REASONING);

const STREAM_SEGMENTS = [
  "Inspecting the request and checking the existing disclosure contract.",
  "Comparing the compact summary with the expanded reading state.",
  "Verifying that math and code remain readable after completion.",
  "Preserving the user's manual choice instead of reopening the panel automatically.",
];

function PreviewPanel({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-4" aria-labelledby={`reasoning-preview-${label}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id={`reasoning-preview-${label}`} className="text-[12px] font-semibold text-foreground">{label}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">fixture</span>
      </div>
      {children}
    </section>
  );
}

/**
 * Development-only visual fixture. It mounts the production ReasoningBlock
 * directly with deterministic content and a local simulated stream; it never
 * calls backend tools or pretends to be a production user-facing route.
 */
export function ReasoningBlockPreview() {
  const [streamIndex, setStreamIndex] = useState(0);
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    if (!isStreaming) return undefined;
    if (streamIndex >= STREAM_SEGMENTS.length - 1) {
      const completionTimer = window.setTimeout(() => setIsStreaming(false), 1_200);
      return () => window.clearTimeout(completionTimer);
    }

    const timer = window.setTimeout(() => setStreamIndex((current) => current + 1), 700);
    return () => window.clearTimeout(timer);
  }, [isStreaming, streamIndex]);

  const replayStream = () => {
    setStreamIndex(0);
    setIsStreaming(true);
  };

  const liveContent = STREAM_SEGMENTS.slice(0, streamIndex + 1).join(" ");

  return (
    <main className="min-h-screen overflow-y-auto bg-background px-5 py-6 text-foreground">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Zen dev fixture</p>
              <h1 className="mt-1 text-lg font-semibold">Reasoning block preview</h1>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                A real mounted preview of the production reasoning surface. Use it to check density, disclosure behavior, streaming transitions, equations, and code formatting without a backend session.
              </p>
            </div>
            <button
              type="button"
              onClick={replayStream}
              className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Replay stream
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground" aria-label="Preview states">
            <span className="rounded-full border border-border bg-muted px-2 py-1">Collapsed</span>
            <span className="rounded-full border border-border bg-muted px-2 py-1">Expanded</span>
            <span className="rounded-full border border-border bg-muted px-2 py-1">{isStreaming ? "Streaming" : "Completed stream"}</span>
            <span className="rounded-full border border-border bg-muted px-2 py-1">Math + code</span>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <PreviewPanel
            label="Collapsed completed"
            description="The default timeline state: one compact summary row with no wasted vertical space."
          >
            <ReasoningBlock content={RICH_REASONING} defaultOpen={false} />
          </PreviewPanel>

          <PreviewPanel
            label="Expanded completed"
            description="The audit state: structured prose, lists, inline math, display math, and a fenced TypeScript block."
          >
            <ReasoningBlock content={RICH_REASONING} defaultOpen />
          </PreviewPanel>

          <PreviewPanel
            label="Interleaved sections"
            description="The grouped state: separate thought chunks receive readable titles instead of becoming one undifferentiated block."
          >
            <ReasoningBlock content={INTERLEAVED_REASONING} sections={INTERLEAVED_REASONING_SECTIONS} defaultOpen />
          </PreviewPanel>

          <PreviewPanel
            label="Live stream"
            description="The production streaming state: a stable summary and timer while plain text arrives incrementally."
          >
            <ReasoningBlock content={liveContent} isThinking={isStreaming} defaultOpen={false} />
            <p className="mt-2 text-[10px] text-muted-foreground" role="status" aria-live="polite">
              {isStreaming ? `Segment ${streamIndex + 1} of ${STREAM_SEGMENTS.length} · completing automatically` : "Stream complete · expand the card to inspect the final notes"}
            </p>
          </PreviewPanel>

          <PreviewPanel
            label="Format stress sample"
            description="The same rich content is mounted again at a wider surface to expose wrapping and code/math alignment issues."
          >
            <div className="max-w-2xl">
              <ReasoningBlock content={RICH_REASONING} defaultOpen />
            </div>
          </PreviewPanel>
        </div>

        <footer className="rounded-md border border-border bg-card p-3 text-[11px] text-muted-foreground">
          <strong className="text-foreground">Dev-only preview.</strong> This fixture uses the production ReasoningBlock component with local deterministic content. It is gated behind <code className="rounded bg-muted px-1 font-mono text-[10px]">?zen-harness=reasoning-block</code> and is not reachable in production builds.
        </footer>
      </div>
    </main>
  );
}
