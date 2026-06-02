import { Globe, Terminal, FileText, Code2, type LucideIcon } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

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
  agentStream?: {
    content: string;
    type?: "text" | "thought" | string;
    lastUpdatedAt?: number;
  };
  inlineThinkOpen?: boolean;
  inlineThinkPending?: string;
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
  researchSteps?: Array<{ text: string; status: 'pending' | 'running' | 'completed' | 'error' }>;
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
  input: Record<string, unknown> | string;
  output: string;
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

export type Step = { 
  type: "text" | "tool-call" | "reasoning" | "action"; 
  content?: string; 
  toolCall?: ToolCall;
  kind?: MessageKind | string;
  status?: ExecutionEventStatus;
  metadata?: ActionMeta;
  timestamp?: number;
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
  status?: "sending" | "sent" | "failed" | "cancelled";
  error?: string;
  isThinking?: boolean;
  generativeUI?: number;
  kind?: MessageKind;
  metadata?: ActionMeta;
  toolInvocations?: ToolInvocation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toAttachmentArray(value: unknown): Attachment[] {
  return Array.isArray(value) ? value as Attachment[] : [];
}

function toToolCallArray(value: unknown): ToolCall[] {
  return Array.isArray(value) ? value as ToolCall[] : [];
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

export function normalizeVercelMessage(msg: unknown): Message {
  if (!isRecord(msg)) return msg as Message;

  const role = msg.role === "user" || msg.role === "assistant" || msg.role === "system" || msg.role === "tool"
    ? msg.role
    : "assistant";

  const normalized: Message = {
    id: typeof msg.id === "string" ? msg.id : `message-${Date.now()}`,
    sessionId: typeof msg.sessionId === "string" ? msg.sessionId : "",
    role,
    content: typeof msg.content === "string" ? msg.content : "",
    reasoning: typeof msg.reasoning === "string" ? msg.reasoning : undefined,
    attachments: toAttachmentArray(msg.attachments),
    toolCalls: toToolCallArray(msg.toolCalls),
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
    generativeUI: typeof msg.generativeUI === "number" ? msg.generativeUI : undefined,
    kind: typeof msg.kind === "string" ? msg.kind as MessageKind : undefined,
    metadata: isRecord(msg.metadata) ? msg.metadata as ActionMeta : undefined,
    toolInvocations: toToolInvocationArray(msg.toolInvocations),
    steps: Array.isArray(msg.steps) ? msg.steps as Step[] : undefined,
  };

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

    normalized.toolCalls = [...(normalized.toolCalls || []), ...toolCalls];

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

    if (!reasoning && finalContent && /<\/?(?:think|thought)>/i.test(finalContent)) {
      const thinkMatch = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i.exec(finalContent);
      if (thinkMatch) {
        reasoning = thinkMatch[1].trim();
        finalContent = finalContent.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/ig, "").trim();
      } else {
        const openMatch = /<(?:thought|think)>/i.exec(finalContent);
        if (openMatch) {
          const idx = openMatch.index;
          reasoning = finalContent.slice(idx + openMatch[0].length).trim();
          finalContent = finalContent.slice(0, idx).trim();
        }
      }
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
  { id: "together", label: "Together AI", placeholder: "API Key...", docsUrl: "https://api.together.xyz/" },
  { id: "ollama", label: "Ollama (Local)", placeholder: "Not required", docsUrl: "https://ollama.com/" },
  { id: "lmstudio", label: "LM Studio (Local)", placeholder: "Not required", docsUrl: "https://lmstudio.ai/" },
  { id: "custom", label: "Custom OpenAI", placeholder: "sk-...", docsUrl: "" },
];

export const TOOL_ICONS: Record<string, LucideIcon> = {
  web_search: Globe,
  googleSearch: Globe,
  run_code: Terminal,
  read_file: FileText,
  create_artifact: Code2,
};

/* ── Utils ────────────────────────────────────────────────── */

export function isOpenUILang(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  const hasRoot = /(?:^|\n)\s*root\s*=\s*\w+\s*\(/.test(trimmed);
  const assignmentCount = (trimmed.match(/\w+\s*=\s*\w+\s*\(/g) || []).length;
  return hasRoot || assignmentCount >= 3;
}
