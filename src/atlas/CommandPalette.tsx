import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Command,
  MessageSquarePlus,
  Search,
  Mic,
  Settings,
  PanelLeft,
  PanelRight,
  Info,
  Sun,
  Moon,
  Bot,
} from "lucide-react";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useChatStore } from "@/lib/stores/useChatStore";
import { getVisibleSettingsFeatures } from "@/lib/features/frontendFeatures";

type ItemGroup = "Actions" | "Settings" | "Navigate";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: ItemGroup;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

export function CommandPalette() {
  const {
    isCommandPaletteOpen: open,
    setCommandPaletteOpen: setOpen,
    toggleVoiceMode,
    toggleSettings,
    setActiveSettingsTab,
    toggleSidebar,
    toggleRightPanel,
    toggleAboutModal,
    theme,
    setTheme,
  } = useUIStore();

  const { toggleSearch } = useChatStore();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = [];

    // ✅ Actions group
    out.push({
      id: "a-new-chat",
      label: "New chat",
      hint: "Start a fresh conversation",
      group: "Actions",
      icon: MessageSquarePlus,
      run: () => {
        // Reset active session to trigger new chat
        useChatStore.getState().setActiveSession(null);
      },
    });

    out.push({
      id: "a-search",
      label: "Search sessions",
      hint: "Find past conversations",
      group: "Actions",
      icon: Search,
      run: () => toggleSearch(),
    });

    out.push({
      id: "a-voice",
      label: "Toggle voice mode",
      hint: "Push-to-talk or VAD",
      group: "Actions",
      icon: Mic,
      run: () => {
        const state = useUIStore.getState();
        if (state.voiceModeOpen) {
          window.dispatchEvent(new Event('request-voice-close'));
        } else {
          state.toggleVoiceMode();
        }
      },
    });

    out.push({
      id: "a-sidebar",
      label: "Toggle sidebar",
      hint: "Show / hide session list",
      group: "Actions",
      icon: PanelLeft,
      run: () => toggleSidebar(),
    });

    out.push({
      id: "a-right-panel",
      label: "Toggle right panel",
      hint: "Show / hide tools & widgets",
      group: "Actions",
      icon: PanelRight,
      run: () => toggleRightPanel(),
    });

    out.push({
      id: "a-theme",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      hint: "Toggle appearance",
      group: "Actions",
      icon: theme === "dark" ? Sun : Moon,
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    });

    out.push({
      id: "a-about",
      label: "About Zen",
      hint: "Version & credits",
      group: "Actions",
      icon: Info,
      run: () => toggleAboutModal(),
    });

    // ⚙️ Settings group
    getVisibleSettingsFeatures().forEach((tab) => {
      if (!tab.settingsTabId) return;
      const TabIcon = tab.icon ?? Bot;
      out.push({
        id: `s-${tab.settingsTabId}`,
        label: `Settings: ${tab.label}`,
        hint: `Open ${tab.label} settings`,
        group: "Settings",
        icon: TabIcon,
        run: () => {
          setActiveSettingsTab(tab.settingsTabId);
          toggleSettings();
        },
      });
    });

    // 🧭 General settings (default)
    out.push({
      id: "s-general",
      label: "Open settings",
      hint: "All settings",
      group: "Settings",
      icon: Settings,
      run: () => toggleSettings(),
    });

    return out;
  }, [theme, toggleVoiceMode, toggleSettings, setActiveSettingsTab, toggleSidebar, toggleRightPanel, toggleAboutModal, setTheme, toggleSearch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => (i.label + " " + i.hint).toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[active]) {
          filtered[active].run();
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [filtered, active, setOpen],
  );

  const runItem = useCallback(
    (item: PaletteItem) => {
      item.run();
      setOpen(false);
    },
    [setOpen],
  );

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette Card */}
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0b] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search actions, settings…"
            className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <kbd className="hidden items-center gap-1 rounded border border-white/[0.06] bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline-flex">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul className="max-h-[50vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">No results.</li>
          )}
          {filtered.map((item, idx) => {
            const showHeader = item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showHeader && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {item.group}
                  </div>
                )}
                <li
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => runItem(item)}
                  className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    idx === active
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-xs text-zinc-600">{item.hint}</span>
                </li>
              </div>
            );
          })}
        </ul>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[10px] text-zinc-600">
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            {" "}Press ↑↓ to navigate, ↵ to select
          </div>
          <div>Zen Workbench</div>
        </footer>
      </div>
    </div>
  );
}
