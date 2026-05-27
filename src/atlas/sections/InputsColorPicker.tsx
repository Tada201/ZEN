import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { DemoCard } from "../Section";

const SWATCH_HUES = [0, 20, 40, 60, 120, 160, 200, 240, 270, 300, 330];

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function InputsColorPicker() {
  const [hue, setHue] = useState(220);
  const [sat, setSat] = useState(80);
  const [lit, setLit] = useState(55);
  const hexColor = hslToHex(hue, sat, lit);

  return (
    <DemoCard
      label="Color picker"
      selection={{
        id: "i-color", name: "Color Picker", category: "Inputs & Forms",
        variants: ["hue-slider", "swatches", "hex-input"],
        jsx: `<Slider value={[hue]} max={360} onValueChange={([h]) => setHue(h)} />\n<div className="grid grid-cols-11 gap-1">\n  {HUES.map(h => <button style={{ background: hsl(h, 80%, 55%) }} />)}\n</div>`,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 shrink-0 rounded-md border border-border shadow-sm"
            style={{ background: `hsl(${hue}, ${sat}%, ${lit}%)` }}
          />
          <div className="flex-1 space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Hue</div>
            <div
              className="relative h-3 w-full rounded-full"
              style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
            >
              <Slider
                value={[hue]}
                min={0}
                max={360}
                step={1}
                onValueChange={([h]) => setHue(h)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-11 gap-1">
          {SWATCH_HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Color hue ${h}`}
              onClick={() => setHue(h)}
              className={cn(
                "aspect-square w-full rounded-md border-2 transition-transform hover:scale-110",
                hue === h ? "border-foreground" : "border-transparent"
              )}
              style={{ background: `hsl(${h}, 80%, 55%)` }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Saturation {sat}%</Label>
            <Slider value={[sat]} min={0} max={100} step={1} onValueChange={([s]) => setSat(s)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Lightness {lit}%</Label>
            <Slider value={[lit]} min={10} max={90} step={1} onValueChange={([l]) => setLit(l)} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5">
          <div className="h-4 w-4 rounded" style={{ background: `hsl(${hue}, ${sat}%, ${lit}%)` }} />
          <span className="flex-1 font-mono text-xs">{hexColor}</span>
          <span className="text-[10px] text-muted-foreground">hsl({hue}, {sat}%, {lit}%)</span>
        </div>
      </div>
    </DemoCard>
  );
}
