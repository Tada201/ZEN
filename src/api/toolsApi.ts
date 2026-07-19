import { callCommand } from "./tauriClient";

export type ToolRiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface BackendToolMeta {
  id: string;
  name: string;
  icon: string;
  risk_level: string;
  description: string;
  status?: string;
  status_detail?: string;
  user_configurable?: boolean;
}

export interface ToolMeta {
  id: string;
  name: string;
  icon: string;
  riskLevel: ToolRiskLevel;
  description: string;
  status: string;
  statusDetail: string;
  userConfigurable: boolean;
}

export interface RunToolCommandRequest {
  toolName: string;
  args: Record<string, unknown>;
  chatId?: string | null;
}

export function normalizeToolRiskLevel(raw: string): ToolRiskLevel {
  const level = raw.toLowerCase();
  if (level === "critical") return "Critical";
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  return "Low";
}

export function mapBackendToolMeta(tool: BackendToolMeta): ToolMeta {
  return {
    id: tool.id,
    name: tool.name,
    icon: tool.icon,
    riskLevel: normalizeToolRiskLevel(tool.risk_level),
    description: tool.description,
    status: tool.status || "ready",
    statusDetail: tool.status_detail || "",
    userConfigurable: tool.user_configurable !== false,
  };
}

export const toolsApi = {
  listToolMetadata: () =>
    callCommand<BackendToolMeta[]>("list_tool_metadata"),

  runToolCommand: ({ toolName, args, chatId }: RunToolCommandRequest) =>
    callCommand<unknown>("run_tool_command", {
      toolName,
      args,
      chatId: chatId ?? null,
    }),

  /**
   * @deprecated The backend now auto-syncs tool permissions whenever a
   * tool-related setting changes. This call is kept for explicit/forced
   * syncs (e.g. tests) but should not be called from normal UI flows.
   */
  syncPermissions: () =>
    callCommand<void>("sync_tool_permissions"),

  resolveApproval: (toolCallId: string, approved: boolean, rememberExact = false) =>
    callCommand<void>("resolve_tool_approval", { toolCallId, approved, rememberExact }),
};
