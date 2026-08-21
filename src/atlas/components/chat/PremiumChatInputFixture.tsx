import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ZenProvider } from "@/atlas/ZenContext";
import { PremiumChatInput } from "../PremiumChatInput";
import type { PremiumChatInputProps } from "../chat/input/PremiumChatInputTypes";
import type { Model } from "../model-types";
import { useTaskStore, type Task } from "@/lib/stores/taskStore";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils/style";
import { PREMIUM_CHAT_INPUT_FIXTURE_QUERY } from "./premiumChatInputFixtureContract";

export { PREMIUM_CHAT_INPUT_FIXTURE_QUERY };

type FixtureTheme = "dark" | "light";

type FixtureCaseProps = {
  caseId: string;
  label: string;
  description: string;
  width: string;
  theme?: FixtureTheme;
  initialDraft: string;
  variant?: "default" | "welcome";
  isSidebar?: boolean;
  isLoading?: boolean;
  isPaused?: boolean;
  readOnly?: boolean;
  seedTasks?: boolean;
  models: Model[];
  selectedModelId: string;
  selectedProvider: string;
  onEvent: (message: string) => void;
  children?: ReactNode;
};

const FIXTURE_MODELS: Model[] = [
  {
    id: "fixture-smart",
    name: "Zen Smart",
    provider: "openai",
    description: "Reasoning and tool-capable fixture model.",
    category: "Smart",
    capabilities: ["reasoning", "tools", "coding", "image-gen"],
    available: true,
    contextWindow: 128_000,
    reasoning: {
      support: "tunable",
      protocol: "openai_effort",
      controlAvailability: "zen",
      levels: ["minimal", "low", "medium", "high"],
      defaultLevel: "medium",
      canDisable: true,
      reasoningVisibility: "summary",
      source: "registry",
      confidence: "authoritative",
    },
  },
  {
    id: "fixture-budget",
    name: "Zen Budget",
    provider: "anthropic",
    description: "Budget-based reasoning fixture model.",
    category: "Balanced",
    capabilities: ["reasoning", "tools", "coding"],
    available: true,
    contextWindow: 200_000,
    reasoning: {
      support: "tunable",
      protocol: "anthropic_budget",
      controlAvailability: "zen",
      minBudget: 1024,
      maxBudget: 32768,
      stepBudget: 1024,
      defaultBudget: 4096,
      canDisable: true,
      reasoningVisibility: "summary",
      source: "registry",
      confidence: "authoritative",
    },
  },
  {
    id: "fixture-fast",
    name: "Zen Fast",
    provider: "google",
    description: "Compact no-reasoning fixture model.",
    category: "Fast",
    capabilities: ["coding"],
    available: true,
    contextWindow: 32_000,
    reasoning: {
      support: "unsupported",
      protocol: "none",
      controlAvailability: "none",
      canDisable: false,
      reasoningVisibility: "none",
      source: "registry",
      confidence: "authoritative",
    },
  },
];

const LONG_DRAFT = [
  "Review the current composer layout at narrow widths.",
  "Preserve the draft while the toolbar changes state and keep the send action stable.",
  "Check that the model picker, task plan, attachments, and reasoning controls remain readable.",
  "Do not submit this fixture message to a provider.",
].join("\n\n");

// Keep the theme matrix local to the fixture so it does not mutate the user's
// persisted theme while still exercising the same semantic composer tokens.
const FIXTURE_THEME_VARS: Record<FixtureTheme, CSSProperties> = {
  dark: {
    "--background": "240 10% 6%",
    "--foreground": "0 0% 98%",
    "--card": "240 8% 9%",
    "--muted": "240 6% 14%",
    "--muted-foreground": "240 5% 70%",
    "--border": "240 6% 18%",
    "--border-strong": "240 6% 28%",
    "--primary": "0 0% 98%",
    "--ring": "0 0% 83%",
    "--popover": "240 8% 9%",
    "--popover-foreground": "0 0% 98%",
  } as CSSProperties,
  light: {
    "--background": "0 0% 100%",
    "--foreground": "240 10% 8%",
    "--card": "0 0% 100%",
    "--muted": "240 5% 96%",
    "--muted-foreground": "240 4% 46%",
    "--border": "240 6% 90%",
    "--border-strong": "240 6% 80%",
    "--primary": "0 0% 9%",
    "--ring": "0 0% 9%",
    "--popover": "0 0% 100%",
    "--popover-foreground": "240 10% 8%",
  } as CSSProperties,
};

function FixtureTaskSeed({ chatId }: { chatId: string }) {
  useEffect(() => {
    const now = Date.now();
    const tasks: Task[] = [
      {
        id: `${chatId}-task-1`,
        description: "Inspect composer geometry",
        assignedTo: "ZEN",
        status: "completed",
        progress: 100,
        chatId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${chatId}-task-2`,
        description: "Compare narrow and wide toolbar states",
        assignedTo: "ZEN",
        status: "in-progress",
        progress: 55,
        chatId,
        createdAt: now + 1,
        updatedAt: now + 1,
      },
      {
        id: `${chatId}-task-3`,
        description: "Record visual baseline notes",
        assignedTo: "ZEN",
        status: "pending",
        progress: 0,
        chatId,
        createdAt: now + 2,
        updatedAt: now + 2,
      },
    ];

    const store = useTaskStore.getState();
    tasks.forEach((task) => store.addTask(task));
    return () => store.clearTasksForChat(chatId);
  }, [chatId]);

  return null;
}

function clickWithin(caseId: string, selector: string) {
  const root = document.querySelector<HTMLElement>(`[data-fixture-case="${caseId}"]`);
  root?.querySelector<HTMLButtonElement>(selector)?.click();
}

function clickTextWithin(caseId: string, text: string) {
  const root = document.querySelector<HTMLElement>(`[data-fixture-case="${caseId}"]`);
  const button = Array.from(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    .find((candidate) => candidate.textContent?.trim() === text);
  button?.click();
}

function addFixtureAttachment(caseId: string) {
  const root = document.querySelector<HTMLElement>(`[data-fixture-case="${caseId}"]`);
  const input = root?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input || typeof DataTransfer === "undefined") return;

  const transfer = new DataTransfer();
  transfer.items.add(new File([
    "export function fixtureLayoutCheck() { return true; }\n",
  ], "composer-fixture.ts", { type: "text/typescript" }));
  Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function FixtureCase({
  caseId,
  label,
  description,
  width,
  initialDraft,
  theme = "dark",
  variant,
  isSidebar,
  isLoading,
  isPaused,
  readOnly,
  seedTasks,
  models,
  selectedModelId: initialModelId,
  selectedProvider: initialProvider,
  onEvent,
  children,
}: FixtureCaseProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [selectedModelId, setSelectedModelId] = useState(initialModelId);
  const [selectedProvider, setSelectedProvider] = useState(initialProvider);
  const [generativeUI, setGenerativeUI] = useState(false);
  const onSend = useCallback<PremiumChatInputProps["onSend"]>((payload) => {
    onEvent(`${label}: send prevented from reaching a provider (${payload.message.length} draft chars)`);
  }, [label, onEvent]);

  const onSelectModel = useCallback((modelId: string, provider: string) => {
    setSelectedModelId(modelId);
    setSelectedProvider(provider);
    onEvent(`${label}: selected ${provider}/${modelId}`);
  }, [label, onEvent]);

  const setSlashDraft = useCallback(() => {
    setDraft("/");
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-fixture-case="${caseId}"] textarea`)?.focus();
    });
  }, [caseId]);

  return (
    <section
      data-fixture-case={caseId}
      data-fixture-theme={theme}
      data-fixture-width={width}
      data-fixture-state={[
        theme,
        variant || "default",
        isSidebar ? "sidebar" : "inline",
        isLoading ? "loading" : "idle",
        isPaused ? "paused" : "active",
        readOnly ? "readonly" : "editable",
      ].join("-")}
      className="space-y-3"
    >
      {seedTasks && <FixtureTaskSeed chatId={caseId} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {width}
        </span>
      </div>
      <div
        className="rounded-lg border border-border bg-muted p-2"
        style={{ maxWidth: width, ...FIXTURE_THEME_VARS[theme] }}
      >
        <PremiumChatInput
          variant={variant}
          isSidebar={isSidebar}
          activeChatId={seedTasks ? caseId : undefined}
          input={draft}
          onInputChange={setDraft}
          isLoading={isLoading}
          isPaused={isPaused}
          readOnly={readOnly}
          models={models}
          selectedModelId={selectedModelId}
          selectedProvider={selectedProvider}
          onSelectModel={onSelectModel}
          onSend={onSend}
          onAbort={() => onEvent(`${label}: abort requested`)}
          onPause={() => onEvent(`${label}: pause requested`)}
          onResume={() => onEvent(`${label}: resume requested`)}
          generativeUI={generativeUI}
          onGenerativeUIChange={setGenerativeUI}
        />
      </div>
      {children}
      {(caseId === "interactions" || caseId === "attachments" || caseId === "task-plan") && (
        <div className="flex flex-wrap gap-1.5" aria-label="Fixture interaction controls">
          <button
            type="button"
            onClick={() => clickWithin(caseId, 'button[aria-label="Open add menu"]')}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Open add menu
          </button>
          <button
            type="button"
            onClick={() => clickWithin(caseId, 'button[aria-label^="Select model:"]')}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Open model picker
          </button>
          <button
            type="button"
            onClick={() => {
              clickWithin(caseId, 'button[aria-label="Open add menu"]');
              window.requestAnimationFrame(() => clickTextWithin(caseId, "Create Image"));
            }}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Open image presets
          </button>
          <button
            type="button"
            onClick={() => addFixtureAttachment(caseId)}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Add fixture file
          </button>
          <button
            type="button"
            onClick={setSlashDraft}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Show slash commands
          </button>
          {caseId === "task-plan" && (
            <button
              type="button"
              onClick={() => clickWithin(caseId, 'button[aria-label="Expand task plan"]')}
              className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
            >
              Open task plan
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              clickWithin(caseId, 'button[aria-label="Open add menu"]');
              window.requestAnimationFrame(() => clickTextWithin(caseId, "Thinking"));
            }}
            className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground hover:bg-muted"
          >
            Toggle thinking
          </button>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground" role="status" aria-live="polite">
        {readOnly ? "Read-only transcript" : isLoading ? (isPaused ? "Paused response" : "Running response") : `${draft.length} draft characters`}
      </div>
    </section>
  );
}

function FixtureStorageBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const previousValues = useRef<Record<string, string | null>>({});
  const keys = useMemo(() => [
    "zen_pinned_actions",
    "zen_web_search",
    "zen_thinking",
    "zen_thinking_effort",
    "zen_thinking_budget",
    "zen_deep_research",
    "zen_image_gen",
  ], []);

  useEffect(() => {
    keys.forEach((key) => {
      previousValues.current[key] = localStorage.getItem(key);
    });
    localStorage.setItem("zen_pinned_actions", JSON.stringify(["thinking"]));
    localStorage.setItem("zen_web_search", "false");
    localStorage.setItem("zen_thinking", "false");
    localStorage.setItem("zen_thinking_effort", "medium");
    localStorage.setItem("zen_thinking_budget", "2048");
    localStorage.setItem("zen_deep_research", "false");
    localStorage.setItem("zen_image_gen", "false");
    setReady(true);

    return () => {
      keys.forEach((key) => {
        const previous = previousValues.current[key];
        if (previous === null || previous === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
      });
    };
  }, [keys]);

  if (!ready) return null;
  return <>{children}</>;
}

export function PremiumChatInputFixture() {
  const [events, setEvents] = useState<string[]>([]);
  const reducedMotion = useReducedMotion();
  const recordEvent = useCallback((message: string) => {
    setEvents((current) => [message, ...current].slice(0, 8));
  }, []);

  return (
    <ZenProvider>
      <TooltipProvider>
        <FixtureStorageBootstrap>
          <main className="min-h-screen overflow-y-auto bg-background px-5 py-6 text-foreground">
            <div className="mx-auto max-w-[1440px] space-y-6">
              <header className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Zen dev fixture</p>
                    <h1 className="mt-1 text-lg font-semibold">Premium chat input baseline</h1>
                    <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                      Development-only baseline for comparing composer geometry, subcomponent states, responsive behavior, focus paths, and resize stability before the design-system migration.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">prototype fixture</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-muted-foreground" aria-label="Fixture inventory">
                  {[
                    "empty",
                    "typed",
                    "long draft",
                    "loading",
                    "paused",
                    "read-only",
                    "welcome",
                    "sidebar",
                    "attachments",
                    "task plan",
                    "menus",
                    "slash commands",
                    "reasoning",
                  ].map((state) => (
                    <span key={state} className="rounded-full border border-border bg-muted px-2 py-1">{state}</span>
                  ))}
                </div>
              </header>

              <div className="grid gap-6 xl:grid-cols-2">
                <FixtureCase
                  caseId="empty"
                  label="Empty default"
                  description="Baseline idle state with the default inline composer and no draft content."
                  width="720px"
                  initialDraft=""
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="typed"
                  label="Typed draft"
                  description="Normal editing state with a short draft and active send affordance."
                  width="720px"
                  initialDraft="Review the current chat input layout."
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="long-draft"
                  label="Long multiline draft"
                  description="Bounded textarea growth and toolbar relationship under a realistic multiline draft."
                  width="720px"
                  initialDraft={LONG_DRAFT}
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="loading"
                  label="Loading response"
                  description="Running state with pause and stop controls visible."
                  width="720px"
                  initialDraft=""
                  isLoading
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="paused"
                  label="Paused response"
                  description="Paused state with resume and stop semantics."
                  width="720px"
                  initialDraft=""
                  isLoading
                  isPaused
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="readonly"
                  label="Read-only archive"
                  description="Archived transcript state where editing and resume actions are unavailable."
                  width="720px"
                  initialDraft="This archived draft remains visible but cannot be edited."
                  readOnly
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="welcome"
                  label="Welcome variant"
                  description="Attached setup composer with the compact welcome toolbar treatment."
                  width="720px"
                  initialDraft=""
                  variant="welcome"
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="sidebar"
                  label="Sidebar-width composer"
                  description="Narrow placement that should collapse labels without crushing the editor."
                  width="300px"
                  initialDraft="Check sidebar behavior."
                  isSidebar
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="task-plan"
                  label="Task plan available"
                  description="Deterministic task-plan data mounted through the production task store and drawer."
                  width="720px"
                  initialDraft="Inspect the task plan disclosure."
                  seedTasks
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="attachments"
                  label="Attachment state"
                  description="Use the interaction controls to add a deterministic text fixture through the real file input path."
                  width="720px"
                  initialDraft=""
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
                <FixtureCase
                  caseId="interactions"
                  label="Interactive subcomponents"
                  description="Use the controls to open add content, model search, image presets, slash commands, task plan, and reasoning paths."
                  width="720px"
                  initialDraft=""
                  models={FIXTURE_MODELS}
                  selectedModelId="fixture-smart"
                  selectedProvider="openai"
                  onEvent={recordEvent}
                />
              </div>

              <section className="space-y-3" aria-labelledby="fixture-matrix-title">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 id="fixture-matrix-title" className="text-sm font-semibold">Responsive and theme matrix</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">Exact container widths for visual review. Each row keeps the production composer mounted.</p>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">320 → 1440 px · light + dark</span>
                </div>
                <div className="space-y-6">
                  <FixtureCase
                    caseId="matrix-320-dark"
                    label="320px narrow · dark"
                    description="Smallest supported composer container with a typed draft."
                    width="320px"
                    initialDraft="Keep this draft stable while controls collapse."
                    theme="dark"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-smart"
                    selectedProvider="openai"
                    onEvent={recordEvent}
                  />
                  <FixtureCase
                    caseId="matrix-390-light"
                    label="390px narrow · light"
                    description="Mobile-width light theme with a long draft."
                    width="390px"
                    initialDraft={LONG_DRAFT}
                    theme="light"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-budget"
                    selectedProvider="anthropic"
                    onEvent={recordEvent}
                  />
                  <FixtureCase
                    caseId="matrix-480-dark"
                    label="480px breakpoint · dark"
                    description="Boundary width where compact labels should settle without wrapping."
                    width="480px"
                    initialDraft="Check the compact breakpoint boundary."
                    theme="dark"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-fast"
                    selectedProvider="google"
                    onEvent={recordEvent}
                  />
                  <FixtureCase
                    caseId="matrix-768-light"
                    label="768px tablet · light"
                    description="Tablet-width light theme with task and attachment-ready controls."
                    width="768px"
                    initialDraft="Review tablet toolbar balance."
                    theme="light"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-smart"
                    selectedProvider="openai"
                    onEvent={recordEvent}
                  />
                  <FixtureCase
                    caseId="matrix-1024-dark"
                    label="1024px desktop · dark"
                    description="Desktop-width dark theme for the full action vocabulary."
                    width="1024px"
                    initialDraft="Review the full desktop composer."
                    theme="dark"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-budget"
                    selectedProvider="anthropic"
                    onEvent={recordEvent}
                  />
                  <FixtureCase
                    caseId="matrix-1440-light"
                    label="1440px wide · light"
                    description="Wide light theme checks that the composer uses available width without over-expanding controls."
                    width="1440px"
                    initialDraft="Check wide-layout alignment and readable control grouping."
                    theme="light"
                    models={FIXTURE_MODELS}
                    selectedModelId="fixture-smart"
                    selectedProvider="openai"
                    onEvent={recordEvent}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="fixture-events-title">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="fixture-events-title" className="text-sm font-semibold">Fixture event log</h2>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">No backend calls</span>
                </div>
                <div className="mt-3 min-h-10 rounded-md border border-border bg-muted p-2 font-mono text-[10px] text-muted-foreground">
                  {events.length > 0 ? events.map((event, index) => <div key={`${event}-${index}`}>{event}</div>) : "Interact with a composer control to record a local baseline event."}
                </div>
              </section>

              <footer className={cn("rounded-lg border border-border bg-card p-3 text-[11px] text-muted-foreground", reducedMotion && "ring-1 ring-primary/30")}>
                <strong className="text-foreground">Development-only fixture.</strong> It mounts the production `PremiumChatInput` with deterministic local data behind <code className="rounded bg-muted px-1 font-mono text-[10px]">?{PREMIUM_CHAT_INPUT_FIXTURE_QUERY}</code>. Local fixture preference values are restored when the fixture unmounts.
              </footer>
            </div>
          </main>
        </FixtureStorageBootstrap>
      </TooltipProvider>
    </ZenProvider>
  );
}
