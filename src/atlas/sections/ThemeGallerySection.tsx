import { useEffect, useRef, useState } from "react";
import { Check, Copy, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useZen } from "../atlasContext";
import { DemoCard, Section } from "../Section";
import { THEME_PRESETS } from "../theme";

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
function ratio(a: string, b: string) {
  const parse = (s: string) => s.trim().split(/\s+/).map((v) => parseFloat(v));
  const [ah, as_, al] = parse(a);
  const [bh, bs, bl] = parse(b);
  if ([ah, as_, al, bh, bs, bl].some(Number.isNaN)) return 0;
  const la = relLum(hslToRgb(ah, as_, al));
  const lb = relLum(hslToRgb(bh, bs, bl));
  const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.round(r * 10) / 10;
}
function wcag(r: number) {
  if (r >= 7) return { label: "AAA", cls: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]", pass: true };
  if (r >= 4.5) return { label: "AA", cls: "bg-primary/15 text-primary", pass: true };
  if (r >= 3) return { label: "AA Large", cls: "bg-amber-500/15 text-amber-500", pass: true };
  return { label: "Fail", cls: "bg-destructive/15 text-destructive", pass: false };
}

const PAIRS: { label: string; fg: string; bg: string; usage: string }[] = [
  { label: "Body text", fg: "--foreground", bg: "--background", usage: "Default copy on page background" },
  { label: "Muted text", fg: "--muted-foreground", bg: "--background", usage: "Hints, helper text, captions" },
  { label: "Primary action", fg: "--primary-foreground", bg: "--primary", usage: "Filled CTA button" },
  { label: "Card text", fg: "--foreground", bg: "--card", usage: "Text inside surface cards" },
];

/* ── Motion token demos ── */
const EASING_CURVES = [
  { name: "linear", value: "linear", desc: "Constant speed" },
  { name: "ease", value: "ease", desc: "Default browser easing" },
  { name: "ease-in", value: "ease-in", desc: "Slow start" },
  { name: "ease-out", value: "ease-out", desc: "Slow end (most natural)" },
  { name: "ease-in-out", value: "ease-in-out", desc: "Slow start & end" },
  { name: "spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1)", desc: "Overshoot spring" },
];

const DURATIONS = [
  { label: "instant", ms: 50 },
  { label: "fast", ms: 150 },
  { label: "normal", ms: 300 },
  { label: "slow", ms: 500 },
  { label: "slower", ms: 800 },
];

/* ── Spacing / radius token reference ── */
const RADIUS_TOKENS = [
  { name: "none", value: "0px", cls: "rounded-none" },
  { name: "sm", value: "4px", cls: "rounded-sm" },
  { name: "md", value: "8px", cls: "rounded-md" },
  { name: "lg", value: "12px", cls: "rounded-lg" },
  { name: "xl", value: "16px", cls: "rounded-xl" },
  { name: "2xl", value: "24px", cls: "rounded-2xl" },
  { name: "full", value: "9999px", cls: "rounded-full" },
];

const SPACING_TOKENS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];

export function ThemeGallerySection() {
  const { preset, applyPreset, exportCSS } = useZen();
  const [audit, setAudit] = useState<{ label: string; usage: string; fg: string; bg: string; r: number }[]>([]);

  useEffect(() => {
    const compute = () => {
      const root = getComputedStyle(document.documentElement);
      setAudit(
        PAIRS.map((p) => {
          const fg = root.getPropertyValue(p.fg);
          const bg = root.getPropertyValue(p.bg);
          return { label: p.label, usage: p.usage, fg, bg, r: ratio(fg, bg) };
        }),
      );
    };
    compute();
    const id = window.setTimeout(compute, 50);
    return () => window.clearTimeout(id);
  }, [preset]);

  /* Motion demo state */
  const [activeCurve, setActiveCurve] = useState("ease-out");
  const [activeDuration, setActiveDuration] = useState(300);
  const [motionPlaying, setMotionPlaying] = useState(false);
  const [ballPos, setBallPos] = useState(0);
  const ballTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playMotion = () => {
    if (motionPlaying) return;
    setMotionPlaying(true);
    setBallPos(1);
    if (ballTimer.current) clearTimeout(ballTimer.current);
    ballTimer.current = setTimeout(() => {
      setBallPos(0);
      setMotionPlaying(false);
    }, activeDuration + 80);
  };

  return (
    <Section id="themes" title="Theme Gallery" description="One-click presets. Every variable changes simultaneously.">

      {/* ── Presets ── */}
      <DemoCard
        label="Presets"
        selection={{
          id: "t-presets", name: "Theme Presets", category: "Themes",
          variants: THEME_PRESETS.map((t) => t.name),
          jsx: `<Button onClick={() => applyPreset("ocean-depth")}>Ocean Depth</Button>`,
        }}
        className="md:col-span-2 xl:col-span-3"
      >
        <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`press group relative overflow-hidden rounded-lg border p-3 text-left transition ${
                preset === p.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"
              }`}
            >
              <div
                className="mb-2 h-10 w-full rounded-md border border-border"
                style={{ background: `linear-gradient(135deg, hsl(${p.vars["--primary"]}), hsl(${p.vars["--primary-glow"] ?? p.vars["--primary"]}))` }}
              />
              <div className="text-xs font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{p.mode}</div>
              {preset === p.id && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </DemoCard>

      {/* ── Live Preview ── */}
      <DemoCard
        label="Live Preview"
        selection={{
          id: "t-preview", name: "Live Preview", category: "Themes",
          variants: ["dashboard stub"],
          jsx: `<div className="rounded-xl border bg-card p-4">\n  <h3>Dashboard</h3>\n  <div className="grid grid-cols-3 gap-2">\n    <StatCard />\n  </div>\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Dashboard Preview</h4>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Revenue", value: "$42,650", change: "+12.4%" },
              { label: "Users", value: "2,847", change: "+5.2%" },
              { label: "Sessions", value: "14.2k", change: "+8.1%" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className="mt-0.5 text-lg font-bold">{s.value}</div>
                <div className="text-[10px] text-[hsl(var(--success))]">{s.change}</div>
              </div>
            ))}
          </div>
          <div className="h-20 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Activity</div>
            <svg viewBox="0 0 200 40" className="h-full w-full">
              <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points="0,30 20,25 40,28 60,18 80,22 100,12 120,15 140,8 160,10 180,5 200,2" />
              <polyline fill="hsl(var(--primary) / 0.1)" stroke="none" points="0,30 20,25 40,28 60,18 80,22 100,12 120,15 140,8 160,10 180,5 200,2 200,40 0,40" />
            </svg>
          </div>
        </div>
      </DemoCard>

      {/* ── A11y audit ── */}
      <DemoCard
        label="A11y audit"
        selection={{
          id: "t-a11y", name: "Contrast Audit", category: "Themes",
          variants: ["WCAG AA", "WCAG AAA"],
          jsx: `// Live ratios using getComputedStyle on --foreground / --background etc.\nconst pairs = [\n  { fg: '--foreground', bg: '--background' },\n  { fg: '--primary-foreground', bg: '--primary' },\n];`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Contrast audit</h4>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              {audit.every((p) => p.r >= 4.5) ? (
                <><ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> All AA pass</>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Review pairs</>
              )}
            </span>
          </div>
          <ul className="space-y-1.5">
            {audit.map((p) => {
              const tag = wcag(p.r);
              return (
                <li key={p.label} className="flex items-center gap-2 rounded-md border border-border/60 p-1.5">
                  <div
                    className="flex h-9 w-12 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold"
                    style={{ background: `hsl(${p.bg})`, color: `hsl(${p.fg})` }}
                  >
                    Aa
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{p.label}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{p.usage}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold tabular-nums">{p.r}:1</div>
                    <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${tag.cls}`}>{tag.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            WCAG 2.1: AA needs 4.5:1 (3:1 for large text). AAA needs 7:1.
          </p>
        </div>
      </DemoCard>

      {/* ── Motion tokens ── */}
      <DemoCard
        label="Motion tokens"
        selection={{
          id: "t-motion", name: "Motion & Easing Tokens", category: "Themes",
          variants: ["easing-curves", "durations", "interactive-demo"],
          jsx: `// CSS custom property approach\n--ease-out: cubic-bezier(0, 0, 0.2, 1);\n--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);\n--duration-fast: 150ms;\n--duration-normal: 300ms;`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          {/* Easing curve picker */}
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Easing curves</div>
            <div className="grid grid-cols-3 gap-1.5">
              {EASING_CURVES.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setActiveCurve(c.value)}
                  className={`press rounded-lg border p-2 text-left transition ${
                    activeCurve === c.value ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="text-[11px] font-semibold">{c.name}</div>
                  <div className="text-[9px] text-muted-foreground">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration picker */}
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Duration</div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.ms}
                  onClick={() => setActiveDuration(d.ms)}
                  className={`press rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                    activeDuration === d.ms ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {d.label} · {d.ms}ms
                </button>
              ))}
            </div>
          </div>

          {/* Live demo */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-medium text-muted-foreground">
                Preview: <span className="text-foreground font-semibold">{activeCurve}</span> · <span className="text-foreground font-semibold">{activeDuration}ms</span>
              </div>
              <button
                onClick={playMotion}
                disabled={motionPlaying}
                className="press rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {motionPlaying ? "Playing…" : "▶ Play"}
              </button>
            </div>
            <div className="relative h-8 rounded-md bg-muted overflow-hidden">
              <div
                className="absolute top-1 h-6 w-6 rounded-full bg-primary shadow-md"
                style={{
                  left: ballPos === 1 ? "calc(100% - 28px)" : "4px",
                  transition: `left ${activeDuration}ms ${activeCurve}`,
                }}
              />
            </div>
          </div>
        </div>
      </DemoCard>

      {/* ── Radius & Spacing tokens ── */}
      <DemoCard
        label="Token reference"
        selection={{
          id: "t-tokens", name: "Radius & Spacing Tokens", category: "Themes",
          variants: ["radius", "spacing-scale"],
          jsx: `<div className="rounded-xl border bg-card p-4" />\n<div className="w-16 h-4 bg-primary" />`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Border radius</div>
            <div className="flex flex-wrap items-center gap-2">
              {RADIUS_TOKENS.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-1">
                  <div className={`h-8 w-8 border-2 border-primary bg-primary/15 ${r.cls}`} />
                  <div className="text-[9px] text-muted-foreground">{r.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Spacing scale (Tailwind)</div>
            <div className="space-y-1.5">
              {SPACING_TOKENS.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="w-6 text-right text-[10px] font-mono text-muted-foreground">{t}</span>
                  <div className="h-3 bg-primary/70 rounded-sm" style={{ width: `${t * 4}px` }} />
                  <span className="text-[10px] text-muted-foreground">{t * 4}px</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DemoCard>

      {/* ── Export ── */}
      <DemoCard
        label="Export"
        selection={{
          id: "t-export", name: "Export CSS", category: "Themes",
          variants: ["copy-to-clipboard"],
          jsx: `navigator.clipboard.writeText(exportCSS());`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <p className="text-sm text-muted-foreground">Copy the current theme as a CSS snippet to use in your own project.</p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
            <code>{exportCSS()}</code>
          </pre>
          <Button
            variant="outline"
            size="sm"
            className="press w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(exportCSS());
              toast.success("CSS variables copied!");
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy CSS
          </Button>
        </div>
      </DemoCard>
    </Section>
  );
}


