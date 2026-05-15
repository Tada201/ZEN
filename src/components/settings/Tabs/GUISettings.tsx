import { SettingsSection } from "../SettingsSection";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Monitor, Sun, Moon, Layout, Sidebar,
  Maximize2, Minimize2, Eye, EyeOff, Palette
} from "lucide-react";

interface GUISettingsProps {
  settings: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}

const THEMES = [
  { id: "dark", label: "Dark", icon: Moon, description: "Deep dark interface" },
  { id: "light", label: "Light", icon: Sun, description: "Bright clean surface" },
  { id: "tactical", label: "Tactical", icon: Monitor, description: "Green-tinted tactical" },
  { id: "ocean", label: "Ocean Depth", icon: Monitor, description: "Deep blue tones" },
  { id: "cyberpunk", label: "Cyberpunk", icon: Monitor, description: "Neon accents" },
  { id: "mono", label: "Minimal Mono", icon: Monitor, description: "Monochrome minimal" },
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

      <SettingsSection title="Theme" icon={Palette} description="Visual theme and accent colors">
        <div className="grid grid-cols-3 gap-2 px-3 py-2">
          {THEMES.map(theme => {
            const Icon = theme.icon;
            const isActive = (settings["ui.theme"] || "dark") === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => onUpdate("ui.theme", theme.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/[0.06] hover:bg-white/[0.03] text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
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
                  "h-7 w-7 rounded-full transition-all border-2",
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

      <SettingsSection title="Layout" icon={Layout} description="Interface density and sizing">
        <SettingsRow
          label="Interface Density"
          description="Controls spacing and element sizing"
          control={
            <Select value={settings["ui.density"] || "normal"} onValueChange={v => onUpdate("ui.density", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
              </SelectContent>
            </Select>
          }
          icon={Maximize2}
        />

        <SettingsRow
          label="Sidebar Width"
          description="Width of the navigation sidebar"
          control={
            <div className="flex items-center gap-2 w-[140px]">
              <Minimize2 className="h-3 w-3 text-muted-foreground" />
              <Slider
                value={[parseInt(settings["ui.sidebar-width"] || "240")]}
                onValueChange={([v]) => onUpdate("ui.sidebar-width", String(v))}
                min={180}
                max={400}
                step={10}
                className="flex-1"
              />
              <Maximize2 className="h-3 w-3 text-muted-foreground" />
            </div>
          }
          icon={Sidebar}
        />

        <SettingsRow
          label="Border Radius"
          description="Corner rounding style for UI elements"
          control={
            <Select value={settings["ui.border-radius"] || "smooth"} onValueChange={v => onUpdate("ui.border-radius", v)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BORDER_RADII.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          icon={Layout}
        />
      </SettingsSection>

      <SettingsSection title="Interface" icon={Eye} description="Visibility and behavior preferences">
        <SettingsRow
          label="Interface Animations"
          description="Shimmer effects, pulses, and transitions"
          control={
            <Switch
              checked={settings["ui.animations"] !== "false"}
              onCheckedChange={v => onUpdate("ui.animations", String(v))}
            />
          }
          icon={Eye}
        />

        <SettingsRow
          label="Reduced Motion"
          description="Minimize animations for accessibility"
          control={
            <Switch
              checked={settings["ui.reduced-motion"] === "true"}
              onCheckedChange={v => onUpdate("ui.reduced-motion", String(v))}
            />
          }
          icon={EyeOff}
        />

        <SettingsRow
          label="Status Bar"
          description="Show the status bar at the bottom"
          control={
            <Switch
              checked={settings["ui.status-bar"] !== "false"}
              onCheckedChange={v => onUpdate("ui.status-bar", String(v))}
            />
          }
          icon={Eye}
        />

        <SettingsRow
          label="Compact Mode"
          description="Reduce padding and spacing throughout"
          control={
            <Switch
              checked={settings["ui.compact-mode"] === "true"}
              onCheckedChange={v => onUpdate("ui.compact-mode", String(v))}
            />
          }
          icon={Minimize2}
        />
      </SettingsSection>
    </div>
  );
}
