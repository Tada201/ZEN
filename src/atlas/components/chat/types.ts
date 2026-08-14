/* ── Types ─────────────────────────────────────────────────── */

import { stripToolProtocolText } from "@/atlas/lib/toolProtocolText";
import { projectCanonicalMessageParts } from "@/atlas/agentRuntime/messageProjection";

export type MessageKind =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'agent_handoff'
  | 'agent_spawn'
  | 'agent_complete'
  | 'agent_chunk'
  | 'error'
  | 'system'
  | 'approval_request'
  | 'clarification_request'
  | 'deep_research'
  | 'chat_status'
  | 'orchestrator_progress'
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'task_started'
  | 'task_completed'
  | 'task_failed';

export interface ToolCallMeta {
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
}

export interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  linesAdded?: number;
  linesRemoved?: number;
  diff?: string;
}

export interface ToolResultMeta {
  toolName: string;
  status: 'ok' | 'error' | 'timeout';
  durationMs: number;
  contentSummary: string;
  files?: FileChange[];
  rawResult?: unknown;
  args?: Record<string, unknown>;
}

export interface HandoffMeta {
  fromAgent: string;
  toAgent: string;
  reason: string;
}

export interface SpawnMeta {
  spawnId?: string;
  batchId?: string;
  parentAgent: string;
  childAgent: string;
  task: string;
  status: 'spawned' | 'completed' | 'failed';
  durationMs?: number;
}

export interface ApprovalRequestMeta {
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  chat_id?: string;
  model?: string;
  context?: {
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    arguments_preview?: string;
    suggested_patterns?: string[];
  };
}

export interface ClarificationRequestMeta {
  question: string;
  type: 'single_select' | 'multi_select' | 'rank_priorities';
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  chatId: string;
}

export interface ActionMeta {
  runId?: string;
  messageId?: string;
  parentAgentId?: string;
  parentToolCallId?: string;
  traceId?: string;
  sequence?: number;
  executionId?: string;
  batchId?: string;
  toolBatchId?: string;
  agentId?: string;
  agentName?: string;
  iteration?: number;
  depth?: number;
  phase?: string;
  message?: string;
  provider?: string;
  model?: string;
  toolCount?: number;
  parallel?: boolean;
  /** Per-turn capability marker persisted in the local-first timeline. */
  generativeUI?: boolean;
  tools?: string[];
  workflowId?: string;
  totalTasks?: number;
  tasksCompleted?: number;
  durationMs?: number;
  taskId?: string;
  assignedTo?: string;
  tasks?: Array<{
    id?: string;
    task_id?: string;
    description?: string;
    status?: string;
    assigned_to?: string;
    assignedTo?: string;
    [key: string]: unknown;
  }>;
  tier?: string;
  battlePlan?: {
    steps?: string[];
    agents_needed?: string[];
    [key: string]: unknown;
  };
  updates?: Record<string, unknown>;
  taskResult?: {
    success?: boolean;
    output?: string;
    error?: string;
    durationMs?: number;
  };
  resultSummary?: string;
  error?: string;
  errorCategory?: import("@/atlas/agentRuntime/executionError").ExecutionErrorCategory;
  errorAction?: import("@/atlas/agentRuntime/executionError").ExecutionRecoveryAction;
  errorActionLabel?: string;
  errorTechnicalDetails?: string;
  errorRetryable?: boolean;
  recoverable?: boolean;
  traceVersion?: number;
  traceStatus?: string;
  tracePersistence?: "pending" | "saved" | "failed";
  tracePersistenceError?: string;
  agentStream?: {
    content: string;
    type?: "text" | "thought" | string;
    lastUpdatedAt?: number;
  };
  inlineThinkOpen?: boolean;
  inlineThinkPending?: string;
  toolProtocolPending?: string;
  progressPercent?: number;
  toolCall?: ToolCallMeta;
  toolCallPreview?: {
    index?: number;
    toolCallId?: string;
    toolName?: string;
    argumentsDelta?: string;
    argumentsPreview?: string | Record<string, unknown>;
    ready?: boolean;
  };
  toolResult?: ToolResultMeta;
  handoff?: HandoffMeta;
  spawn?: SpawnMeta;
  approvalRequest?: ApprovalRequestMeta;
  clarificationRequest?: ClarificationRequestMeta;
  researchSteps?: Array<{
    id?: string;
    text: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    phase?: string;
    agentIndex?: number;
    agentName?: string;
    durationSecs?: number;
    progressPercent?: number;
  }>;
  researchProgress?: {
    phase?: string;
    percent: number;
    status: 'pending' | 'running' | 'completed' | 'error';
  };
  researchScope?: Record<string, unknown>;
  researchClarification?: {
    originalQuestion: string;
    questions: string[];
    brief?: Record<string, unknown>;
  };
  status?: 'running' | 'completed' | 'error' | 'cancelled';
}

export interface ActiveTool {
  id: string;
  toolName: string;
  status: 'running' | 'awaiting_approval' | 'completed' | 'error';
  resultSummary?: string;
  argumentsPreview?: string;
  startTime?: number;
}


export type Session = {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  generativeUI?: number;
  tags?: string[];
  tokenCount?: number;
  lastModel?: string | null;
  folderId?: string | null;
  archived?: boolean;
  /** Session-specific workspace root. Null means this legacy/imported chat follows the configured default workspace fallback. */
  workspaceRoot?: string | null;
};

export type ChatFolder = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: number;
  updatedAt: number;
  sessionCount?: number;
};

export type Attachment = {
  type: "image" | "file" | "pdf" | "code";
  name: string;
  data: string;
  mimeType: string;
  extractedText?: string;
  pageCount?: number;
};

export type ToolCall = {
  id: string;
  name: string;
  status: "running" | "awaiting_approval" | "completed" | "error";
  /** Set only during history hydration when no live stream owns the run. */
  recoveryState?: "stale";
  input: Record<string, unknown> | string;
  output: string;
  /** Bounded, redacted result summary safe for trace storage and diagnostics. */
  outputPreview?: string;
  durationMs?: number;
  runId?: string;
  messageId?: string;
  parentAgentId?: string;
  executionId?: string;
  toolBatchId?: string;
  approvalContext?: {
    riskLevel?: "low" | "medium" | "high" | "critical" | string;
    description?: string;
    argumentsPreview?: string;
    suggestedPatterns?: string[];
  };
  agentId?: string;
  agentName?: string;
  iteration?: number;
  traceId?: string;
  parentToolCallId?: string;
  sequence?: number;
  phase?: string;
  batchId?: string;
  retries?: number;
  startTime?: number;
  completedAt?: number;
  lastUpdatedAt?: number;
  attempts?: Array<{
    status: "running" | "awaiting_approval" | "completed" | "error";
    error?: string;
    durationMs?: number;
    timestamp: number;
  }>;
};

export type ArtifactData = {
  id?: string;
  type: "code" | "markdown" | "svg" | "html" | "openui" | "diagram";
  title: string;
  language?: string;
  content: string;
  version?: number;
  chatId?: string;
  messageId?: string;
  createdAt?: number;
  updatedAt?: number;
};
export interface ToolInvocation {
  state: 'call' | 'result';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  step?: number;
}

export type ExecutionEventStatus = "pending" | "running" | "completed" | "error" | "cancelled";

export type ExecutionTracePhase =
  | "queued"
  | "planning"
  | "tool_announced"
  | "tool_running"
  | "waiting_for_approval"
  | "streaming"
  | "draining"
  | "completed"
  | "interrupted"
  | "errored"
  | "cancelled"
  | "escalating"
  | "waiting_for_input";

export interface SubagentStepData {
  spawnId: string;
  parentToolCallId?: string;
  agentId: string;
  agentName: string;
  task: string;
  status: "running" | "completed" | "failed" | "cancelled" | "incomplete" | "uncertain";
  recoveryState?: "stale";
  resultSummary?: string;
  error?: string;
  durationMs?: number;
  timestamp?: number;
  childToolCallIds?: string[];
}

export type Step = { 
  type: "text" | "tool-call" | "reasoning" | "action" | "subagent"; 
  content?: string; 
  toolCall?: ToolCall;
  subagent?: SubagentStepData;
  kind?: MessageKind | string;
  status?: ExecutionEventStatus;
  recoveryState?: "stale";
  metadata?: ActionMeta;
  timestamp?: number;
  sequence?: number;
  phase?: ExecutionTracePhase;
  eventId?: string;
};

export type ThinkingConfig = {
  enabled: boolean;
  effort?: "low" | "medium" | "high";
  budgetTokens?: number;
};

export type Message = {
  id: string;
  sessionId?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  steps?: Step[];
  artifact?: ArtifactData | null;
  createdAt?: number;
  model?: string;
  provider?: string;
  webSearch?: boolean;
  thinking?: ThinkingConfig;
  deepResearch?: boolean;
  status?: "sending" | "sent" | "failed" | "cancelled" | "paused";
  /** Durable history was recovered after an interrupted live execution. */
  recoveryState?: "recovered";
  error?: string;
  isThinking?: boolean;
  generativeUI?: number;
  kind?: MessageKind;
  metadata?: ActionMeta;
  toolInvocations?: ToolInvocation[];
  stepsJson?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toAttachmentArray(value: unknown): Attachment[] {
  return Array.isArray(value) ? value as Attachment[] : [];
}

/**
 * Reattaches tool calls persisted inside the ordered execution timeline to the
 * message-level tool-call index used by subagent cards and execution ledgers.
 *
 * `steps_json` is the chronological source of truth, while `tool_calls` is a
 * legacy/summary column. Keep existing entries first (so a richer legacy
 * record wins), then add step-only tools by stable id without duplicating
 * repeated history rows with the same stable id.
 */
export function mergeToolCallsFromSteps(
  existingToolCalls: ToolCall[] | undefined,
  steps: Step[] | undefined,
): ToolCall[] {
  const merged: ToolCall[] = [];
  const seenIds = new Set<string>();

  for (const toolCall of existingToolCalls || []) {
    if (toolCall.id && seenIds.has(toolCall.id)) continue;
    merged.push(toolCall);
    if (toolCall.id) seenIds.add(toolCall.id);
  }

  for (const step of steps || []) {
    if (step.type !== "tool-call" || !step.toolCall) continue;
    if (step.toolCall.id && seenIds.has(step.toolCall.id)) continue;
    merged.push(step.toolCall);
    if (step.toolCall.id) seenIds.add(step.toolCall.id);
  }

  return merged;
}

function toToolInvocationArray(value: unknown): ToolInvocation[] {
  return Array.isArray(value) ? value.filter(isToolInvocation) : [];
}

function isToolInvocation(value: unknown): value is ToolInvocation {
  if (!isRecord(value)) return false;
  return (
    typeof value.toolCallId === "string" &&
    typeof value.toolName === "string" &&
    (value.state === "call" || value.state === "result")
  );
}

export function extractInlineThoughtBlocks(content: string): { content: string; reasoning: string } {
  if (!content || !/<\/?(?:think|thought)>/i.test(content)) {
    return { content, reasoning: "" };
  }

  const reasoningParts: string[] = [];
  const closedBlockRegex = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/ig;
  let match: RegExpExecArray | null;
  while ((match = closedBlockRegex.exec(content)) !== null) {
    const text = match[1]?.trim();
    if (text) reasoningParts.push(text);
  }

  if (reasoningParts.length > 0) {
    return {
      content: content.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/ig, "").trim(),
      reasoning: reasoningParts.join("\n\n"),
    };
  }

  const openMatch = /<(?:thought|think)>/i.exec(content);
  if (!openMatch) return { content, reasoning: "" };

  return {
    content: content.slice(0, openMatch.index).trim(),
    reasoning: content.slice(openMatch.index + openMatch[0].length).trim(),
  };
}

function parsePersistedSteps(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (isRecord(parsed) && Array.isArray(parsed.steps)) return parsed.steps;
  } catch {
    return undefined;
  }
  return undefined;
}

export function normalizeVercelMessage(msg: unknown): Message {
  if (!isRecord(msg)) return msg as Message;

  const role = msg.role === "user" || msg.role === "assistant" || msg.role === "system" || msg.role === "tool"
    ? msg.role
    : "assistant";
  const rawContent = typeof msg.content === "string" ? msg.content : "";

  const canonicalParts = projectCanonicalMessageParts({
    content: rawContent,
    reasoning: typeof msg.reasoning === "string" ? msg.reasoning : undefined,
    steps: parsePersistedSteps(msg.stepsJson) || parsePersistedSteps(msg.steps),
    toolCalls: msg.toolCalls,
    toolInvocations: msg.toolInvocations,
  });

  // Prefer the persisted execution timeline if the backend saved one.
  // This keeps tool-call ordering, chat-status steps, subagent lanes and
  // other transient UI state identical before and after reload.
  let normalizedSteps: Step[] | undefined;
  if (typeof msg.stepsJson === "string" && msg.stepsJson.trim()) {
    try {
      const parsedSteps = parsePersistedSteps(msg.stepsJson);
      if (parsedSteps) {
        normalizedSteps = parsedSteps.map((step) => {
          if (!isRecord(step)) return step;
          return role === "assistant" && step.type === "text"
            ? { ...step, content: stripToolProtocolText(String(step.content || "")) }
            : step;
        }) as Step[];
      }
    } catch {
      // Fall through to legacy reconstruction if the JSON is corrupt.
    }
  }
  if (!normalizedSteps) {
    normalizedSteps = Array.isArray(msg.steps)
      ? (msg.steps as Step[]).map((step) => role === "assistant" && step.type === "text"
        ? { ...step, content: stripToolProtocolText(step.content || "") }
        : step)
      : undefined;
  }

  const normalized: Message = {
    id: typeof msg.id === "string" ? msg.id : `message-${Date.now()}`,
    sessionId: typeof msg.sessionId === "string" ? msg.sessionId : "",
    role,
    content: role === "assistant" ? canonicalParts.content : rawContent,
    reasoning: canonicalParts.reasoning,
    attachments: toAttachmentArray(msg.attachments),
    toolCalls: canonicalParts.toolCalls as ToolCall[],
    artifact: isRecord(msg.artifact) ? msg.artifact as ArtifactData : null,
    createdAt: typeof msg.createdAt === "number" ? msg.createdAt : Date.now(),
    model: typeof msg.model === "string" ? msg.model : undefined,
    provider: typeof msg.provider === "string" ? msg.provider : undefined,
    webSearch: typeof msg.webSearch === "boolean" ? msg.webSearch : undefined,
    thinking: isRecord(msg.thinking) ? msg.thinking as ThinkingConfig : undefined,
    deepResearch: typeof msg.deepResearch === "boolean" ? msg.deepResearch : undefined,
    status: msg.status === "sending" || msg.status === "sent" || msg.status === "failed" || msg.status === "cancelled" ? msg.status : undefined,
    error: typeof msg.error === "string" ? msg.error : undefined,
    isThinking: typeof msg.isThinking === "boolean" ? msg.isThinking : undefined,
    generativeUI: typeof msg.generativeUI === "boolean"
      ? (msg.generativeUI ? 1 : 0)
      : typeof msg.generativeUI === "number"
        ? (msg.generativeUI !== 0 ? 1 : 0)
        : normalizedSteps?.find((step) => {
            const metadata = isRecord(step.metadata) ? step.metadata : undefined;
            return typeof metadata?.generativeUI === "boolean";
          })?.metadata?.generativeUI
            ? 1
            : normalizedSteps?.some((step) => {
                const metadata = isRecord(step.metadata) ? step.metadata : undefined;
                return metadata?.generativeUI === false;
              })
                ? 0
                : undefined,
    kind: typeof msg.kind === "string" ? msg.kind as MessageKind : undefined,
    metadata: isRecord(msg.metadata) ? msg.metadata as ActionMeta : undefined,
    toolInvocations: toToolInvocationArray(msg.toolInvocations),
    stepsJson: typeof msg.stepsJson === "string" ? msg.stepsJson : undefined,
    // `stepsJson`/`steps` is the chronological source of truth. The
    // canonical projection is only a compatibility fallback for legacy rows
    // that never stored an ordered timeline. Previously this always used
    // `canonicalParts.steps`, which rebuilt every legacy-shaped message as
    // reasoning → all tools → final text and silently discarded the persisted
    // interleaving (reasoning → tool → text → tool → response).
    steps: (normalizedSteps && normalizedSteps.length > 0
      ? normalizedSteps
      : canonicalParts.steps) as Step[],
  };

  // Restore toolCalls from persisted steps so subagent child tools (which
  // live only inside steps after reload) stay reachable. SubagentExecutionCard
  // finds its children by filtering message.toolCalls against the subagent's
  // spawnId via traceId. Keep this reconstruction centralized so the real DB
  // mapper and this generic normalizer cannot drift.
  normalized.toolCalls = mergeToolCallsFromSteps(normalized.toolCalls, normalized.steps);

  // If toolInvocations is present, populate toolCalls and steps
  const toolInvocations = toToolInvocationArray(msg.toolInvocations);
  if (toolInvocations.length > 0) {
    const toolCalls: ToolCall[] = toolInvocations.map((ti) => {
      const isCompleted = ti.state === 'result';
      return {
        id: ti.toolCallId,
        name: ti.toolName,
        status: isCompleted ? 'completed' : 'running',
        input: ti.args,
        output: isCompleted ? (typeof ti.result === 'string' ? ti.result : JSON.stringify(ti.result, null, 2)) : '',
      };
    });

    // Merge legacy toolInvocations into toolCalls, deduping by id against
    // any tools already restored from stepsJson (Path A above). A message
    // can carry BOTH a persisted steps timeline AND legacy toolInvocations
    // pointing at the same toolCallId — a blind concatenate would duplicate
    // the tool cards and break SubagentExecutionCard's child-tool re-attachment
    // (which keys on id). Mirror Path A's merge: keep the existing (steps-derived)
    // entry and skip the legacy duplicate by id. Legacy tools without an id are
    // always kept — Path A cannot restore id-less tools, so they are unique to
    // this path and must not be dropped.
    const legacyExistingIds = new Set((normalized.toolCalls || []).map((tc) => tc.id).filter((id): id is string => Boolean(id)));
    const mergedLegacy = [...(normalized.toolCalls || [])];
    for (const tc of toolCalls) {
      if (!tc.id || !legacyExistingIds.has(tc.id)) {
        mergedLegacy.push(tc);
        if (tc.id) legacyExistingIds.add(tc.id);
      }
    }
    normalized.toolCalls = mergedLegacy;

    // If steps is empty, reconstruct steps from content and toolCalls
    if (!Array.isArray(normalized.steps) || normalized.steps.length === 0) {
      const steps: Step[] = [];
      if (typeof normalized.content === "string" && normalized.content) {
        steps.push({ type: 'text', content: normalized.content });
      }
      toolCalls.forEach((tc) => {
        steps.push({ type: 'tool-call', toolCall: tc });
      });
      normalized.steps = steps;
    }
  }

  // Fallback: If steps is still empty, reconstruct it from existing toolCalls and content for history messages
  if (!Array.isArray(normalized.steps) || normalized.steps.length === 0) {
    const steps: Step[] = [];
    let reasoning = normalized.reasoning || "";
    let finalContent = normalized.content || "";

    if (!reasoning && finalContent) {
      const extracted = extractInlineThoughtBlocks(finalContent);
      reasoning = extracted.reasoning;
      finalContent = extracted.content;
    }

    if (reasoning) {
      steps.push({ type: 'reasoning', content: reasoning });
      normalized.reasoning = reasoning;
    }
    if (Array.isArray(normalized.toolCalls) && normalized.toolCalls.length > 0) {
      normalized.toolCalls.forEach((tc) => {
        steps.push({ type: 'tool-call', toolCall: tc });
      });
    }
    if (finalContent) {
      steps.push({ type: 'text', content: finalContent });
      normalized.content = finalContent;
    }
    normalized.steps = steps;

  }

  return normalized as Message;
}

export type ApiKey = {
  id: string;
  provider: string;
  name: string;
  keyPreview: string;
  createdAt: number;
  baseUrl?: string;
  isDefault?: number;
};

/* ── Constants ──────────────────────────────────────────────── */

export const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-...", docsUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", docsUrl: "https://console.anthropic.com/settings/keys" },
  { id: "google", label: "Google Gemini", placeholder: "AIza...", docsUrl: "https://aistudio.google.com/app/apikey" },
  { id: "xai", label: "xAI (Grok)", placeholder: "xai-...", docsUrl: "https://console.x.ai/" },
  { id: "mistral", label: "Mistral", placeholder: "API Key...", docsUrl: "https://console.mistral.ai/" },
  { id: "groq", label: "Groq", placeholder: "gsk-...", docsUrl: "https://console.groq.com/keys" },
  { id: "perplexity", label: "Perplexity", placeholder: "pplx-...", docsUrl: "https://www.perplexity.ai/settings/api" },
  { id: "deepseek", label: "DeepSeek", placeholder: "sk-...", docsUrl: "https://platform.deepseek.com/" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", docsUrl: "https://openrouter.ai/keys" },
  { id: "opencode", label: "OpenCode Free", placeholder: "Not required", docsUrl: "https://opencode.ai/docs/zen" },
  { id: "mimo", label: "MiMo Code Free", placeholder: "Not required", docsUrl: "https://mimo.xiaomi.com" },
  { id: "together", label: "Together AI", placeholder: "API Key...", docsUrl: "https://api.together.xyz/" },
  { id: "ollama", label: "Ollama (Local)", placeholder: "Not required", docsUrl: "https://ollama.com/" },
  { id: "lmstudio", label: "LM Studio (Local)", placeholder: "Not required", docsUrl: "https://lmstudio.ai/" },
  { id: "custom", label: "Custom OpenAI", placeholder: "sk-...", docsUrl: "" },
];
