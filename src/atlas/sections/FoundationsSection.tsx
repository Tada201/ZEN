import { Check } from "lucide-react";
import { toast } from "sonner";
import { DemoCard, Section } from "../Section";

const PALETTE = [
  { name: "Slate", hsl: "215 28% 17%" },
  { name: "Violet", hsl: "262 83% 58%" },
  { name: "Indigo", hsl: "239 84% 60%" },
  { name: "Sky", hsl: "199 89% 48%" },
  { name: "Emerald", hsl: "160 84% 39%" },
  { name: "Amber", hsl: "32 95% 50%" },
  { name: "Rose", hsl: "346 77% 50%" },
  { name: "Zinc", hsl: "240 4% 46%" },
];

// WCAG relative luminance + contrast ratio
function hslToRgb(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}
function relLum([r, g, b]: number[]) {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(hsl: string, bgRgb: number[]) {
  const [h, s, l] = hsl.split(" ").map((v) => parseFloat(v));
  const fg = relLum(hslToRgb(h, s, l));
  const bg = relLum(bgRgb);
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  return Math.round(ratio * 10) / 10;
}
function ratingFor(r: number) {
  if (r >= 7) return { label: "AAA", cls: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" };
  if (r >= 4.5) return { label: "AA", cls: "bg-primary/15 text-primary" };
  if (r >= 3) return { label: "AA Lg", cls: "bg-amber-500/15 text-amber-500" };
  return { label: "Fail", cls: "bg-destructive/15 text-destructive" };
}

const TYPE_SCALE = [
  { label: "Display", cls: "text-6xl font-bold tracking-tight", text: "Build with clarity." },
  { label: "Heading 1", cls: "text-4xl font-semibold tracking-tight", text: "Designing systems" },
  { label: "Heading 2", cls: "text-2xl font-semibold", text: "A modern approach" },
  { label: "Body", cls: "text-base", text: "Inter is a versatile UI typeface optimized for screens." },
  { label: "Small", cls: "text-sm text-muted-foreground", text: "Use for captions and meta." },
  { label: "Code", cls: "text-sm font-mono", text: "const Zen = createZen()" },
];

const SPACE = [4, 8, 12, 16, 24, 32, 48];
const RADII = [
  { label: "sm", v: "6px" },
  { label: "md", v: "10px" },
  { label: "lg", v: "16px" },
  { label: "full", v: "999px" },
];

export function FoundationsSection() {
  return (
    <Section id="foundations" title="Foundations" description="The visual primitives every component is built from.">
      <DemoCard
        label="Palette"
        selection={{
          id: "f-palette",
          name: "Color Palette",
          category: "Foundations",
          variants: PALETTE.map((p) => p.name),
          jsx: `<div className="grid grid-cols-4 gap-2">\n  {palette.map(c => <Swatch key={c.name} hsl={c.hsl} />)}\n</div>`,
        }}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" onClick={(e) => e.stopPropagation()}>
          {PALETTE.map((c) => {
            const onWhite = contrast(c.hsl, [1, 1, 1]);
            const onBlack = contrast(c.hsl, [0, 0, 0]);
            const best = onWhite >= onBlack ? onWhite : onBlack;
            const r = ratingFor(best);
            return (
              <button
                key={c.name}
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(`hsl(${c.hsl})`);
                  toast.success(`Copied hsl(${c.hsl})`);
                }}
                className="press group space-y-1.5 rounded-lg p-1 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Copy ${c.name} as hsl(${c.hsl}). Best contrast ${best} to 1, ${r.label}.`}
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border" style={{ background: `hsl(${c.hsl})` }}>
                  <span className={`absolute right-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${r.cls}`}>
                    {r.label} · {best}
                  </span>
                  <Check className="absolute left-1.5 bottom-1.5 h-3 w-3 text-white opacity-0 transition-opacity group-active:opacity-100" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium">{c.name}</div>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">hsl({c.hsl})</div>
              </button>
            );
          })}
        </div>
      </DemoCard>

      <DemoCard
        label="Type"
        selection={{
          id: "f-type",
          name: "Type Scale",
          category: "Foundations",
          variants: TYPE_SCALE.map((t) => t.label),
          jsx: `<h1 className="text-6xl font-bold tracking-tight">Build with clarity.</h1>`,
        }}
      >
        <div className="space-y-4">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="flex items-baseline gap-4">
              <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</span>
              <span className={t.cls}>{t.text}</span>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Spacing"
        selection={{
          id: "f-space",
          name: "Spacing Scale",
          category: "Foundations",
          variants: SPACE.map((n) => `${n}px`),
          jsx: `<div className="flex items-end gap-2">\n  {[4,8,12,16,24,32,48].map(n => <Bar size={n} />)}\n</div>`,
        }}
      >
        <div className="flex items-end gap-2">
          {SPACE.map((n) => (
            <div key={n} className="flex flex-col items-center gap-2">
              <div className="rounded-md bg-primary/15 ring-1 ring-primary/30" style={{ width: 28, height: n * 1.5 }} />
              <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Radius"
        selection={{
          id: "f-radius",
          name: "Border Radius",
          category: "Foundations",
          variants: RADII.map((r) => r.label),
          jsx: `<div className="rounded-lg border bg-card p-4">Card</div>`,
        }}
      >
        <div className="grid grid-cols-4 gap-3">
          {RADII.map((r) => (
            <div key={r.label} className="space-y-2 text-center">
              <div className="h-16 w-full border border-border bg-muted" style={{ borderRadius: r.v }} />
              <div className="text-xs font-medium">{r.label}</div>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Elevation"
        selection={{
          id: "f-shadow",
          name: "Shadows & Depth",
          category: "Foundations",
          variants: ["xs", "sm", "md", "lg", "accent"],
          jsx: `<div className="rounded-lg bg-card" style={{ boxShadow: "var(--shadow-md)" }} />`,
        }}
      >
        <div className="grid grid-cols-5 gap-3">
          {["xs", "sm", "md", "lg", "accent"].map((s) => (
            <div key={s} className="space-y-2 text-center">
              <div className="h-16 w-full rounded-lg border border-border bg-card" style={{ boxShadow: `var(--shadow-${s})` }} />
              <div className="font-mono text-[10px] text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Iconography"
        selection={{
          id: "f-icons",
          name: "Icon System",
          category: "Foundations",
          variants: ["16px", "20px", "24px"],
          jsx: `import { Sparkles } from "lucide-react"\n<Sparkles className="h-5 w-5" />`,
        }}
      >
        <div className="flex items-center justify-around">
          {[16, 20, 24, 32].map((s) => (
            <svg key={s} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 3v18M3 12h18" />
            </svg>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Lucide icons, sized by class.</p>
      </DemoCard>
    </Section>
  );
}

