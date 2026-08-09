import { useEffect, useRef, useState } from "react";
import { AppDialog } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const CHAT_GROUP_COLORS = [
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#9f4052" },
  { name: "Orange", value: "#a6671c" },
  { name: "Yellow", value: "#817525" },
  { name: "Green", value: "#14785d" },
  { name: "Blue", value: "#1c6980" },
  { name: "Purple", value: "#5b4b85" },
] as const;

export const DEFAULT_CHAT_GROUP_COLOR = CHAT_GROUP_COLORS[0].value;

interface ChatGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialColor?: string | null;
  title: string;
  description: string;
  confirmLabel: string;
  onSubmit: (name: string, color: string) => void;
}

export function ChatGroupDialog({
  open,
  onOpenChange,
  initialName = "",
  initialColor,
  title,
  description,
  confirmLabel,
  onSubmit,
}: ChatGroupDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor || DEFAULT_CHAT_GROUP_COLOR);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setColor(initialColor || DEFAULT_CHAT_GROUP_COLOR);
    setError(null);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, initialColor, initialName]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a group name.");
      return;
    }
    onSubmit(trimmedName, color);
    onOpenChange(false);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-muted-foreground hover:text-primary-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="h-8 px-3 text-xs" onClick={handleSubmit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="chat-group-name" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Group name
          </label>
          <Input
            ref={inputRef}
            id="chat-group-name"
            value={name}
            placeholder="e.g. Research"
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            aria-invalid={Boolean(error)}
            className="h-9 bg-card/40 border-border/10 text-sm text-foreground placeholder:text-muted-foreground"
          />
          {error && <span className="text-[11px] text-destructive">{error}</span>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Group color</span>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Group color">
            {CHAT_GROUP_COLORS.map((option) => {
              const selected = color.toLowerCase() === option.value.toLowerCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setColor(option.value)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    selected
                      ? "bg-muted text-foreground ring-1 ring-primary/60"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: option.value }} aria-hidden="true" />
                  <span>{option.name}</span>
                  {selected && <span className="ml-auto text-primary" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppDialog>
  );
}
