import { Globe, Terminal, FileText, Code2 } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

export type MessageKind =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'agent_handoff'
  | 'agent_spawn'
  | 'agent_complete'
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
  rawResult?: any;
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
  agentId?: string;
  agentName?: string;
  iteration?: number;
  depth?: number;
  phase?: string;
  message?: string;
  progressPercent?: number;
  toolCall?: ToolCallMeta;
  toolResult?: ToolResultMeta;
  handoff?: HandoffMeta;
  spawn?: SpawnMeta;
  approvalRequest?: ApprovalRequestMeta;
  clarificationRequest?: ClarificationRequestMeta;
  researchSteps?: Array<{ text: string; status: 'pending' | 'running' | 'completed' | 'error' }>;
  status?: 'running' | 'completed' | 'error';
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
  retries?: number;
  startTime?: number;
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
  args: any;
  result?: any;
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

export function normalizeVercelMessage(msg: any): Message {
  if (!msg) return msg;

  const normalized = {
    ...msg,
    sessionId: msg.sessionId || "",
    attachments: msg.attachments || [],
    toolCalls: msg.toolCalls || [],
    artifact: msg.artifact || null,
    createdAt: msg.createdAt || Date.now(),
  };

  // If toolInvocations is present, populate toolCalls and steps
  if (msg.toolInvocations && Array.isArray(msg.toolInvocations)) {
    const toolCalls: ToolCall[] = msg.toolInvocations.map((ti: any) => {
      const isCompleted = ti.state === 'result';
      return {
        id: ti.toolCallId,
        name: ti.toolName,
        status: isCompleted ? 'completed' : 'running',
        input: ti.args,
        output: isCompleted ? (typeof ti.result === 'string' ? ti.result : JSON.stringify(ti.result, null, 2)) : '',
      };
    });

    normalized.toolCalls = [...normalized.toolCalls, ...toolCalls];

    // If steps is empty, reconstruct steps from content and toolCalls
    if (!normalized.steps || normalized.steps.length === 0) {
      const steps: Step[] = [];
      if (normalized.content) {
        steps.push({ type: 'text', content: normalized.content });
      }
      toolCalls.forEach((tc) => {
        steps.push({ type: 'tool-call', toolCall: tc });
      });
      normalized.steps = steps;
    }
  }

  // Fallback: If steps is still empty, reconstruct it from existing toolCalls and content for history messages
  if (!normalized.steps || normalized.steps.length === 0) {
    const steps: Step[] = [];
    if (normalized.reasoning) {
      steps.push({ type: 'reasoning', content: normalized.reasoning });
    }
    if (normalized.toolCalls && normalized.toolCalls.length > 0) {
      normalized.toolCalls.forEach((tc: ToolCall) => {
        steps.push({ type: 'tool-call', toolCall: tc });
      });
    }
    if (normalized.content) {
      steps.push({ type: 'text', content: normalized.content });
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
  { id: "together", label: "Together AI", placeholder: "API Key...", docsUrl: "https://api.together.xyz/" },
  { id: "ollama", label: "Ollama (Local)", placeholder: "Not required", docsUrl: "https://ollama.com/" },
  { id: "lmstudio", label: "LM Studio (Local)", placeholder: "Not required", docsUrl: "https://lmstudio.ai/" },
  { id: "custom", label: "Custom OpenAI", placeholder: "sk-...", docsUrl: "" },
];

export const TOOL_ICONS: Record<string, any> = {
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
