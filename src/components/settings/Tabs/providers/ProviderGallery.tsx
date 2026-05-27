import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchInput } from "@/components/settings/ui/WorkbenchInput";
import { providerOrder } from "@/lib/types/provider";
import { cn } from "@/lib/utils/style";
import { PROVIDER_ICONS } from "./constants";

export interface ProviderTile {
    id: string;
    label: string;
    icon?: string;
    isCustom: boolean;
}

export interface ProviderCategory {
    id: string;
    label: string;
    providers: ProviderTile[];
}

interface ProviderGalleryProps {
    filteredCategories: ProviderCategory[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    getProviderStatus: (id: string) => string;
    onProviderClick: (id: string) => void;
    onAddCustom: () => void;
}

const ScrollArea = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("overflow-y-auto custom-scrollbar", className)}>
        {children}
    </div>
);

export function ProviderGallery({
    filteredCategories,
    searchQuery,
    onSearchChange,
    getProviderStatus,
    onProviderClick,
    onAddCustom,
}: ProviderGalleryProps) {
    return (
        <div className="flex flex-col h-full overflow-hidden p-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between mb-6">
                <div className="space-y-0.5">
                    <h3 className="text-lg font-bold tracking-tight flex items-center gap-2 text-white/90">
                        Discovery Center
                        <span className="text-[9px] h-4 px-1.5 flex items-center border border-blue-500/30 bg-blue-500/10 text-blue-400 rounded-full font-bold">v2.0</span>
                    </h3>
                    <p className="text-[11px] text-white/30 font-medium">Manage node connections and credentials.</p>
                </div>
                <div className="relative w-56">
                    <WorkbenchIcon name="lucide:search" size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20" />
                    <WorkbenchInput
                        placeholder="Search providers..."
                        className="h-8 pl-8 text-[11px] bg-white/[0.02] border-white/[0.06] focus:bg-white/[0.04] rounded-lg"
                        value={searchQuery}
                        onChangeText={onSearchChange}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1 -mx-2 px-2">
                <div className="space-y-10 pb-12">
                    {filteredCategories.map(cat => (
                        <div key={cat.id} className="space-y-4">
                            <div className="flex items-center gap-3 px-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30">{cat.label}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                {cat.providers.map(provider => {
                                    const status = getProviderStatus(provider.id);
                                    return (
                                        <button
                                            key={provider.id}
                                            onClick={() => onProviderClick(provider.id)}
                                            className={cn(
                                                "group relative flex flex-col p-3.5 rounded-xl border transition-all active:scale-95 text-left",
                                                status !== 'none'
                                                    ? "bg-primary/[0.03] border-primary/20"
                                                    : "bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/10"
                                            )}
                                        >
                                            <div className="relative h-10 w-10 flex items-center justify-center rounded-lg bg-background border border-border/50 mb-3 group-hover:border-primary/20 transition-colors">
                                                {PROVIDER_ICONS[provider.id] || <WorkbenchIcon name={provider.icon || "lucide:cpu"} size={20} className="text-white/60" />}
                                                {status !== 'none' && (
                                                    <div className={cn(
                                                        "absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                                                        status === 'active' ? "bg-emerald-500" : "bg-amber-400"
                                                    )} />
                                                )}
                                            </div>
                                            <span className="text-[12px] font-bold uppercase tracking-tight text-white/90 truncate w-full">
                                                {provider.label}
                                            </span>
                                            <span className="text-[10px] text-white/20 font-bold uppercase mt-1 tracking-wider">
                                                {status === 'none' ? 'Configure' : 'Managed'}
                                            </span>
                                        </button>
                                    );
                                })}

                                {cat.id === 'custom' && (
                                    <button
                                        onClick={onAddCustom}
                                        className="flex flex-col p-3.5 rounded-xl border border-dashed border-white/10 bg-white/[0.01] hover:bg-white/[0.02] hover:border-white/20 transition-all text-left"
                                    >
                                        <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-white/[0.01] border border-white/5 mb-3">
                                            <WorkbenchIcon name="lucide:plus" size={18} className="text-white/20" />
                                        </div>
                                        <span className="text-[11px] font-bold uppercase tracking-tight text-white/30">Register Node</span>
                                        <span className="text-[9px] text-white/10 font-bold uppercase mt-1 tracking-wider">OAI Endpoint</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            <div className="pt-6 border-t border-white/5 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                        {providerOrder.slice(0, 3).map(provider => (
                            <div key={provider.key} className="h-7 w-7 rounded-full border-2 border-zinc-950 bg-zinc-900 flex items-center justify-center">
                                {PROVIDER_ICONS[provider.key] || <WorkbenchIcon name={provider.icon || "lucide:cpu"} size={12} className="text-white/40" />}
                            </div>
                        ))}
                    </div>
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.15em]">
                        Encryption: AES-256 GCM Local
                    </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Backend Synchronized</span>
                </div>
            </div>
        </div>
    );
}
