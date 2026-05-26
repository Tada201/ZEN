import { callCommand } from "./tauriClient";

export type ToolRiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface BackendToolMeta {
  id: string;
  name: string;
  icon: string;
  risk_level: string;
  description: string;
}

export interface ToolMeta {
  id: string;
  name: string;
  icon: string;
  riskLevel: ToolRiskLevel;
  description: string;
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

  setYoloMode: async (enabled: boolean) => {
    await callCommand<void>("set_setting", {
      key: "tools.yolo-mode",
      value: String(enabled),
    });
    await callCommand<void>("sync_tool_permissions");
  },

  syncPermissions: () =>
    callCommand<void>("sync_tool_permissions"),

  resolveApproval: (toolCallId: string, approved: boolean) =>
    callCommand<void>("resolve_tool_approval", { toolCallId, approved }),
};
