import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface ToolAuthorizationRequest {
    tool_call_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
    chat_id?: string;
    model?: string;
    context?: {
        risk_level?: 'low' | 'medium' | 'high' | 'critical';
        description?: string;
        arguments_preview?: string;
        suggested_patterns?: string[];
    };
}

interface ToolAuthorizationModalProps {
    pendingRequests: ToolAuthorizationRequest[];
    onApprove: (request: ToolAuthorizationRequest, alwaysAllowPattern?: string) => void;
    onDeny: (request: ToolAuthorizationRequest) => void;
}

export function ToolAuthorizationModal({ pendingRequests, onApprove, onDeny }: ToolAuthorizationModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    const currentRequest = pendingRequests[currentIndex] ?? null;

    useEffect(() => {
        if (currentIndex >= pendingRequests.length) {
            setCurrentIndex(Math.max(0, pendingRequests.length - 1));
        }
        setIsProcessing(false);
    }, [pendingRequests.length, currentIndex]);

    if (!currentRequest) return null;

    const riskColors: Record<string, string> = {
        low: 'text-success border-success bg-success/10',
        medium: 'text-warning border-warning bg-warning/10',
        high: 'text-orange-500 border-orange-500 bg-orange-500/10',
        critical: 'text-destructive border-destructive bg-destructive/10',
    };

    const riskLevel = currentRequest.context?.risk_level ?? 'medium';
    const riskClass = riskColors[riskLevel] ?? riskColors.medium;

    const handleApprove = async (pattern?: string) => {
        if (isProcessing) return;
        setIsProcessing(true);
        await onApprove(currentRequest, pattern);
        setIsProcessing(false);
        setCurrentIndex(prev => Math.max(0, Math.min(prev, pendingRequests.length - 2)));
    };

    const handleDeny = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        await onDeny(currentRequest);
        setIsProcessing(false);
        setCurrentIndex(prev => Math.max(0, Math.min(prev, pendingRequests.length - 2)));
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-card" />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
                    <div className="flex items-center gap-3">
                        <Shield size={16} className="text-warning" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">Tool Authorization</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {pendingRequests.length > 1 && (
                            <span className="text-[9px] font-mono text-muted-foreground">
                                {currentIndex + 1} / {pendingRequests.length}
                            </span>
                        )}
                        <span className={cn(
                            'flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border',
                            riskClass
                        )}>
                            <AlertTriangle size={10} />
                            {riskLevel.toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Neural Tool</label>
                            <span className="text-[13px] font-mono font-bold text-primary uppercase">{currentRequest.tool_name}</span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Operation Description</label>
                            <span className="text-[11px] text-foreground leading-relaxed">
                                {currentRequest.context?.description ?? 'External model is requesting direct system execution.'}
                            </span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Payload Arguments</label>
                            <pre className="mt-1 p-4 bg-card rounded-lg border border-border text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-48 scrollbar-thin">
                                {currentRequest.context?.arguments_preview ??
                                    JSON.stringify(currentRequest.arguments, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-muted">
                    {pendingRequests.length > 1 && (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                disabled={currentIndex === 0}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronLeft size={14} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentIndex(i => Math.min(pendingRequests.length - 1, i + 1))}
                                disabled={currentIndex === pendingRequests.length - 1}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight size={14} />
                            </Button>
                        </div>
                    )}

                    <div className="ml-auto flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeny}
                            disabled={isProcessing}
                            className="h-9 gap-2 px-4 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive text-[10px] font-bold uppercase tracking-widest"
                        >
                            <XCircle size={12} />
                            Deny
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApprove()}
                            disabled={isProcessing}
                            className="h-9 gap-2 px-4 text-[10px] font-bold uppercase tracking-widest"
                        >
                            <CheckCircle2 size={12} />
                            Allow Once
                        </Button>
                    </div>
                </div>

                {/* Always Allow Patterns */}
                {currentRequest.context?.suggested_patterns &&
                    currentRequest.context.suggested_patterns.length > 0 && (
                        <div className="px-6 pb-6 space-y-3">
                            <label className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Trusted Patterns</label>
                            <div className="flex flex-wrap gap-2">
                                {currentRequest.context.suggested_patterns.map((pattern, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleApprove(pattern)}
                                        disabled={isProcessing}
                                        className="px-3 py-1.5 rounded bg-muted border border-border text-[9px] font-mono text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/10 transition-all"
                                    >
                                        {pattern}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
            </div>
        </div>
    );
}
