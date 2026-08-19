import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ClipboardPaste, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ApiKeyInput({
  value,
  onChange,
  placeholder = "sk-...",
  className,
  disabled = false,
}: ApiKeyInputProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
      }
    } catch {
      // Clipboard access denied — user can paste manually
    }
  }, [onChange]);

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        ref={inputRef}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-20 h-8 text-[12px] bg-muted/40 border-border font-mono
          focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors
          placeholder:text-foreground/80"
      />
      <div className="absolute right-1 flex items-center gap-0.5">
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/70 hover:text-foreground hover:bg-muted"
            onClick={() => onChange("")}
            title="Clear"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/70 hover:text-foreground hover:bg-muted"
          onClick={handlePaste}
          title="Paste from clipboard"
        >
          <ClipboardPaste className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/70 hover:text-foreground hover:bg-muted"
          onClick={() => setVisible(!visible)}
          title={visible ? "Hide" : "Show"}
        >
          {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
