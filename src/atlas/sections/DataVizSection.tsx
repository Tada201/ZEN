
/*
 * [DEMO-ONLY] DataVizSection - Chart showcase
 * High GPU impact: 4 simultaneous Recharts SVG charts
 * Only renders in design system explorer, NOT in main chat flow
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Bar, AreaChart, Area, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { DemoCard, Section } from "../Section";

const BAR_DATA = [
  { name: "Jan", revenue: 4200, cost: 2100 },
  { name: "Feb", revenue: 5100, cost: 2400 },
  { name: "Mar", revenue: 4800, cost: 2200 },
  { name: "Apr", revenue: 6200, cost: 2800 },
  { name: "May", revenue: 7100, cost: 3100 },
  { name: "Jun", revenue: 6800, cost: 2900 },
];

const LINE_DATA = [
  { name: "Mon", users: 240, sessions: 120 },
  { name: "Tue", users: 300, sessions: 180 },
  { name: "Wed", users: 280, sessions: 150 },
  { name: "Thu", users: 350, sessions: 210 },
  { name: "Fri", users: 420, sessions: 280 },
  { name: "Sat", users: 380, sessions: 240 },
  { name: "Sun", users: 290, sessions: 160 },
];

const PIE_DATA = [
  { name: "Desktop", value: 58 },
  { name: "Mobile", value: 32 },
  { name: "Tablet", value: 10 },
];

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--primary-glow))", "hsl(var(--muted-foreground))"];

function VisibilityWrapper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref}>{visible && children}</div>;
}

export function DataVizSection() {
  const memoizedBarData = useMemo(() => BAR_DATA, []);
  const memoizedLineData = useMemo(() => LINE_DATA, []);
  const memoizedPieData = useMemo(() => PIE_DATA, []);

  return (
    <Section id="data-viz" title="Data Visualization" description="Charts, graphs, and interactive data displays.">
      <DemoCard
        label="Bar Chart"
        selection={{
          id: "dv-bar", name: "Bar Chart", category: "Data Viz",
          variants: ["grouped", "stacked"],
          jsx: '<BarChart data={data}><Bar dataKey="revenue" /></BarChart>',
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="h-56">
          <VisibilityWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memoizedBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </VisibilityWrapper>
        </div>
      </DemoCard>

      <DemoCard
        label="Area Chart"
        selection={{
          id: "dv-area", name: "Area Chart", category: "Data Viz",
          variants: ["gradient-fill", "multi-series"],
          jsx: '<AreaChart data={data}><Area dataKey="users" /></AreaChart>',
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="h-56">
          <VisibilityWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={memoizedLineData}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
              <Area type="monotone" dataKey="users" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={2} />
              <Line type="monotone" dataKey="sessions" stroke="hsl(var(--primary-glow))" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </VisibilityWrapper>
        </div>
      </DemoCard>

      <DemoCard
        label="Pie Chart"
        selection={{
          id: "dv-pie", name: "Pie Chart", category: "Data Viz",
          variants: ["donut", "segmented"],
          jsx: '<PieChart><Pie data={data} innerRadius={40} /></PieChart>',
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="h-56">
          <VisibilityWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={memoizedPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value" stroke="none">
                  {memoizedPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </VisibilityWrapper>
        </div>
      </DemoCard>

      <DemoCard
        label="Radial gauges"
        selection={{
          id: "dv-radial", name: "Radial Gauges", category: "Data Viz",
          variants: ["progress", "goal", "score"],
          jsx: '<RadialBarChart><RadialBar dataKey="value" /></RadialBarChart>',
        }}
      >
        <VisibilityWrapper>
          <RadialGauges />
        </VisibilityWrapper>
      </DemoCard>

      <DemoCard
        label="Activity heatmap"
        selection={{
          id: "dv-heatmap", name: "Calendar Heatmap", category: "Data Viz",
          variants: ["weeks × days", "selectable"],
          jsx: `<div className="grid grid-cols-${"{weeks}"} gap-1">\n  {days.map(d => <span style={{opacity}} />)}\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <Heatmap />
      </DemoCard>

      <DemoCard
        label="Sparklines"
        selection={{
          id: "dv-spark", name: "Sparkline Grid", category: "Data Viz",
          variants: ["mini-charts"],
          jsx: '<Sparkline data={trend} width={120} height={30} />',
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          {[
            { label: "Revenue", trend: [30, 45, 35, 50, 48, 60, 55], color: "hsl(var(--primary))" },
            { label: "Users", trend: [20, 25, 40, 35, 45, 42, 50], color: "hsl(var(--success))" },
            { label: "Churn", trend: [5, 8, 6, 4, 3, 5, 4], color: "hsl(var(--destructive))" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-20 text-xs text-muted-foreground">{s.label}</div>
              <svg viewBox="0 0 120 30" className="h-8 flex-1">
                <polyline fill="none" stroke={s.color} strokeWidth="2"
                  points={s.trend.map((v, i) => `${(i / (s.trend.length - 1)) * 120},${30 - v}`).join(" ")} />
              </svg>
              <div className="w-10 text-right text-xs font-medium">{s.trend[s.trend.length - 1]}</div>
            </div>
          ))}
        </div>
      </DemoCard>
    </Section>
  );
}

export default DataVizSection;

/* ──────────────── Radial Gauges ──────────────── */

function RadialGauges() {
  const gauges = [
    { label: "Storage used", value: 72, hint: "144 GB / 200 GB", color: "hsl(var(--primary))" },
    { label: "Goal complete", value: 48, hint: "$24k / $50k MRR", color: "hsl(var(--success))" },
    { label: "Performance", value: 91, hint: "Lighthouse score", color: "hsl(var(--warning))" },
  ];
  return (
    <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-3 gap-2">
      {gauges.map((g) => (
        <div key={g.label} className="relative flex flex-col items-center rounded-lg border border-border bg-card p-2">
          <div className="relative h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: g.label, value: g.value, fill: g.color }]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted))" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-bold tabular-nums">{g.value}%</span>
            </div>
          </div>
          <div className="mt-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{g.label}</div>
          <div className="text-[10px] text-muted-foreground/70 tabular-nums">{g.hint}</div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────── Calendar heatmap ──────────────── */

const HEAT_WEEKS = 14;
const HEAT_DAYS = 7;

function Heatmap() {
  const cells = useMemo(() => {
    const out: { date: string; count: number }[] = [];
    const today = new Date();
    const total = HEAT_WEEKS * HEAT_DAYS;
    for (let i = total - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dow = d.getDay();
      const seed = Math.sin(i * 12.9898) * 43758.5453;
      const rand = seed - Math.floor(seed);
      const weekend = dow === 0 || dow === 6;
      const base = weekend ? rand * 3 : rand * 7;
      out.push({ date: d.toISOString().slice(0, 10), count: Math.max(0, Math.round(base)) });
    }
    return out;
  }, []);
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);

  const max = Math.max(...cells.map((c) => c.count));
  const intensity = (c: number) => {
    if (c === 0) return "bg-muted/50";
    const lvl = Math.ceil((c / max) * 4);
    return ["bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"][Math.min(3, lvl - 1)];
  };
  const total = cells.reduce((s, c) => s + c.count, 0);
  const streak = (() => {
    let s = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].count > 0) s++;
      else break;
    }
    return s;
  })();

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold">
            <span className="tabular-nums">{total.toLocaleString()}</span>
            <span className="ml-1 text-xs font-normal text-muted-foreground">contributions in the last {HEAT_WEEKS} weeks</span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          Current streak: <span className="font-semibold text-foreground">{streak}d</span>
        </div>
      </div>
      <div className="relative">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${HEAT_WEEKS}, minmax(0, 1fr))`, gridAutoFlow: "column", gridTemplateRows: `repeat(${HEAT_DAYS}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <button
              key={c.date}
              type="button"
              aria-label={`${c.count} contributions on ${c.date}`}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              className={`aspect-square w-full rounded-sm transition ${intensity(c.count)} hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background`}
            />
          ))}
        </div>
        {hover && (
          <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background shadow">
            <span className="tabular-nums">{hover.count}</span> on {hover.date}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        Less
        {["bg-muted/50", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"].map((cls, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
        ))}
        More
      </div>
    </div>
  );
}
