import { toolsApi } from "@/api";
import { toast } from "sonner";
import { presentExecutionError } from "../../agentRuntime/executionError";

/** Resolve a backend-owned approval; the renderer never decides permission policy. */
export async function resolveToolApproval(
  toolCallId: string | undefined,
  approved: boolean,
  rememberExact = false,
): Promise<boolean> {
  if (!toolCallId) return false;
  try {
    await toolsApi.resolveApproval(toolCallId, approved, rememberExact);
    return true;
  } catch (error) {
    console.error("resolve_tool_approval failed:", error);
    toast.error(presentExecutionError(error, { context: "approval" }).summary);
    return false;
  }
}
