import { CheckCircle2, Circle } from "lucide-react";
import { Panel, asRecord } from "./primitives";
import type { RendererContext } from "./registry";

// The checklist lives in the INPUT; the tool OUTPUT is only { message, total,
// completed } (or { message: "Checklist cleared" }). Models emit varied item
// shapes (task/step/content + status/completed), so parse defensively to match
// the backend's tolerant parser and keep this card in sync with the drawer.
type TodoStatus = "pending" | "in-progress" | "completed";
interface Todo {
  task: string;
  status: TodoStatus;
}

function normalizeStatus(record: Record<string, unknown>): TodoStatus {
  const raw = typeof record.status === "string" ? record.status.toLowerCase().trim() : "";
  if (raw === "completed" || raw === "complete" || raw === "done" || raw === "success") return "completed";
  if (raw === "in_progress" || raw === "in-progress" || raw === "active" || raw === "running" || raw === "started") return "in-progress";
  if (raw === "pending") return "pending";
  if (record.completed === true || record.done === true || record.complete === true) return "completed";
  return "pending";
}

function parseTodos(value: unknown): Todo[] {
  const raw = typeof value === "string" ? safeParse(value) : value;
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .map((item) => {
      const record = asRecord(item);
      const task = ["task", "step", "content", "description", "title", "name"]
        .map((key) => (typeof record[key] === "string" ? (record[key] as string) : ""))
        .find((v) => v.trim().length > 0);
      if (!task) return undefined;
      return { task, status: normalizeStatus(record) };
    })
    .filter((todo): todo is Todo => todo !== undefined);

  // Positional fallback matching the backend: if no item is explicitly
  // in_progress, the first unfinished item is the current step.
  if (!parsed.some((t) => t.status === "in-progress")) {
    const next = parsed.find((t) => t.status !== "completed");
    if (next) next.status = "in-progress";
  }
  return parsed;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function TodosCard({ input, output }: RendererContext) {
  const todos = parseTodos(asRecord(input).todos);

  if (todos.length === 0) {
    // Cleared, or nothing to show — surface the output message if present.
    const message = asRecord(output).message;
    if (typeof message === "string") {
      return <Panel label="Checklist">{<div className="text-[12px] text-muted-foreground">{message}</div>}</Panel>;
    }
    return null;
  }

  const done = todos.filter((todo) => todo.status === "completed").length;

  return (
    <Panel label={`Checklist · ${done}/${todos.length}`}>
      <div className="flex flex-col gap-1.5">
        {todos.map((todo, index) => (
          <div key={`${index}-${todo.task}`} className="flex items-start gap-2 text-[12px]">
            {todo.status === "completed" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            )}
            <span className={todo.status === "completed" ? "leading-5 text-muted-foreground line-through" : "leading-5 text-foreground"}>
              {todo.task}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
