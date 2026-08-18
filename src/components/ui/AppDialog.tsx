import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/style';

interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Shared, compact dialog shell for Zen workbench surfaces. */
export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('flex max-h-[min(86vh,760px)] w-[min(92vw,680px)] max-w-[min(92vw,680px)] flex-col gap-0 overflow-hidden rounded-xl sm:rounded-xl border-border bg-card p-0 text-foreground shadow-2xl', className)}>
        <DialogHeader className="min-w-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="truncate text-sm font-semibold tracking-normal text-foreground">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="flex min-w-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-4">{footer}</footer> : null}
      </DialogContent>
    </Dialog>
  );
}
