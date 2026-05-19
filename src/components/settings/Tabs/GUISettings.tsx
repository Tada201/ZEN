import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { WorkbenchSwitch } from "../ui/WorkbenchSwitch";
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
import { WorkbenchSlider } from "../ui/WorkbenchSlider";
import { WorkbenchInput } from "../ui/WorkbenchInput";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { cn } from "@/lib/utils";

interface GUISettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

const THEMES = [
  { id: "dark", label: "Dark", icon: "lucide:moon", description: "Deep dark interface" },
  { id: "light", label: "Light", icon: "lucide:sun", description: "Bright clean surface" },
  { id: "tactical", label: "Tactical", icon: "lucide:monitor", description: "Green-tinted tactical" },
  { id: "ocean", label: "Ocean Depth", icon: "lucide:monitor", description: "Deep blue tones" },
  { id: "cyberpunk", label: "Cyberpunk", icon: "lucide:monitor", description: "Neon accents" },
  { id: "mono", label: "Minimal Mono", icon: "lucide:monitor", description: "Monochrome minimal" },
];

const ACCENTS = [
  { id: "violet", label: "Violet", class: "bg-violet-500" },
  { id: "blue", label: "Blue", class: "bg-blue-500" },
  { id: "emerald", label: "Emerald", class: "bg-emerald-500" },
  { id: "amber", label: "Amber", class: "bg-amber-500" },
  { id: "rose", label: "Rose", class: "bg-rose-500" },
  { id: "cyan", label: "Cyan", class: "bg-cyan-500" },
];

const BORDER_RADII = [
  { id: "sharp", label: "Sharp", value: "0px" },
  { id: "smooth", label: "Smooth", value: "8px" },
  { id: "round", label: "Round", value: "16px" },
  { id: "pill", label: "Pill", value: "9999px" },
];

export function GUISettings({ settings, onUpdate }: GUISettingsProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="text-lg font-bold tracking-tight text-foreground">Appearance</h3>
        <p className="text-[13px] text-muted-foreground">Customize the look and feel of the interface.</p>
      </div>

      <SettingsSection title="Theme" icon="lucide:palette" description="Visual theme and accent colors">
        <div className="grid grid-cols-3 gap-2 px-3 py-2">
          {THEMES.map(theme => {
            const isActive = (settings["ui.theme"] || "dark") === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => onUpdate("ui.theme", theme.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all cursor-pointer",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/[0.06] hover:bg-white/[0.03] text-muted-foreground hover:text-foreground"
                )}
              >
                <WorkbenchIcon name={theme.icon} size={16} />
                <span className="text-[10px] font-medium">{theme.label}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2">
          <label className="text-[11px] font-medium text-muted-foreground mb-2 block">Accent Color</label>
          <div className="flex gap-2">
            {ACCENTS.map(accent => (
              <button
                key={accent.id}
                onClick={() => onUpdate("ui.accent", accent.id)}
                className={cn(
                  "h-7 w-7 rounded-full transition-all border-2 cursor-pointer",
                  accent.class,
                  (settings["ui.accent"] || "violet") === accent.id
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-110"
                )}
                aria-label={accent.label}
              />
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Layout" icon="lucide:layout" description="Interface density and sizing">
        <SettingsRow
          label="Interface Density"
          description="Controls spacing and element sizing"
          control={
            <WorkbenchSelect
              value={settings["ui.density"] || "normal"}
              onValueChange={v => onUpdate("ui.density", v)}
              options={[
                { value: "compact", label: "Compact" },
                { value: "normal", label: "Normal" },
                { value: "comfortable", label: "Comfortable" },
              ]}
              width={140}
            />
          }
          icon="lucide:maximize-2"
        />

        <SettingsRow
          label="Sidebar Width"
          description="Width of the navigation sidebar"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <WorkbenchIcon name="lucide:minimize-2" className="text-muted-foreground shrink-0" size={12} />
              <WorkbenchSlider
                value={[parseInt(settings["ui.sidebar-width"] || "240")]}
                onValueChange={([v]) => onUpdate("ui.sidebar-width", String(v))}
                min={180}
                max={400}
                step={10}
                className="flex-1"
              />
              <WorkbenchIcon name="lucide:maximize-2" className="text-muted-foreground shrink-0" size={12} />
            </div>
          }
          icon="lucide:sidebar"
        />

        <SettingsRow
          label="Border Radius"
          description="Corner rounding style for UI elements"
          control={
            <WorkbenchSelect
              value={settings["ui.border-radius"] || "smooth"}
              onValueChange={v => onUpdate("ui.border-radius", v)}
              options={BORDER_RADII.map(r => ({ value: r.id, label: r.label }))}
              width={140}
            />
          }
          icon="lucide:layout"
        />
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
              className="w-[180px] h-8 px-2 text-xs bg-black/40 border border-white/10 rounded-lg text-foreground focus:outline-none focus:border-primary/40 transition-all font-mono"
            />
          }
          icon="lucide:palette"
        />

        <SettingsRow
          label="Wallpaper Opacity"
          description="Adjust visibility from translucent to vivid"
          control={
            <div className="flex items-center gap-2 w-[180px]">
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
            <div className="flex items-center gap-2 w-[180px]">
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

      <SettingsSection title="Interface" icon="lucide:eye" description="Visibility and behavior preferences">
        <SettingsRow
          label="Interface Animations"
          description="Shimmer effects, pulses, and transitions"
          control={
            <WorkbenchSwitch
              checked={settings["ui.animations"] !== "false"}
              onCheckedChange={v => onUpdate("ui.animations", String(v))}
            />
          }
          icon="lucide:eye"
        />

        <SettingsRow
          label="Reduced Motion"
          description="Minimize animations for accessibility"
          control={
            <WorkbenchSwitch
              checked={settings["ui.reduced-motion"] === "true"}
              onCheckedChange={v => onUpdate("ui.reduced-motion", String(v))}
            />
          }
          icon="lucide:eye-off"
        />

        <SettingsRow
          label="Status Bar"
          description="Show the status bar at the bottom"
          control={
            <WorkbenchSwitch
              checked={settings["ui.status-bar"] !== "false"}
              onCheckedChange={v => onUpdate("ui.status-bar", String(v))}
            />
          }
          icon="lucide:eye"
        />

        <SettingsRow
          label="Compact Mode"
          description="Reduce padding and spacing throughout"
          control={
            <WorkbenchSwitch
              checked={settings["ui.compact-mode"] === "true"}
              onCheckedChange={v => onUpdate("ui.compact-mode", String(v))}
            />
          }
          icon="lucide:minimize-2"
        />
      </SettingsSection>
    </div>
  );
}
