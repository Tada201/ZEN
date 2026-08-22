import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AgentDelegationLane } from "./AgentDelegationLane";
import { AgentExecutionTrace } from "./AgentExecutionTrace";
import { ReasoningBlock } from "./ReasoningBlock";
import { SubagentExecutionCard } from "./SubagentExecutionCard";
import type { ArtifactData, Step, ToolCall } from "./types";
import type { AgentDelegationLaneModel } from "./agentDelegationLaneModel";
import { EXECUTION_DISCLOSURE_HARNESS_QUERY } from "./executionDisclosureHarnessContract";

export { EXECUTION_DISCLOSURE_HARNESS_QUERY };

type HarnessPhase = 0 | 1 | 2 | 3;
type HarnessCaseId = "reasoning" | "tool-group" | "delegation" | "subagent";
type HarnessResult = {
  phase: HarnessPhase;
  expected: boolean;
  actual: boolean | null;
  pass: boolean;
};

const CASE_IDS: HarnessCaseId[] = ["reasoning", "tool-group", "delegation", "subagent"];

function toolCalls(status: ToolCall["status"]): ToolCall[] {
  return [
    {
      id: "harness-read-file",
      name: "read_file",
      status,
      input: { path: "src/App.tsx" },
      output: status === "completed" ? "Read 42 lines." : "",
      startTime: 1_000,
      completedAt: status === "completed" ? 2_200 : undefined,
      durationMs: status === "completed" ? 1_200 : undefined,
    },
    {
      id: "harness-search",
      name: "web_search",
      status,
      input: { query: "Tauri lifecycle" },
      output: status === "completed" ? JSON.stringify({ summary: "Found lifecycle guidance." }) : "",
      startTime: 1_050,
      completedAt: status === "completed" ? 2_250 : undefined,
      durationMs: status === "completed" ? 1_200 : undefined,
    },
  ];
}

function delegationLane(status: AgentDelegationLaneModel["status"]): AgentDelegationLaneModel {
  const isCompleted = status === "completed";
  return {
    spawnId: "harness-delegation",
    batchId: "harness-batch",
    agentName: "Trace reviewer",
    parentName: "main",
    status,
    task: "Inspect disclosure lifecycle behavior",
    resultSummary: isCompleted ? "Lifecycle transitions remain readable." : "",
    liveContent: isCompleted ? "The mounted trace preserved its open state." : "Inspecting the mounted trace...",
    compactLivePreview: isCompleted ? "The mounted trace preserved its open state." : "Inspecting the mounted trace...",
    hasTranscript: true,
    liveContentType: "text",
    durationMs: isCompleted ? 1_250 : undefined,
  };
}

function subagentStep(status: "running" | "completed"): Step {
  return {
    type: "subagent",
    eventId: "harness-subagent",
    subagent: {
      spawnId: "harness-subagent",
      agentId: "harness-child-agent",
      agentName: "UI verifier",
      task: "Verify mounted disclosure behavior",
      status,
      resultSummary: status === "completed" ? "All disclosure transitions stayed user-controlled." : undefined,
      durationMs: status === "completed" ? 1_300 : undefined,
    },
  };
}

function expectedOpenForPhase(phase: HarnessPhase): boolean | undefined {
  if (phase === 0 || phase === 1) return true;
  if (phase === 3) return false;
  return undefined;
}

function phaseLabel(phase: HarnessPhase): string {
  if (phase === 0) return "Running — attention states should open";
  if (phase === 1) return "Completed — live-open surfaces should remain open";
  if (phase === 2) return "Manual collapse — user intent is recorded";
  return "Attention returns — manual collapse must remain closed";
}

function LifecycleProbe({
  caseId,
  phase,
  expectedOpen,
  onResult,
  onUnmount,
  children,
}: {
  caseId: HarnessCaseId;
  phase: HarnessPhase;
  expectedOpen: boolean | undefined;
  onResult: (caseId: HarnessCaseId, result: HarnessResult) => void;
  onUnmount: (caseId: HarnessCaseId) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    // React StrictMode performs a development-only setup/cleanup probe. Arm
    // after that probe so the result records the real mounted-tree teardown,
    // not the intentional first-pass cleanup.
    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 0);
    return () => {
      window.clearTimeout(armTimer);
      if (armed) onUnmount(caseId);
    };
  }, [caseId, onUnmount]);

  useEffect(() => {
    if (expectedOpen === undefined) return;

    const timer = window.setTimeout(() => {
      const root = document.querySelector(`[data-harness-case="${caseId}"]`);
      const disclosure = root?.querySelector<HTMLElement>("[aria-expanded]");
      const actual = disclosure ? disclosure.getAttribute("aria-expanded") === "true" : null;
      onResult(caseId, {
        phase,
        expected: expectedOpen,
        actual,
        pass: actual === expectedOpen,
      });
    }, 40);

    return () => window.clearTimeout(timer);
  }, [caseId, expectedOpen, onResult, phase]);

  return <section data-harness-case={caseId}>{children}</section>;
}

/**
 * Mounted in the real Tauri webview only when the dev query is present. This
 * intentionally renders the production disclosure owners rather than copies
 * of their state machines, so lifecycle regressions are observable in the
 * actual React/Radix/Tauri rendering stack.
 */
export function ExecutionDisclosureHarness() {
  const [phase, setPhase] = useState<HarnessPhase>(0);
  const [results, setResults] = useState<Partial<Record<HarnessCaseId, HarnessResult>>>({});
  const [mountedCases, setMountedCases] = useState(true);
  // This tracks mounted subtree teardown, not private effect internals inside
  // production owners. Their own timer/effect contracts remain source-tested.
  const [unmountedCases, setUnmountedCases] = useState<Set<HarnessCaseId>>(new Set());
  const [rootsGone, setRootsGone] = useState(false);
  const expectedOpen = expectedOpenForPhase(phase);

  const handleResult = useMemo(
    () => (caseId: HarnessCaseId, result: HarnessResult) => {
      setResults((current) => ({ ...current, [caseId]: result }));
    },
    [],
  );
  const handleUnmount = useMemo(
    () => (caseId: HarnessCaseId) => {
      setUnmountedCases((current) => {
        if (current.has(caseId)) return current;
        const next = new Set(current);
        next.add(caseId);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (phase === 0 || phase === 1) {
      const timer = window.setTimeout(() => setPhase((current) => (current + 1) as HarnessPhase), 900);
      return () => window.clearTimeout(timer);
    }

    if (phase === 2) {
      let completionTimer: number | undefined;
      const collapseTimer = window.setTimeout(() => {
        for (const caseId of CASE_IDS) {
          const root = document.querySelector(`[data-harness-case="${caseId}"]`);
          root?.querySelector<HTMLElement>('[aria-expanded="true"]')?.click();
        }
        completionTimer = window.setTimeout(() => setPhase(3), 80);
      }, 40);
      return () => {
        window.clearTimeout(collapseTimer);
        if (completionTimer !== undefined) window.clearTimeout(completionTimer);
      };
    }

    return undefined;
  }, [phase]);

  const allPassed = CASE_IDS.every((caseId) => results[caseId]?.pass === true && results[caseId]?.phase === 3)
    && unmountedCases.size === CASE_IDS.length
    && rootsGone;
  const completedCount = CASE_IDS.filter((caseId) => results[caseId]?.phase === 3).length;
  const noFailures = CASE_IDS.every((caseId) => results[caseId]?.pass !== false);

  useEffect(() => {
    if (phase !== 3 || completedCount !== CASE_IDS.length || !mountedCases) return;
    const timer = window.setTimeout(() => setMountedCases(false), 80);
    return () => window.clearTimeout(timer);
  }, [completedCount, mountedCases, phase]);

  useEffect(() => {
    if (mountedCases || unmountedCases.size !== CASE_IDS.length) return;
    const timer = window.setTimeout(() => {
      setRootsGone(CASE_IDS.every((caseId) => !document.querySelector(`[data-harness-case="${caseId}"]`)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mountedCases, unmountedCases]);

  const noopArtifact = (_artifact: ArtifactData) => undefined;

  return (
    <main className="min-h-screen overflow-y-auto bg-background px-5 py-6 text-foreground">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Tauri mounted harness</p>
              <h1 className="mt-1 text-lg font-semibold">Execution disclosure lifecycle</h1>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                Production reasoning, tool-group, delegation, and subagent surfaces are mounted below. No backend events or browser automation are used.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResults({});
                setUnmountedCases(new Set());
                setRootsGone(false);
                setMountedCases(true);
                setPhase(0);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Run again
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]" role="status" aria-live="polite">
            <span className="rounded-full border border-border bg-muted px-2 py-1">Phase {phase + 1}/4</span>
            <span className="text-muted-foreground">{phaseLabel(phase)}</span>
            {phase === 3 && (
              <strong className={allPassed ? "text-success" : noFailures ? "text-warning" : "text-destructive"}>
                {allPassed
                  ? "PASS — disclosure recovery and mounted subtree teardown verified"                  : mountedCases
                    ? `${completedCount}/4 cases completed; preparing cleanup`
                    : `${unmountedCases.size}/4 mounted cases cleaned up${rootsGone ? "; roots removed" : "; checking DOM teardown"}`}</strong>
            )}
          </div>
        </header>

        {mountedCases && (
        <div className="grid gap-3 md:grid-cols-2">
          <LifecycleProbe caseId="reasoning" phase={phase} expectedOpen={expectedOpen} onResult={handleResult} onUnmount={handleUnmount}>
            <div className="rounded-md border border-border bg-card p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reasoning</h2>
              <ReasoningBlock
                content="Inspecting the mounted lifecycle and preserving user-controlled disclosure."
                isThinking={phase === 0 || phase === 3}
              />
            </div>
          </LifecycleProbe>

          <LifecycleProbe caseId="tool-group" phase={phase} expectedOpen={expectedOpen} onResult={handleResult} onUnmount={handleUnmount}>
            <div className="rounded-md border border-border bg-card p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grouped tools</h2>
              <AgentExecutionTrace
                toolCalls={toolCalls(phase === 0 || phase === 3 ? "running" : "completed")}
                onOpenArtifact={noopArtifact}
              />
            </div>
          </LifecycleProbe>

          <LifecycleProbe caseId="delegation" phase={phase} expectedOpen={expectedOpen} onResult={handleResult} onUnmount={handleUnmount}>
            <div className="rounded-md border border-border bg-card p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Delegation lane</h2>
              <AgentDelegationLane lane={delegationLane(phase === 0 || phase === 3 ? "running" : "completed")} />
            </div>
          </LifecycleProbe>

          <LifecycleProbe caseId="subagent" phase={phase} expectedOpen={expectedOpen} onResult={handleResult} onUnmount={handleUnmount}>
            <div className="rounded-md border border-border bg-card p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subagent</h2>
              <SubagentExecutionCard
                step={subagentStep(phase === 0 || phase === 3 ? "running" : "completed")}
              />
            </div>
          </LifecycleProbe>
        </div>
        )}

        <footer className="rounded-md border border-border bg-card p-3 text-[11px] text-muted-foreground">
          <p><strong className="text-foreground">Validation contract:</strong> active surfaces open, live-open surfaces remain open on completion, then a real click collapses each surface and the next attention state cannot reopen it. The final phase verifies that all four production disclosure subtrees unmount and leave no harness roots.</p>
          <p className="mt-1">Close this Tauri dev window or navigate back to leave the harness. This route is compiled only for development.</p>
        </footer>
      </div>
    </main>
  );
}
