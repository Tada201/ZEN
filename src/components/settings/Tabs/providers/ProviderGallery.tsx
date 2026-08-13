import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchInput } from "@/components/settings/ui/WorkbenchInput";
import { cn } from "@/lib/utils/style";
import { PROVIDER_ICONS } from "./constants";

export interface ProviderTile {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    isLocal?: boolean;
    configured?: boolean;
    apiKeyPresent?: boolean;
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
    getModelCount: (id: string) => number;
    onProviderClick: (id: string) => void;
    onAddCustom: () => void;
    onRefresh: () => void;
    refreshing: boolean;
}

function statusLabel(status: string, modelCount: number) {
    if (status === "active") return "Connected";
    if (status === "failed") return "Connection failed";
    if (status === "configured") return modelCount > 0 ? "Configured" : "Ready to test";
    if (status === "disabled") return "Disabled";
    return "Not configured";
}

export function ProviderGallery({
    filteredCategories,
    searchQuery,
    onSearchChange,
    getProviderStatus,
    getModelCount,
    onProviderClick,
    onAddCustom,
    onRefresh,
    refreshing,
}: ProviderGalleryProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-foreground">Providers</h2>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                        Configure connections and choose models from one place.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1 sm:w-56">
                        <WorkbenchIcon name="lucide:search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <WorkbenchInput
                            value={searchQuery}
                            onChangeText={onSearchChange}
                            placeholder="Search providers"
                            className="h-9 pl-8 text-[12px]"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={refreshing}
                        title="Refresh model catalog"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                        <WorkbenchIcon name="lucide:refresh-cw" size={14} className={cn(refreshing && "animate-spin")} />
                    </button>
                    <button
                        type="button"
                        onClick={onAddCustom}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <WorkbenchIcon name="lucide:plus" size={14} />
                        Custom
                    </button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                <div className="mx-auto max-w-3xl space-y-7 pb-8">
                    {filteredCategories.map(category => (
                        <section key={category.id}>
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{category.label}</h3>
                                <span className="text-[11px] tabular-nums text-muted-foreground">{category.providers.length}</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {category.providers.map((provider, index) => {
                                    const status = getProviderStatus(provider.id);
                                    const modelCount = getModelCount(provider.id);
                                    return (
                                        <button
                                            key={provider.id}
                                            type="button"
                                            onClick={() => onProviderClick(provider.id)}
                                            className={cn(
                                                "group flex min-h-[78px] w-full items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary hover:bg-muted",
                                                index === 0 && "sm:col-start-1"
                                            )}
                                        >
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                                                {PROVIDER_ICONS[provider.id] || <WorkbenchIcon name={provider.icon || "lucide:cpu"} size={16} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-medium text-foreground">{provider.label}</span>
                                                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{provider.description || statusLabel(status, modelCount)}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                                    <span>{statusLabel(status, modelCount)}</span>
                                                    {provider.isLocal && <span className="rounded border border-border px-1.5 py-0.5">Local</span>}
                                                    {provider.apiKeyPresent && <span className="rounded border border-success/20 px-1.5 py-0.5 text-success">Key saved</span>}
                                                </span>
                                            </span>
                                            {modelCount > 0 && (
                                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                    {modelCount} model{modelCount === 1 ? "" : "s"}
                                                </span>
                                            )}
                                            <span className={cn(
                                                "h-2 w-2 shrink-0 rounded-full",
                                                status === "active" && "bg-success",
                                                status === "failed" && "bg-rose-400",
                                                status === "configured" && "bg-amber-400",
                                                status === "disabled" && "bg-muted-foreground/40",
                                                status === "none" && "bg-muted"
                                            )} />
                                            <WorkbenchIcon name="lucide:chevron-right" size={14} className="shrink-0 text-muted-foreground" />
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    {filteredCategories.length === 0 && (
                        <div className="py-16 text-center text-[12px] text-muted-foreground">No providers match “{searchQuery}”.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
