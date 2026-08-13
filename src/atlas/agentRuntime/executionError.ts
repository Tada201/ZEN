import { redactToolText } from "../components/chat/tool/toolTextRedaction";

export type ExecutionErrorContext =
  | "assistant"
  | "transport"
  | "tool"
  | "subagent"
  | "approval"
  | "persistence"
  | "renderer";

export type ExecutionErrorCategory =
  | "authentication"
  | "rate_limit"
  | "quota"
  | "permission"
  | "timeout"
  | "network"
  | "approval_expired"
  | "cancelled"
  | "persistence"
  | "renderer"
  | "malformed"
  | "tool_failed"
  | "provider"
  | "unknown";

export type ExecutionRecoveryAction =
  | "retry"
  | "configure_provider"
  | "review_approval"
  | "keep_partial"
  | "continue"
  | "inspect"
  | "none";

export interface ExecutionErrorPresentation {
  category: ExecutionErrorCategory;
  title: string;
  summary: string;
  technicalDetails: string;
  retryable: boolean;
  recoverable: boolean;
  action: ExecutionRecoveryAction;
  actionLabel: string;
}

function toErrorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactTechnicalDetails(value: string) {
  return redactToolText(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^at\s+/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function categoryFor(value: string, context: ExecutionErrorContext, approvalExpired: boolean) {
  const text = value.toLowerCase();
  if (context === "renderer") return "renderer" as const;
  if (context === "persistence") return "persistence" as const;
  if (approvalExpired || /approval.{0,24}(expired|timeout|timed out)|(?:expired|timeout|timed out).{0,24}approval/.test(text)) return "approval_expired" as const;
  if (/cancel|abort|stopped|interrupted/.test(text)) return "cancelled" as const;
  if (/rate[ -]?limit|too many requests|\b429\b|throttl/.test(text)) return "rate_limit" as const;
  if (/quota|credit|usage limit|insufficient balance|billing/.test(text)) return "quota" as const;
  if (/api[_ -]?key|authorization|bearer|credential|password|secret|authentication|unauthorized|\b401\b/.test(text)) return "authentication" as const;
  if (/permission|forbidden|access denied|not allowed|\b403\b/.test(text)) return "permission" as const;
  if (/timeout|timed out|deadline|\b408\b/.test(text)) return "timeout" as const;
  if (/network|connection|connect|fetch|offline|unreachable|\b502\b|\b503\b|\b504\b/.test(text)) return "network" as const;
  if (/json|parse|malformed|invalid payload|unexpected token|schema/.test(text)) return "malformed" as const;
  if (context === "tool" || context === "subagent") return "tool_failed" as const;
  if (/provider|model|completion|request/.test(text)) return "provider" as const;
  return "unknown" as const;
}

function copyFor(category: ExecutionErrorCategory, context: ExecutionErrorContext, details: string) {
  switch (category) {
    case "authentication": return { title: "Authentication failed", summary: "The provider could not authenticate the request.", retryable: false, action: "configure_provider" as const, actionLabel: "Configure provider" };
    case "rate_limit": return { title: "Rate limit reached", summary: "The provider rate limit was reached before the operation completed.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
    case "quota": return { title: "Usage limit reached", summary: "The provider usage limit was reached.", retryable: false, action: "configure_provider" as const, actionLabel: "Review provider" };
    case "permission": return { title: "Permission blocked", summary: "The operation was blocked by permissions.", retryable: false, action: "review_approval" as const, actionLabel: "Review permissions" };
    case "timeout": return { title: "Operation timed out", summary: "The operation timed out before it completed.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
    case "network": return { title: "Connection lost", summary: context === "transport" ? "The connection was lost while the agent was running." : "The connection failed before the operation completed.", retryable: true, action: context === "transport" ? "keep_partial" as const : "retry" as const, actionLabel: context === "transport" ? "Keep partial" : "Retry" };
    case "approval_expired": return { title: "Approval expired", summary: "Approval expired before the operation started.", retryable: true, action: "review_approval" as const, actionLabel: "Review request" };
    case "cancelled": return { title: "Operation stopped", summary: "The operation was stopped before it completed.", retryable: true, action: context === "transport" ? "continue" as const : "retry" as const, actionLabel: context === "transport" ? "Continue" : "Retry" };
    case "persistence": return { title: "Trace not saved", summary: "The execution completed, but its trace could not be saved.", retryable: true, action: "inspect" as const, actionLabel: "Inspect live trace" };
    case "renderer": return { title: "Result display failed", summary: "The tool completed, but its result could not be displayed.", retryable: true, action: "retry" as const, actionLabel: "Retry display" };
    case "malformed": return { title: "Invalid tool result", summary: "The agent returned a result that Zen could not understand.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
    case "tool_failed": return { title: "Tool failed", summary: details ? `The ${context === "subagent" ? "delegated task" : "tool"} did not complete successfully.` : "The tool did not complete successfully.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
    case "provider": return { title: "Provider error", summary: "The provider could not complete the request.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
    default: return { title: "Operation failed", summary: details.length > 280 ? `${details.slice(0, 279)}…` : details || "The agent stopped unexpectedly.", retryable: true, action: "retry" as const, actionLabel: "Retry" };
  }
}

export function presentExecutionError(
  value: unknown,
  options: {
    context?: ExecutionErrorContext;
    category?: ExecutionErrorCategory;
    recoverable?: boolean;
    approvalExpired?: boolean;
  } = {},
): ExecutionErrorPresentation {
  const raw = toErrorText(value);
  const technicalDetails = compactTechnicalDetails(raw);
  const context = options.context || "assistant";
  const category = options.category || categoryFor(technicalDetails, context, options.approvalExpired === true);
  const copy = copyFor(category, context, technicalDetails);
  const recoverable = options.recoverable === true || category === "network" || category === "cancelled";

  return {
    category,
    title: copy.title,
    summary: copy.summary,
    technicalDetails: technicalDetails || copy.summary,
    retryable: copy.retryable,
    recoverable,
    action: recoverable && category === "network" && context === "transport" ? "keep_partial" : copy.action,
    actionLabel: recoverable && category === "network" && context === "transport" ? "Keep partial" : copy.actionLabel,
  };
}
