import { useState } from "react";
import { Check, Copy, Palette, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useZen } from "./atlasContext";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { ACCENT_SWATCHES, RADIUS_PRESETS, THEME_PRESETS, type RadiusPreset, type StyleMode } from "./theme";

const STYLE_OPTIONS: StyleMode[] = ["flat", "subtle", "bordered", "glass"];

export function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const { preset, applyPreset, accent, setAccent, radius, setRadius, styleMode, setStyleMode, exportCSS } = useZen();
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="press fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
          style={{ background: "var(--gradient-accent)", boxShadow: "var(--shadow-accent)" }}
          aria-label="Open theme customizer"
        >
          <Palette className="h-4 w-4" /> Customize
        </button>
      )}
      {open && (
        <aside
          className="fixed bottom-6 right-6 z-40 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card"
          style={{ boxShadow: "var(--shadow-lg)" }}
          aria-label="Theme customizer"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Customize theme</h2>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close customizer" className="press rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto px-4 py-4">
            {/* Presets */}
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Presets</h3>
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      updateSetting({ themeId: p.id });
                      applyPreset(p.id);
                    }}
                    className={`press flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition ${preset === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-border"
                      style={{ background: `linear-gradient(135deg, hsl(${p.vars["--primary"]}), hsl(${p.vars["--primary-glow"] ?? p.vars["--primary"]}))` }}
                    />
                    <span className="truncate">{p.name}</span>
                    {preset === p.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            </section>

            {/* Accent */}
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accent color</h3>
              <div className="flex flex-wrap gap-2">
                {ACCENT_SWATCHES.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setAccent(s.hsl, s.glow)}
                    aria-label={`Set accent to ${s.name}`}
                    className={`press h-8 w-8 rounded-full border-2 ${accent === s.hsl ? "border-foreground" : "border-transparent"}`}
                    style={{ background: `linear-gradient(135deg, hsl(${s.hsl}), hsl(${s.glow}))` }}
                  />
                ))}
              </div>
            </section>

            {/* Radius */}
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Radius</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(RADIUS_PRESETS) as RadiusPreset[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`press rounded-md border px-2 py-1.5 text-xs capitalize ${radius === r ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>

            {/* Style mode */}
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Style</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyleMode(s)}
                    className={`press rounded-md border px-2 py-1.5 text-xs capitalize ${styleMode === s ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <Button
              variant="outline"
              className="press w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(exportCSS());
                toast.success("CSS variables copied!");
              }}
            >
              <Copy className="h-4 w-4" /> Copy CSS variables
            </Button>
          </div>
        </aside>
      )}
    </>
  );
}


