import React from 'react';
import { Library, File, Globe, Type, FileText, Eye, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface KnowledgeItem {
    id: string;
    type: 'file' | 'web' | 'text';
    title: string;
    status: 'indexed' | 'processing' | 'error';
    size?: string;
    date: number;
}

const MOCK_ITEMS: KnowledgeItem[] = [
    { id: '1', type: 'file', title: 'System_Architecture.pdf', status: 'indexed', size: '2.4 MB', date: Date.now() - 86400000 },
    { id: '2', type: 'web', title: 'https://docs.zen-ai.io/core', status: 'indexed', date: Date.now() - 172800000 },
    { id: '3', type: 'text', title: 'Context_Memory_Notes', status: 'processing', date: Date.now() },
];

export function KnowledgeView() {
    const renderIcon = (type: KnowledgeItem['type']) => {
        switch (type) {
            case 'file': return <File size={12} />;
            case 'web': return <Globe size={12} />;
            case 'text': return <Type size={12} />;
            default: return <FileText size={12} />;
        }
    };

    return (
        <div className="flex flex-col gap-1 px-2">
            {/* Action Bar */}
            <div className="flex items-center justify-between px-2 py-2 mb-2">
                <div className="flex items-center gap-2">
                    <Library size={12} className="text-primary opacity-60" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        Core Knowledge
                    </span>
                </div>
                <button className="p-1 rounded hover:bg-muted text-primary transition-colors">
                    <Plus size={12} />
                </button>
            </div>

            {/* List */}
            <div className="flex flex-col gap-1">
                {MOCK_ITEMS.map((item) => (
                    <div
                        key={item.id}
                        className="group flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/20 transition-all cursor-default"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                                <div className="text-muted-foreground opacity-40">
                                    {renderIcon(item.type)}
                                </div>
                                <span className="text-[11px] font-bold text-foreground truncate max-w-[140px]">
                                    {item.title}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 rounded bg-background hover:bg-muted text-muted-foreground border border-border transition-colors">
                                    <Eye size={10} />
                                </button>
                                <button className="p-1.5 rounded bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border transition-colors">
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "h-1 w-1 rounded-full",
                                    item.status === 'indexed' ? "bg-success shadow-[0_0_8px_var(--color-success)]" :
                                    item.status === 'processing' ? "bg-warning animate-pulse" : "bg-destructive"
                                )} />
                                <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-wider">
                                    {item.status}
                                </span>
                            </div>
                            <span className="text-[8px] font-mono text-muted-foreground/60 uppercase">
                                {item.size || (item.type === 'web' ? 'LINK' : 'SNIP')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State Help */}
            <div className="mt-6 p-4 rounded-lg border border-dashed border-border flex flex-col items-center text-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Neural Link</span>
                <p className="text-[9px] text-muted-foreground/40 leading-relaxed px-2">
                    Drop files or paste URLs to augment the neural engine's context.
                </p>
            </div>
        </div>
    );
}
