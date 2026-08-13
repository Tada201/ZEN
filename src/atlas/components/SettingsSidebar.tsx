import { useMemo, useState } from "react";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";
import { VISIBLE_TAB_GROUPS, type TabId } from "./settingsNavigation";

export function SettingsSidebar({
  activeTab,
  onSelectTab,
}: {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return VISIBLE_TAB_GROUPS;
    const terms = query.split(/\s+/).filter(Boolean);

    return VISIBLE_TAB_GROUPS.map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => {
        const searchable = [tab.label, tab.description, group.label, ...(tab.keywords ?? [])]
          .map((value) => value.toLowerCase());
        return terms.every((term) => searchable.some((value) => value.includes(term)));
      }),
    })).filter((group) => group.tabs.length > 0);
  }, [searchQuery]);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card md:w-[248px] md:border-b-0 md:border-r">
      <div className="border-b border-border px-4 pb-3 pt-[4.6rem] md:px-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Settings</p>
        <label className="relative block" htmlFor="settings-search">
          <WorkbenchIcon name="lucide:search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="settings-search"
            type="search"
            placeholder="Search settings"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </label>
      </div>

      <div className="border-b border-border p-4 md:hidden">
        <label htmlFor="mobile-settings-page" className="mb-2 block text-xs font-medium text-foreground">Settings section</label>
        <select
          id="mobile-settings-page"
          value={activeTab}
          onChange={(event) => onSelectTab(event.target.value as TabId)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          {filteredGroups.flatMap((group) => group.tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>{group.label} · {tab.label}</option>
          )))}
        </select>
      </div>

      <nav aria-label="Settings sections" className="hidden flex-1 overflow-y-auto px-3 py-3 md:block">
        {filteredGroups.length > 0 ? filteredGroups.map((group) => (
          <section key={group.label} className="mb-4 last:mb-0">
            <div className="mb-2 flex items-center gap-2 px-1.5">
              <h2 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</h2>
              <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              {group.tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                      isActive ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", isActive ? "bg-primary text-primary-foreground" : "bg-muted group-hover:bg-background")}>
                      <WorkbenchIcon name={tab.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">{tab.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{tab.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm font-medium text-foreground">No settings found</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a broader search term.</p>
          </div>
        )}
      </nav>

      <div className="hidden border-t border-border px-5 py-4 md:block">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          Preferences are stored on this device
        </div>
      </div>
    </aside>
  );
}
