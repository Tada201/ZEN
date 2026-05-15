import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

interface HeavyTabConfirmModalProps {
    open: boolean;
    tabName: string;
    description: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function HeavyTabConfirmModal({ open, tabName, description, onConfirm, onCancel }: HeavyTabConfirmModalProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
            <DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-[420px]">
                <DialogHeader>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                        <WorkbenchIcon name="lucide:alert-triangle" size={16} />
                    </div>
                    <DialogTitle className="text-[13px] font-black uppercase tracking-[0.18em] text-white">
                        Activate {tabName}?
                    </DialogTitle>
                    <DialogDescription className="font-mono text-[11px] uppercase leading-relaxed text-slate-500">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-2">
                    <WorkbenchButton variant="secondary" onClick={onCancel}>Cancel</WorkbenchButton>
                    <WorkbenchButton variant="primary" onClick={onConfirm}>Activate</WorkbenchButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
