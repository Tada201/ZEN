import { memo, useCallback } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { Button } from '@/components/ui/button';
import { Info, Cpu, Shield, FileCode, Save } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface SessionInspectorProps {
    className?: string;
}

export const SessionInspector = memo(function SessionInspector({ className = '' }: SessionInspectorProps) {
    const sessions = useChatStore(s => s.sessions);
    const archivedSessions = useChatStore(s => s.archivedSessions);
    const selectedSessionId = useSessionManagerUIStore(s => s.selectedSessionId);
    const addArtifact = useChatStore(s => s.addArtifact);

    const allSessions = [...sessions, ...archivedSessions];
    const session = allSessions.find(s => s.id === selectedSessionId);

    const handleSaveAsTemplate = useCallback(() => {
        if (!session) return;
        addArtifact({
            id: crypto.randomUUID(),
            type: 'template',
            title: `Template: ${session.title}`,
            content: JSON.stringify({
                systemPrompt: session.systemPrompt,
                model: session.model,
                title: session.title,
            }, null, 2),
            version: 1,
            chatId: session.id,
            messageId: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }, [session, addArtifact]);

    return (
        <aside className={cn('w-[240px] h-full bg-card border-l border-border flex flex-col overflow-hidden shrink-0', className)}>
            {/* Header */}
            <div className="h-10 flex items-center gap-2 px-6 border-b border-border bg-muted">
                <Info size={12} className="text-primary opacity-60" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Inspector</span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8">
                {/* Session Identity */}
                <section className="pb-6 border-b border-border flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                        <Info size={11} />
                        <span>Session Identity</span>
                    </div>
                    {session ? (
                        <div className="grid gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] text-muted-foreground uppercase font-mono">UUID</span>
                                <span className="text-[10px] text-foreground font-mono break-all">{session.id}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] text-muted-foreground uppercase font-mono">Created</span>
                                <span className="text-[10px] text-foreground font-mono">
                                    {new Date(session.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] text-muted-foreground uppercase font-mono">Modified</span>
                                <span className="text-[10px] text-foreground font-mono">
                                    {new Date(session.updatedAt).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-[9px] text-muted-foreground italic">No session selected.</div>
                    )}
                </section>

                {/* Engine Parameters */}
                <section className="pb-6 border-b border-border flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                        <Cpu size={11} />
                        <span>Engine Parameters</span>
                    </div>
                    {session ? (
                        <div className="grid gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] text-muted-foreground uppercase font-mono">Neural Model</span>
                                <span className="text-[10px] text-primary font-bold uppercase">{session.model || 'GENERIC_LLM'}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[8px] text-muted-foreground uppercase font-mono">Status</span>
                                <span className="text-[10px] text-foreground flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary-glow)]" />
                                    Synchronized
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-[9px] text-muted-foreground italic">Awaiting neural link...</div>
                    )}
                </section>

                {/* Security & Integrity */}
                <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                        <Shield size={11} />
                        <span>Security</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[9px]">
                            <span className="text-muted-foreground">Encryption</span>
                            <span className="text-primary font-bold">ACTIVE</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                            <span className="text-muted-foreground">Persistence</span>
                            <span className="text-primary font-bold">LOCAL</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                            <span className="text-muted-foreground">Isolation</span>
                            <span className="text-foreground font-bold">SANDBOXED</span>
                        </div>
                    </div>
                </section>

                {/* Save as Template */}
                {session && (
                    <section className="pt-4 border-t border-border flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                            <FileCode size={11} />
                            <span>Template Export</span>
                        </div>
                        <Button
                            onClick={handleSaveAsTemplate}
                            variant="outline"
                            size="sm"
                            className="press w-full flex items-center justify-center gap-2 h-8"
                        >
                            <Save size={11} />
                            <span className="text-[9px] font-bold uppercase tracking-wide">Save as Template</span>
                        </Button>
                    </section>
                )}
            </div>
        </aside>
    );
});