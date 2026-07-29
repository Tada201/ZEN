export type ToolCategory =
  | "edit"
  | "run"
  | "read"
  | "search"
  | "delegate"
  | "approval"
  | "error"
  | "generic";

/**
 * Classify a tool into a user-facing category used for the thin left-border
 * signal on execution rows. The classification is conservative: a tool name
 * only needs to *contain* a keyword to land in a family, so aliases like
 * `bash_command`, `shell_exec`, and `cargo_test` all resolve to "run".
 */
export function classifyToolCategory(
  name: string,
  status?: string,
): ToolCategory {
  const lower = name.toLowerCase();

  if (status === "awaiting_approval" || lower.includes("approval")) {
    return "approval";
  }
  if (status === "error" || lower.includes("error")) {
    return "error";
  }
  if (
    lower.includes("delegate") ||
    lower.includes("spawn") ||
    lower.includes("subagent")
  ) {
    return "delegate";
  }
  if (
    lower.includes("search") ||
    lower.includes("web") ||
    lower.includes("grep") ||
    lower.includes("find")
  ) {
    return "search";
  }
  if (
    lower.includes("read") ||
    lower.includes("list") ||
    lower.includes("open")
  ) {
    return "read";
  }
  if (
    lower.includes("bash") ||
    lower.includes("shell") ||
    lower.includes("command") ||
    lower.includes("terminal") ||
    lower.includes("npm") ||
    lower.includes("cargo") ||
    lower.includes("test")
  ) {
    return "run";
  }
  if (
    lower.includes("edit") ||
    lower.includes("patch") ||
    lower.includes("write") ||
    lower.includes("create")
  ) {
    return "edit";
  }
  return "generic";
}
