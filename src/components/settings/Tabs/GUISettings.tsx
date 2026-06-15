import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";
import { normalizeThemeId, THEME_PRESETS } from "@/atlas/theme";

interface GUISettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

export function GUISettings({ settings, onUpdate }: GUISettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Appearance</h3>
        <p className="text-[13px] text-muted-foreground">Customize the look and feel of the interface.</p>
      </div>

      <SettingsSection title="Interface theme" icon="lucide:palette" description="Change the atmosphere across the complete application">
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          {THEME_PRESETS.map(theme => {
            const isActive = normalizeThemeId(settings["ui.theme"]) === theme.id;
            const background = theme.vars["--background"];
            const card = theme.vars["--card"];
            const primary = theme.vars["--primary"];
            const foreground = theme.vars["--foreground"];
            return (
              <button
                type="button"
                key={theme.id}
                onClick={() => onUpdate("ui.theme", theme.id)}
                className={cn(
                  "overflow-hidden rounded-md border text-left transition-colors",
                  isActive
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-border-strong"
                )}
              >
                <div
                  className="relative h-20 overflow-hidden border-b"
                  style={{ background: `hsl(${background})`, borderColor: `hsl(${theme.vars["--border"]})` }}
                >
                  <div className="absolute inset-x-3 top-3 flex h-3 gap-1">
                    <span className="w-8 border" style={{ borderColor: `hsl(${primary})` }} />
                    <span className="flex-1 border" style={{ borderColor: `hsl(${theme.vars["--border"]})`, background: `hsl(${card})` }} />
                  </div>
                  <div className="absolute inset-x-3 bottom-3 grid grid-cols-[1fr_2fr] gap-2">
                    <span className="h-8 border" style={{ borderColor: `hsl(${theme.vars["--border"]})`, background: `hsl(${card})` }} />
                    <span className="h-8 border p-2" style={{ borderColor: `hsl(${primary})`, background: `hsl(${card})` }}>
                      <span className="block h-0.5 w-2/3" style={{ background: `hsl(${foreground})` }} />
                      <span className="mt-1.5 block h-0.5 w-1/3" style={{ background: `hsl(${primary})` }} />
                    </span>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <span className="block text-sm font-medium text-foreground">{theme.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{theme.description}</span>
                  </div>
                  {isActive && <WorkbenchIcon name="lucide:check" size={15} className="mt-0.5 shrink-0 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>

      </SettingsSection>

      <SettingsSection title="Workspace Wallpaper" icon="lucide:palette" description="Custom wallpaper aesthetics settings">
        <SettingsRow
          label="Custom Wallpaper URL"
          description="Remote HTTP URL or local filesystem path"
          control={
            <WorkbenchInput
              type="text"
              placeholder="e.g., https://example.com/wallpaper.jpg"
              value={settings["ui.background-image"] || ""}
              onChange={e => onUpdate("ui.background-image", e.target.value)}
              className="h-9 w-full min-w-0 px-3 text-xs sm:w-[240px]"
            />
          }
          icon="lucide:palette"
        />

        <SettingsRow
          label="Wallpaper Opacity"
          description="Adjust visibility from translucent to vivid"
          control={
            <div className="flex w-full items-center gap-2 sm:w-[200px]">
              <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
                {Math.round(parseFloat(settings["ui.background-opacity"] || "0.15") * 100)}%
              </span>
              <WorkbenchSlider
                value={[parseFloat(settings["ui.background-opacity"] || "0.15")]}
                onValueChange={([v]) => onUpdate("ui.background-opacity", String(v))}
                min={0}
                max={1}
                step={0.01}
                className="flex-1"
              />
            </div>
          }
          icon="lucide:palette"
        />

        <SettingsRow
          label="Wallpaper Blur"
          description="Soften details to maximize text contrast"
          control={
            <div className="flex w-full items-center gap-2 sm:w-[200px]">
              <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
                {parseInt(settings["ui.background-blur"] || "0")}px
              </span>
              <WorkbenchSlider
                value={[parseInt(settings["ui.background-blur"] || "0")]}
                onValueChange={([v]) => onUpdate("ui.background-blur", String(v))}
                min={0}
                max={40}
                step={1}
                className="flex-1"
              />
            </div>
          }
          icon="lucide:palette"
        />
      </SettingsSection>

    </div>
  );
}
