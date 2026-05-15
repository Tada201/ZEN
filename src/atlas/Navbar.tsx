
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot, Check, LayoutList, Moon, PanelRightClose, PanelRightOpen,
  Search, Settings2, Sparkles, Sun, Zap, ZapOff, FileStack,
  RotateCcw, Rows3, Square, ExternalLink
} from "lucide-react";
import { useZenTheme } from "./providers/ZenThemeProvider";
import { useUIState } from "./providers/UIStateProvider";
import { ACCENT_SWATCHES } from "./theme";

function SettingsToggle({
  label, hint, value, onChange,
}: { label: string; hint?: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="press flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted"
    >
      <span className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </span>
      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${value ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`inline-block h-3 w-3 transform rounded-full bg-card shadow transition ${value ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export function Navbar({ onToggleInspector, inspectorOpen }: { onToggleInspector: () => void; inspectorOpen: boolean }) {
  const {
    mode, setMode, accent, setAccent,
    motionEnabled, setMotionEnabled,
    pressEnabled, setPressEnabled,
    density, setDensity,
    resetPreferences,
  } = useZenTheme();
  const { setPaletteOpen, viewMode, setViewMode } = useUIState();
  const [accentMenu, setAccentMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
            <Sparkles className="h-4 w-4" />
          </span>
          <span>UI Zen</span>
        </Link>

        <button
          onClick={() => setPaletteOpen(true)}
          className="press ml-3 hidden h-9 flex-1 max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted md:flex"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search components, themes…</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>

        <Link
          to="/chat"
          className="press ml-1 hidden h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:inline-flex"
        >
          <Bot className="h-4 w-4" />
          <span>Chat</span>
        </Link>

        <div className="flex-1 md:hidden" />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPaletteOpen(true)}
            className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Motion toggle */}
          <button
            onClick={() => setMotionEnabled(!motionEnabled)}
            className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={motionEnabled ? "Disable motion" : "Enable motion"}
            title={motionEnabled ? "Motion on" : "Motion off"}
          >
            {motionEnabled ? <Zap className="h-4 w-4 text-primary" /> : <ZapOff className="h-4 w-4" />}
          </button>

          {/* Accent picker */}
          <div className="relative">
            <button
              onClick={() => setAccentMenu((v) => !v)}
              className="press inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
              aria-label="Choose accent color"
              aria-expanded={accentMenu}
            >
              <span className="h-4 w-4 rounded-full border border-border" style={{ background: `hsl(${accent})` }} />
            </button>
            {accentMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAccentMenu(false)} />
                <div
                  className="absolute right-0 top-11 z-20 w-44 rounded-lg border border-border bg-popover p-2"
                  style={{ boxShadow: "var(--shadow-md)" }}
                >
                  {ACCENT_SWATCHES.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => { setAccent(s.hsl, s.glow); setAccentMenu(false); }}
                      className="press flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <span className="h-4 w-4 rounded-full border border-border" style={{ background: `linear-gradient(135deg, hsl(${s.hsl}), hsl(${s.glow}))` }} />
                      <span className="flex-1 text-left">{s.name}</span>
                      {accent === s.hsl && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
            className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Toggle dark mode"
          >
            {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              title="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                <div
                  className="absolute right-0 top-11 z-20 w-64 rounded-lg border border-border bg-popover p-3"
                  style={{ boxShadow: "var(--shadow-md)" }}
                >
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">View mode</div>
                  <div className="flex rounded-md border border-border bg-muted p-1">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition ${
                        viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <FileStack className="h-3.5 w-3.5" /> List
                    </button>
                    <button
                      onClick={() => setViewMode("page")}
                      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition ${
                        viewMode === "page" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <LayoutList className="h-3.5 w-3.5" /> Page
                    </button>
                  </div>

                  <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Density</div>
                  <div className="flex rounded-md border border-border bg-muted p-1">
                    <button
                      onClick={() => setDensity("cozy")}
                      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition ${
                        density === "cozy" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Square className="h-3.5 w-3.5" /> Cozy
                    </button>
                    <button
                      onClick={() => setDensity("compact")}
                      className={`press flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition ${
                        density === "compact" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Rows3 className="h-3.5 w-3.5" /> Compact
                    </button>
                  </div>

                  <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effects</div>
                  <div className="space-y-0.5">
                    <SettingsToggle
                      label="Motion"
                      hint="Hover lifts, transitions, sparkles"
                      value={motionEnabled}
                      onChange={setMotionEnabled}
                    />
                    <SettingsToggle
                      label="Click press"
                      hint="Buttons shrink on press"
                      value={pressEnabled}
                      onChange={setPressEnabled}
                    />
                  </div>

                  <button
                    onClick={() => { resetPreferences(); setSettingsOpen(false); }}
                    className="press mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset preferences
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onToggleInspector}
            className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            aria-expanded={inspectorOpen}
            aria-controls="Zen-inspector"
            data-inspector-toggle
          >
            {inspectorOpen ? <PanelRightClose className="h-4 w-4" aria-hidden="true" /> : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
          </button>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="GitHub"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

