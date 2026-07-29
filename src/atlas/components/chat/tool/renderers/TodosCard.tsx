import { CheckCircle2, Circle } from "lucide-react";
import { Panel, asRecord } from "./primitives";
import type { RendererContext } from "./registry";

// The checklist lives in the INPUT ({ todos: [{ task, completed }] }); the tool OUTPUT is only
// { message, total, completed } (or { message: "Checklist cleared" }). So render from input.
interface Todo {
  task: string;
  completed: boolean;
}

function parseTodos(value: unknown): Todo[] {
  const raw = typeof value === "string" ? safeParse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const record = asRecord(item);
      const task = typeof record.task === "string" ? record.task : undefined;
      if (!task) return undefined;
      return { task, completed: record.completed === true };
    })
    .filter((todo): todo is Todo => todo !== undefined);
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

  const done = todos.filter((todo) => todo.completed).length;

  return (
    <Panel label={`Checklist · ${done}/${todos.length}`}>
      <div className="flex flex-col gap-1.5">
        {todos.map((todo, index) => (
          <div key={`${index}-${todo.task}`} className="flex items-start gap-2 text-[12px]">
            {todo.completed ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            )}
            <span className={todo.completed ? "leading-5 text-muted-foreground line-through" : "leading-5 text-foreground"}>
              {todo.task}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
