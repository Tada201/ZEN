import { useEffect, useRef, useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Returns an error message to block submit, or null to allow. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
}

/**
 * Single-field text input modal built on AppDialog.
 * Replaces native window.prompt with a themed, focus-managed alternative.
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  validate,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
      // Defer focus until after the dialog mounts.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, initialValue]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter a value.');
      return;
    }
    const message = validate?.(trimmed);
    if (message) {
      setError(message);
      return;
    }
    onSubmit(trimmed);
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
            className="h-8 px-3 text-xs text-zinc-400 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={handleSubmit}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {label ? (
          <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </label>
        ) : null}
        <Input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          aria-invalid={Boolean(error)}
          className="h-9 bg-zinc-900/40 border-white/10 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        {error ? (
          <span className="text-[11px] text-red-400">{error}</span>
        ) : null}
      </div>
    </AppDialog>
  );
}
