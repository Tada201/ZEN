import { useState, useMemo } from "react";
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

  const filteredTabGroups = useMemo(() => {
    if (!searchQuery.trim()) return VISIBLE_TAB_GROUPS;
    const query = searchQuery.toLowerCase();
    return VISIBLE_TAB_GROUPS.map((group) => ({
      ...group,
      tabs: group.tabs.filter(
        (tab) =>
          tab.label.toLowerCase().includes(query) ||
          tab.description?.toLowerCase().includes(query)
      ),
    })).filter((group) => group.tabs.length > 0);
  }, [searchQuery]);

  return (
    <div className="w-full md:w-56 bg-background border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-col shrink-0">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2 tracking-tight text-zinc-100">
            <WorkbenchIcon name="lucide:settings-2" size={16} className="text-primary" />
            Settings
          </h2>
        </div>
        <div className="relative">
          <WorkbenchIcon
            name="lucide:search"
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60"
          />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-md pl-7 pr-2.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 pr-1 custom-scrollbar">
        {filteredTabGroups.length > 0 ? (
          filteredTabGroups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-3 py-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-400">
                  {group.label}
                </span>
              </div>
              <div className="flex md:flex-col gap-0.5 px-2">
                {group.tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onSelectTab(tab.id)}
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-colors duration-150 text-left group",
                        isActive
                          ? "bg-muted text-primary font-bold"
                          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {isActive && <div className="nav-rail-indicator" />}
                      <WorkbenchIcon name={tab.icon} size={14} className={cn("shrink-0", isActive ? "text-primary" : "opacity-40 group-hover:opacity-100")} />
                      <span className="text-[12.5px] tracking-tight truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            No settings found
          </div>
        )}
      </div>

      <div className="hidden md:block p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <WorkbenchIcon name="lucide:sparkles" size={12} className="text-primary" />
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-primary">Zen Engine</span>
        </div>
        <p className="text-[11px] text-zinc-400">v1.0 Stable Build</p>
      </div>
    </div>
  );
}
