import type { ToolCall } from "../types";
import type { ToolChecklistItem } from "./toolInputPreview";

export type ToolCompactPreviewTone =
  | "default"
  | "command"
  | "file"
  | "search"
  | "checklist"
  | "result"
  | "error";

export type ToolCompactPreview = {
  primary: string;
  secondary?: string;
  tone: ToolCompactPreviewTone;
};

type BuildToolCompactPreviewOptions = {
  name: string;
  input: Record<string, unknown>;
  outputSummary?: string;
  status?: ToolCall["status"];
  checklistItems?: ToolChecklistItem[];
};

function compactText(value: unknown, maxLength = 180): string {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function firstString(input: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = compactText(input[key]);
    if (value) return value;
  }
  return "";
}

function inferTone(name: string, input: Record<string, unknown>): ToolCompactPreviewTone {
  const normalized = name.toLowerCase();
  if (normalized.includes("search") || normalized.includes("web") || input.query || input.url) return "search";
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command") || input.command || input.cmd || input.script) return "command";
  if (normalized.includes("file") || normalized.includes("read") || normalized.includes("edit") || input.path || input.file || input.filePath) return "file";
  return "default";
}

export function buildToolCompactPreview({
  name,
  input,
  outputSummary,
  status,
  checklistItems = [],
}: BuildToolCompactPreviewOptions): ToolCompactPreview | null {
  const summary = compactText(outputSummary, 180);
  if ((status === "completed" || status === "error") && summary) {
    return {
      primary: summary,
      tone: status === "error" ? "error" : "result",
    };
  }

  if (checklistItems.length > 0) {
    const incompleteCount = checklistItems.filter((item) => !item.completed).length;
    const secondary = checklistItems.slice(0, 2).map((item) => item.label).filter(Boolean).join(" / ");
    return {
      primary: `${checklistItems.length} checklist item${checklistItems.length === 1 ? "" : "s"}${incompleteCount > 0 ? `, ${incompleteCount} open` : ""}`,
      secondary: secondary || undefined,
      tone: "checklist",
    };
  }

  const command = firstString(input, ["command", "cmd", "script"]);
  if (command) {
    return {
      primary: `$ ${command}`,
      tone: "command",
    };
  }

  const path = firstString(input, ["path", "file", "filePath", "targetPath"]);
  if (path) {
    const action = firstString(input, ["operation", "action", "changeType", "mode"]);
    return {
      primary: path,
      secondary: action || undefined,
      tone: "file",
    };
  }

  const query = firstString(input, ["query", "url", "search", "term"]);
  if (query) {
    return {
      primary: query,
      tone: "search",
    };
  }

  const title = firstString(input, ["title", "name", "description", "task"]);
  if (title) {
    return {
      primary: title,
      tone: inferTone(name, input),
    };
  }

  return null;
}
