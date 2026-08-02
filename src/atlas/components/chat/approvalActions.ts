import { toolsApi } from "@/api";
import { toast } from "sonner";

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
    toast.error(error instanceof Error ? error.message : "Approval could not be resolved");
    return false;
  }
}
