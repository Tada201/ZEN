import React from 'react';
import { FileText, Play, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface Template {
    id: string;
    title: string;
    description: string;
    category: 'persona' | 'utility' | 'expert';
}

const MOCK_TEMPLATES: Template[] = [
    { id: '1', title: 'System Architect', description: 'Expert in high-level design and scalable infrastructure.', category: 'expert' },
    { id: '2', title: 'Code Reviewer', description: 'Thorough security and performance audit specialist.', category: 'utility' },
    { id: '3', title: 'Creative Writer', description: 'Narrative designer for immersive world building.', category: 'persona' },
];

export function TemplatesView() {
    return (
        <div className="flex flex-col gap-1 px-2">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-2 mb-2">
                <div className="flex items-center gap-2">
                    <FileText size={12} className="text-primary opacity-60" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        Neural Templates
                    </span>
                </div>
                <button className="p-1 rounded hover:bg-muted text-primary transition-colors">
                    <Plus size={12} />
                </button>
            </div>

            {/* Search */}
            <div className="px-2 mb-4">
                <div className="relative">
                    <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-30" />
                    <input
                        placeholder="Search templates..."
                        className="w-full bg-muted/30 border border-border/50 rounded-md pl-7 pr-3 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/20 transition-colors"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-2">
                {MOCK_TEMPLATES.map((template) => (
                    <div
                        key={template.id}
                        className="group flex flex-col gap-2 p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-all cursor-default"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-bold text-foreground">
                                    {template.title}
                                </span>
                                <span className="text-[8px] font-mono text-primary/60 uppercase tracking-widest">
                                    {template.category}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 rounded bg-muted hover:bg-primary/20 text-primary transition-colors">
                                    <Play size={10} className="fill-current" />
                                </button>
                                <button className="p-1.5 rounded bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        </div>

                        <p className="text-[10px] text-muted-foreground leading-snug">
                            {template.description}
                        </p>

                        <div className="flex items-center gap-1.5 mt-1">
                            <div className="px-1.5 py-0.5 rounded bg-muted text-[8px] font-mono text-muted-foreground uppercase">
                                ver 2.1.0
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
