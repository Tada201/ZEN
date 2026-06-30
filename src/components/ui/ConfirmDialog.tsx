import { AppDialog } from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the destructive red treatment for the primary action. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmation dialog built on AppDialog for visual consistency with Zen's dark theme.
 * Use `destructive` for irreversible actions (purge, delete-all).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
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
            className={
              destructive
                ? 'h-8 px-3 text-xs bg-red-500/90 text-white hover:bg-red-500'
                : 'h-8 px-3 text-xs'
            }
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-zinc-400">
        {description ?? 'This action cannot be undone.'}
      </p>
    </AppDialog>
  );
}
