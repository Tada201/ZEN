import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogClose,
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
      <DialogContent className={cn('max-h-[min(86vh,760px)] w-[min(92vw,680px)] gap-0 overflow-hidden border-border/15 bg-background/95 p-0 text-foreground shadow-2xl shadow-black/70 backdrop-blur-xl sm:rounded-none', className)}>
        <DialogHeader className="border-b border-border/10 px-4 py-3 text-left">
          <DialogTitle className="text-sm font-semibold tracking-normal text-foreground">{title}</DialogTitle>
          {description ? <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogClose className="absolute right-3 top-3 p-1 text-muted-foreground transition-colors hover:text-primary-foreground" aria-label="Close dialog">
          <X size={16} />
        </DialogClose>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="flex items-center justify-end gap-2 border-t border-border/10 px-4 py-3">{footer}</footer> : null}
      </DialogContent>
    </Dialog>
  );
}
