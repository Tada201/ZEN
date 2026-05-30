export type ToolChecklistItem = {
  label: string;
  completed: boolean;
};

function compactText(value: unknown, maxLength = 160) {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildToolChecklistPreview(input: Record<string, unknown>): ToolChecklistItem[] {
  const todos = input.todos || input.tasks || input.checklist;
  if (!Array.isArray(todos)) return [];

  return todos.slice(0, 8).map((item, index) => {
    const record = asRecord(item);
    const completed =
      record.completed === true ||
      record.done === true ||
      record.status === "completed" ||
      record.status === "done" ||
      record.status === "success";

    return {
      label: compactText(record.task || record.description || record.title || record.name || `Item ${index + 1}`),
      completed,
    };
  });
}
