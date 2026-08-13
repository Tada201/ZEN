export type TaskDisplayStatus = "pending" | "running" | "completed" | "error" | "cancelled";

export function normalizeTaskText(value: unknown, fallback = "", maxLength = 240): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function normalizeTaskDisplayStatus(value: unknown): TaskDisplayStatus {
  if (value === "running" || value === "in_progress" || value === "in-progress" || value === "started" || value === "active") {
    return "running";
  }
  if (value === "completed" || value === "complete" || value === "success" || value === "done") {
    return "completed";
  }
  if (value === "error" || value === "failed" || value === "failure") return "error";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  return "pending";
}

export function taskStatusLabel(value: unknown): string {
  const status = normalizeTaskDisplayStatus(value);
  if (status === "running") return "In progress";
  if (status === "completed") return "Complete";
  if (status === "error") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

export function isTaskTerminal(value: unknown): boolean {
  const status = normalizeTaskDisplayStatus(value);
  return status === "completed" || status === "error" || status === "cancelled";
}
