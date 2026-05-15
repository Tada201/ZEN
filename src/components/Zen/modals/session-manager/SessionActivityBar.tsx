import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { SESSION_CATEGORIES } from './types';
import { cn } from '@/lib/utils/style';
import { Settings, Plus } from 'lucide-react';

export function SessionActivityBar() {
    const selectedCategory = useSessionManagerUIStore(s => s.selectedCategory);
    const setSelectedCategory = useSessionManagerUIStore(s => s.setSelectedCategory);

    return (
        <aside className="w-[60px] bg-muted/30 border-r border-border flex flex-col items-center py-6 gap-6 shrink-0">
            {/* Top Actions */}
            <button className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-all shadow-sm">
                <Plus size={20} />
            </button>

            <div className="w-8 h-[1px] bg-border" />

            {/* Navigation Categories */}
            <nav className="flex-1 flex flex-col gap-3">
                {SESSION_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            title={cat.label}
                            className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative",
                                selectedCategory === cat.id
                                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_var(--color-primary-glow)]"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon size={18} />
                            {selectedCategory === cat.id && (
                                <div className="absolute -left-1 w-1 h-4 bg-primary rounded-r-full" />
                            )}
                            <div className="absolute left-full ml-4 px-2 py-1 rounded bg-popover border border-border text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                {cat.label}
                            </div>
                        </button>
                    );
                })}
            </nav>

            <div className="w-8 h-[1px] bg-border" />

            {/* Bottom Actions */}
            <button className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                <Settings size={18} />
            </button>
        </aside>
    );
}
