
import { useEffect, useMemo, useState } from "react";
import { Command, Layers, Moon, Palette, Search, Sun } from "lucide-react";
import { useZen } from "./atlasContext";
import { THEME_PRESETS } from "./theme";

type Item = {
  id: string;
  label: string;
  hint: string;
  group: "Components" | "Themes" | "Actions";
  run: () => void;
  icon: React.ComponentType<{ className?: string }>;
};

const COMPONENT_LINKS = [
  { id: "foundations", label: "Foundations", hint: "Colors, type, spacing" },
  { id: "typography", label: "Typography", hint: "Kinetic text, type scale" },
  { id: "buttons", label: "Buttons", hint: "Variants, sizes, states" },
  { id: "inputs", label: "Inputs & Forms", hint: "Fields & validation" },
  { id: "cards", label: "Cards", hint: "Containers & patterns" },
  { id: "data-display", label: "Data Display", hint: "Tables, stats, trees" },
  { id: "navigation", label: "Navigation", hint: "Tabs, breadcrumbs, steps" },
  { id: "feedback", label: "Feedback", hint: "Alerts, dialogs, toasts" },
  { id: "surfaces", label: "Surfaces", hint: "Accordions, grids, layouts" },
  { id: "media", label: "Media", hint: "Video, images, audio" },
  { id: "data-viz", label: "Data Viz", hint: "Charts & graphs" },
  { id: "themes", label: "Theme Gallery", hint: "Presets & live preview" },
  { id: "combos", label: "Combos", hint: "Pre-built patterns" },
  { id: "lab-3d", label: "3D Lab", hint: "Interactive 3D scenes" },
];

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, applyPreset, mode, setMode } = useZen();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!paletteOpen) {
      setQuery("");
      setActive(0);
    }
  }, [paletteOpen]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    COMPONENT_LINKS.forEach((c) =>
      out.push({
        id: `c-${c.id}`,
        label: c.label,
        hint: c.hint,
        group: "Components",
        icon: Layers,
        run: () => {
          document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      })
    );
    THEME_PRESETS.forEach((t) =>
      out.push({
        id: `t-${t.id}`,
        label: `Apply theme: ${t.name}`,
        hint: t.mode === "dark" ? "Dark" : "Light",
        group: "Themes",
        icon: Palette,
        run: () => applyPreset(t.id),
      })
    );
    out.push({
      id: "a-toggle",
      label: mode === "dark" ? "Switch to light mode" : "Switch to dark mode",
      hint: "Toggle theme",
      group: "Actions",
      icon: mode === "dark" ? Sun : Moon,
      run: () => setMode(mode === "dark" ? "light" : "dark"),
    });
    return out;
  }, [applyPreset, mode, setMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => (i.label + " " + i.hint).toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  if (!paletteOpen) return null;

  const run = (i: Item) => {
    i.run();
    setPaletteOpen(false);
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setPaletteOpen(false)}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); filtered[active] && run(filtered[active]); }
              else if (e.key === "Escape") setPaletteOpen(false);
            }}
            placeholder="Search components, themes, actions…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No results.</li>
          )}
          {filtered.map((i, idx) => {
            const showHeader = i.group !== lastGroup;
            lastGroup = i.group;
            const Icon = i.icon;
            return (
              <div key={i.id}>
                {showHeader && (
                  <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{i.group}</div>
                )}
                <li
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => run(i)}
                  className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm ${idx === active ? "bg-muted text-foreground" : "text-foreground/90"}`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{i.label}</span>
                  <span className="text-xs text-muted-foreground">{i.hint}</span>
                </li>
              </div>
            );
          })}
        </ul>
        <footer className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1"><Command className="h-3 w-3" /> Press ↑↓ to navigate, ↵ to select</div>
          <div>UI Zen</div>
        </footer>
      </div>
    </div>
  );
}


