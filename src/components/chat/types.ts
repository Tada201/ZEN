import { Globe, Terminal, FileText, Code2 } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

export type Model = {
  id: string;
  name: string;
  provider: string;
  description: string;
  category: "Smart" | "Fast" | "Balanced";
  capabilities: string[];
  available: boolean;
  contextWindow?: number;
  inputPricePerMToken?: number;
};

export type Session = {
  id: string;
  title: string;
  model?: string | null;
  systemPrompt?: string | null;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  flagged?: boolean;
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
  status: "running" | "completed" | "error";
  input: Record<string, unknown> | string;
  output: string;
  durationMs?: number;
  retries?: number;
  attempts?: Array<{
    status: "running" | "completed" | "error";
    error?: string;
    durationMs?: number;
    timestamp: number;
  }>;
};

export type ArtifactData = {
  id: string;
  type: "code" | "markdown" | "svg" | "html" | "openui" | "diagram" | string;
  title: string;
  language?: string;
  content: string;
  version: number;
  chatId: string;
  messageId: string;
  createdAt: number;
  updatedAt: number;
};

export type Step = { 
  type: "text" | "tool-call" | "reasoning"; 
  content?: string; 
  toolCall?: ToolCall;
};

export type ThinkingConfig = {
  enabled: boolean;
  effort?: "low" | "medium" | "high";
  budgetTokens?: number;
};

export type Message = {
  id: string;
  sessionId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  steps?: Step[];
  artifact?: ArtifactData | null;
  createdAt?: number | Date;
  model?: string;
  provider?: string;
  webSearch?: boolean;
  thinking?: ThinkingConfig;
  deepResearch?: boolean;
  status?: "sending" | "sent" | "failed";
  error?: string;
  isThinking?: boolean;
  generativeUI?: number;
};

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
