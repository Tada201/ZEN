import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, ChevronLeft, ArrowUpDown, MoreHorizontal,
  Folder, FileText, Inbox, Plus, ArrowUp, ArrowDown, MessageSquare, Reply, Heart,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DemoCard, Section } from "../Section";

const TABLE_DATA = [
  { name: "Sarah Chen", role: "Design Lead", status: "Active", revenue: "$12,450" },
  { name: "Marcus Johnson", role: "Engineer", status: "Away", revenue: "$8,320" },
  { name: "Aiko Tanaka", role: "Product", status: "Active", revenue: "$15,100" },
  { name: "Elena Rossi", role: "Marketing", status: "Offline", revenue: "$6,780" },
];

const METRICS = [
  { label: "Total Revenue", value: "$42,650", change: "+12.4%", positive: true },
  { label: "Active Users", value: "2,847", change: "+5.2%", positive: true },
  { label: "Churn Rate", value: "2.1%", change: "-0.4%", positive: true },
  { label: "Avg. Session", value: "4m 32s", change: "-1.2%", positive: false },
];

type TreeItem = { name: string; type: string; children?: TreeItem[] };

const TREE_ITEMS: TreeItem[] = [
  {
    name: "src",
    type: "folder",
    children: [
      { name: "components", type: "folder", children: [{ name: "ui", type: "folder", children: [{ name: "button.tsx", type: "file" }, { name: "card.tsx", type: "file" }] }] },
      { name: "pages", type: "folder", children: [{ name: "index.tsx", type: "file" }] },
      { name: "lib", type: "folder", children: [{ name: "utils.ts", type: "file" }] },
    ],
  },
];

function TreeNode({ item, depth = 0 }: { item: TreeItem; depth?: number }) {
  const [open, setOpen] = useState(true);
  const isFolder = item.type === "folder";
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button
        onClick={(e) => { e.stopPropagation(); if (isFolder) setOpen(!open); }}
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-muted w-full text-left"
      >
        {isFolder && (open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
        {!isFolder && <span className="w-3.5" />}
        {isFolder ? <Folder className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
        <span>{item.name}</span>
      </button>
      {isFolder && open && item.children?.map((child) => <TreeNode key={child.name} item={child} depth={depth + 1} />)}
    </div>
  );
}

function PaginationDemo() {
  const [page, setPage] = useState(3);
  const total = 12;
  const pages: (number | "…")[] = (() => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set<number>([1, 2, total - 1, total, page - 1, page, page + 1]);
    const sorted = Array.from(set).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push("…");
      out.push(p);
    });
    return out;
  })();
  return (
    <nav aria-label="Pagination" onClick={(e) => e.stopPropagation()} className="flex items-center justify-between gap-2">
      <button
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page === 1}
        className="press inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Prev
      </button>
      <ul className="flex items-center gap-1">
        {pages.map((p, i) => (
          <li key={i}>
            {p === "…" ? (
              <span className="px-2 text-xs text-muted-foreground">…</span>
            ) : (
              <button
                onClick={() => setPage(p as number)}
                aria-current={p === page ? "page" : undefined}
                className={`press inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                  p === page ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                {p}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={() => setPage((p) => Math.min(total, p + 1))}
        disabled={page === total}
        className="press inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </nav>
  );
}

const SPARK_RANGES = ["7D", "30D", "90D"] as const;
type SparkRange = (typeof SPARK_RANGES)[number];

const SPARK_DATA: Record<string, Record<SparkRange, number[]>> = {
  Revenue: {
    "7D": [30, 45, 35, 50, 48, 60, 55],
    "30D": [20, 30, 28, 35, 40, 38, 50, 45, 55, 60, 58, 65, 62, 70, 68, 72, 75, 73, 80, 78, 82, 85, 83, 88, 87, 90, 88, 92, 95, 98],
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(20 + i * 0.8 + Math.sin(i / 5) * 5)),
  },
  Users: {
    "7D": [20, 25, 40, 35, 45, 42, 50],
    "30D": Array.from({ length: 30 }, (_, i) => Math.round(15 + i * 0.7 + Math.cos(i / 4) * 4)),
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(10 + i * 0.5 + Math.sin(i / 7) * 6)),
  },
  Churn: {
    "7D": [5, 8, 6, 4, 3, 5, 4],
    "30D": Array.from({ length: 30 }, (_, i) => Math.round(8 - i * 0.1 + Math.sin(i / 3) * 1.5)),
    "90D": Array.from({ length: 90 }, (_, i) => Math.round(9 - i * 0.04 + Math.cos(i / 8) * 1)),
  },
};

const STAT_META = [
  { label: "Revenue", color: "hsl(var(--primary))", format: (v: number) => `$${v}` },
  { label: "Users", color: "hsl(var(--success))", format: (v: number) => `${v}` },
  { label: "Churn", color: "hsl(var(--destructive))", format: (v: number) => `${v}%` },
];

function SparkCard({ label, color, format, range }: { label: string; color: string; format: (v: number) => string; range: SparkRange }) {
  const data = SPARK_DATA[label][range];
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = latest - prev;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 120},${30 - (v / Math.max(...data)) * 28}`).join(" ");
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${delta >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
          {delta >= 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
          {Math.abs(delta)}
        </div>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{format(latest)}</div>
      <svg viewBox="0 0 120 30" className="mt-2 h-8 w-full">
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      </svg>
    </div>
  );
}

/* ── Comments thread ── */
type Comment = { id: string; author: string; initials: string; body: string; time: string; likes: number; liked: boolean; replies?: Comment[] };
const SEED_COMMENTS: Comment[] = [
  {
    id: "c1", author: "Marcus Rivera", initials: "MR", body: "The new gradient palette is perfect — works great across all themes!", time: "2h ago", likes: 5, liked: false,
    replies: [
      { id: "c1r1", author: "Sarah Chen", initials: "SC", body: "Thanks! I tweaked the stop positions to avoid the muddy middle.", time: "1h ago", likes: 2, liked: true },
    ],
  },
  { id: "c2", author: "Aiko Tanaka", initials: "AT", body: "Could we add a monochrome preset too? Would help for print docs.", time: "45m ago", likes: 3, liked: false },
];

function CommentNode({ c, depth = 0 }: { c: Comment; depth?: number }) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replying, setReplying] = useState(false);
  return (
    <div className={depth > 0 ? "ml-8 mt-2 border-l-2 border-border pl-3" : ""}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>{c.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold">{c.author}</span>
            <span className="text-[10px] text-muted-foreground">{c.time}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.body}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              className="press flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setLiked((l) => !l); setLikes((n) => liked ? n - 1 : n + 1); }}
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart className={`h-3 w-3 ${liked ? "fill-destructive text-destructive" : ""}`} /> {likes}
            </button>
            <button
              className="press flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setReplying((r) => !r); }}
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
          </div>
          {replying && (
            <div className="mt-2 flex gap-2">
              <input autoFocus className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Write a reply…" onClick={(e) => e.stopPropagation()} />
              <button className="press rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground" onClick={(e) => { e.stopPropagation(); setReplying(false); }}>Send</button>
            </div>
          )}
        </div>
      </div>
      {c.replies?.map((r) => <CommentNode key={r.id} c={r} depth={depth + 1} />)}
    </div>
  );
}

/* ── Avatar group ── */
const AVATAR_USERS = [
  { initials: "SC", label: "Sarah Chen" },
  { initials: "MR", label: "Marcus Rivera" },
  { initials: "AT", label: "Aiko Tanaka" },
  { initials: "ER", label: "Elena Rossi" },
  { initials: "JD", label: "James Doe" },
];
const AVATAR_GRADIENTS = [
  "var(--gradient-accent)",
  "linear-gradient(135deg, hsl(260,70%,55%), hsl(220,80%,60%))",
  "linear-gradient(135deg, hsl(160,65%,40%), hsl(200,70%,50%))",
  "linear-gradient(135deg, hsl(30,90%,55%), hsl(50,90%,55%))",
  "linear-gradient(135deg, hsl(340,75%,55%), hsl(310,70%,55%))",
];

/* ── Badge gallery ── */
const BADGE_VARIANTS = [
  { variant: "default" as const, label: "Default" },
  { variant: "secondary" as const, label: "Secondary" },
  { variant: "outline" as const, label: "Outline" },
  { variant: "destructive" as const, label: "Destructive" },
];
const STATUS_DOTS = [
  { color: "bg-[hsl(var(--success))]", label: "Active" },
  { color: "bg-amber-500", label: "Pending" },
  { color: "bg-muted-foreground", label: "Offline" },
  { color: "bg-destructive", label: "Error" },
];

/* ── Scroll area ── */
const SCROLL_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  id: `item-${i}`,
  name: ["button.tsx", "card.tsx", "dialog.tsx", "input.tsx", "badge.tsx", "slider.tsx", "toggle.tsx", "tooltip.tsx", "popover.tsx", "select.tsx", "switch.tsx", "textarea.tsx", "label.tsx", "separator.tsx", "avatar.tsx", "checkbox.tsx", "radio.tsx", "tabs.tsx", "calendar.tsx", "scroll-area.tsx", "command.tsx", "context-menu.tsx", "hover-card.tsx", "accordion.tsx"][i % 24],
  size: `${Math.round(1.2 + Math.abs(Math.sin(i * 2.4)) * 8.8)}KB`,
}));

export function DataDisplaySection() {
  /* Table sort */
  const [sortKey, setSortKey] = useState<"name" | "role" | "revenue">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortedTable = useMemo(() => {
    return [...TABLE_DATA].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [sortKey, sortDir]);
  const handleSort = (key: typeof sortKey) => {
    if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  /* Stat sparklines */
  const [sparkRange, setSparkRange] = useState<SparkRange>("7D");

  /* Avatar group */
  const [shownCount, setShownCount] = useState(3);

  return (
    <Section id="data-display" title="Data Display" description="Tables, metrics, trees, and structured data patterns.">

      {/* ── Sortable Table ── */}
      <DemoCard
        label="Table"
        selection={{
          id: "dd-table", name: "Data Table", category: "Data Display",
          variants: ["sortable", "with-status"],
          jsx: `<table>\n  <thead onClick={() => handleSort("name")}>\n    <tr><th>Name</th>…</tr>\n  </thead>\n  <tbody>\n    {sortedData.map(row => <tr>{…}</tr>)}\n  </tbody>\n</table>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-lg border border-border text-xs">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {([["name", "Name"], ["role", "Role"], ["status", "Status"], ["revenue", "Revenue"]] as [typeof sortKey | "status", string][]).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {key === "status" ? label : (
                      <button
                        onClick={() => handleSort(key as typeof sortKey)}
                        className="press inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {label}
                        <ArrowUpDown className={`h-3 w-3 ${sortKey === key ? "text-primary" : ""}`} />
                      </button>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTable.map((row) => (
                <tr key={row.name} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
                        {row.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.role}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      row.status === "Active" ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
                        : row.status === "Away" ? "bg-amber-500/15 text-amber-500"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${row.status === "Active" ? "bg-[hsl(var(--success))]" : row.status === "Away" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{row.revenue}</td>
                  <td className="px-3 py-2.5">
                    <button className="press rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoCard>

      {/* ── Avatar Group ── */}
      <DemoCard
        label="Avatar group"
        selection={{
          id: "dd-avatars", name: "Avatar Group", category: "Data Display",
          variants: ["stacked", "overflow-count", "expandable"],
          jsx: `<div className="flex -space-x-2">\n  {users.slice(0, 3).map(u => <Avatar key={u} />)}\n  {users.length > 3 && <span>+{users.length - 3}</span>}\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Assigned to</div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {AVATAR_USERS.slice(0, shownCount).map((u, i) => (
                  <div
                    key={u.initials}
                    title={u.label}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-primary-foreground ring-0"
                    style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length], zIndex: shownCount - i }}
                  >
                    {u.initials}
                  </div>
                ))}
                {shownCount < AVATAR_USERS.length && (
                  <button
                    onClick={() => setShownCount(AVATAR_USERS.length)}
                    className="press flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground hover:bg-muted/80"
                    style={{ zIndex: 0 }}
                  >
                    +{AVATAR_USERS.length - shownCount}
                  </button>
                )}
                {shownCount === AVATAR_USERS.length && (
                  <button
                    onClick={() => setShownCount(3)}
                    className="press flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground hover:bg-muted/80"
                    style={{ zIndex: 0 }}
                  >
                    ↩
                  </button>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {shownCount < AVATAR_USERS.length ? `${shownCount} of ${AVATAR_USERS.length} — click +${AVATAR_USERS.length - shownCount} to expand` : `All ${AVATAR_USERS.length} members`}
              </div>
            </div>
          </div>

          {/* Size variants */}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Size variants</div>
            <div className="flex items-end gap-3">
              {([6, 8, 10, 12] as const).map((size, i) => (
                <div
                  key={size}
                  className={`flex h-${size} w-${size} items-center justify-center rounded-full border-2 border-background text-primary-foreground font-bold`}
                  style={{ background: AVATAR_GRADIENTS[i], fontSize: `${size * 1.2}px`, width: `${size * 4}px`, height: `${size * 4}px` }}
                >
                  {AVATAR_USERS[i].initials}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DemoCard>

      {/* ── Badge Gallery ── */}
      <DemoCard
        label="Badge gallery"
        selection={{
          id: "dd-badges", name: "Badge & Status Gallery", category: "Data Display",
          variants: ["default", "secondary", "outline", "destructive", "status-dot"],
          jsx: `<Badge variant="default">Label</Badge>\n<Badge variant="secondary">Beta</Badge>\n<Badge variant="outline">Outline</Badge>\n<Badge variant="destructive">Error</Badge>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Variants</div>
            <div className="flex flex-wrap gap-2">
              {BADGE_VARIANTS.map(({ variant, label }) => (
                <Badge key={variant} variant={variant}>{label}</Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status dots</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_DOTS.map(({ color, label }) => (
                <Badge key={label} variant="outline" className="gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                  {label}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sizes</div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="text-[9px] px-1.5 py-0.5">XS</Badge>
              <Badge>SM (default)</Badge>
              <Badge className="text-sm px-3 py-1">MD</Badge>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">With icons</div>
            <div className="flex flex-wrap gap-2">
              <Badge className="gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/70" />Live</Badge>
              <Badge variant="secondary" className="gap-1">
                <Plus className="h-3 w-3" /> New
              </Badge>
              <Badge variant="outline" className="gap-1">
                <MessageSquare className="h-3 w-3" /> 12
              </Badge>
            </div>
          </div>
        </div>
      </DemoCard>

      {/* ── Scroll Area ── */}
      <DemoCard
        label="Scroll area"
        selection={{
          id: "dd-scroll", name: "Scroll Area", category: "Data Display",
          variants: ["fixed-height", "custom-scrollbar", "file-list"],
          jsx: `<ScrollArea className="h-48 rounded-lg border">\n  {items.map(item => <div key={item.id}>{item.name}</div>)}\n</ScrollArea>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Component files</div>
            <Badge variant="outline" className="text-[10px]">{SCROLL_ITEMS.length} files</Badge>
          </div>
          <ScrollArea className="h-44 rounded-lg border border-border">
            <div className="p-2 space-y-0.5">
              {SCROLL_ITEMS.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60 transition-colors cursor-default"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-mono">{item.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{item.size}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">#{i + 1}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground">Custom scrollbar via Radix ScrollArea — consistent across browsers.</p>
        </div>
      </DemoCard>

      {/* ── Metrics ── */}
      <DemoCard
        label="Metrics"
        selection={{
          id: "dd-metrics", name: "Metric Cards", category: "Data Display",
          variants: ["with-delta", "2x2 grid"],
          jsx: `<div className="grid grid-cols-2 gap-3">\n  <MetricCard label="Revenue" value="$42,650" change="+12.4%" />\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums">{m.value}</div>
              <div className={`flex items-center gap-0.5 text-xs font-medium ${m.positive ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {m.positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {m.change}
              </div>
            </div>
          ))}
        </div>
      </DemoCard>

      {/* ── Stat Sparklines ── */}
      <DemoCard
        label="Stat + sparkline"
        selection={{
          id: "dd-spark", name: "Stat with Sparkline", category: "Data Display",
          variants: ["7D", "30D", "90D"],
          jsx: `<SparkCard label="Revenue" range={range} />`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="flex items-center justify-end gap-1">
            {SPARK_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setSparkRange(r)}
                className={`press rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${sparkRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {STAT_META.map((m) => (
              <SparkCard key={m.label} label={m.label} color={m.color} format={m.format} range={sparkRange} />
            ))}
          </div>
        </div>
      </DemoCard>

      {/* ── Tree ── */}
      <DemoCard
        label="Tree"
        selection={{
          id: "dd-tree", name: "Tree View", category: "Data Display",
          variants: ["collapsible", "file-system"],
          jsx: `<TreeNode item={rootItem} depth={0} />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="rounded-lg border border-border bg-card p-2">
          {TREE_ITEMS.map((item) => <TreeNode key={item.name} item={item} />)}
        </div>
      </DemoCard>

      {/* ── Key-Value ── */}
      <DemoCard
        label="Key-Value"
        selection={{
          id: "dd-kv", name: "Key-Value List", category: "Data Display",
          variants: ["metadata", "properties"],
          jsx: `<dl className="divide-y">\n  <div className="flex justify-between py-2">\n    <dt>Version</dt>\n    <dd>1.2.3</dd>\n  </div>\n</dl>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <dl className="divide-y divide-border text-xs">
            {[
              { k: "Version", v: "1.2.3" },
              { k: "License", v: "MIT" },
              { k: "Last updated", v: "3 days ago" },
              { k: "Dependencies", v: "12" },
              { k: "Bundle size", v: "42 kB (gzip)" },
            ].map(({ k, v }) => (
              <div key={k} className="flex items-center justify-between py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </DemoCard>

      {/* ── Empty state ── */}
      <DemoCard
        label="Empty state"
        selection={{
          id: "dd-empty", name: "Empty State", category: "Data Display",
          variants: ["with-cta", "icon-centered"],
          jsx: `<div className="flex flex-col items-center py-12">\n  <Inbox />\n  <h3>No projects yet</h3>\n  <Button><Plus /> New project</Button>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium">No projects yet</div>
          <p className="max-w-[200px] text-xs text-muted-foreground">Create your first project to get started.</p>
          <Button size="sm" className="press mt-1">
            <Plus className="h-4 w-4 mr-1" /> New project
          </Button>
        </div>
      </DemoCard>

      {/* ── Skeleton ── */}
      <DemoCard
        label="Skeleton"
        selection={{
          id: "dd-skeleton", name: "Skeleton Loader", category: "Data Display",
          variants: ["list", "avatar+text"],
          jsx: `<Skeleton className="h-4 w-3/4" />\n<Skeleton className="h-4 w-1/2" />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </DemoCard>

      {/* ── Pagination ── */}
      <DemoCard
        label="Pagination"
        selection={{
          id: "dd-pagination", name: "Pagination", category: "Data Display",
          variants: ["prev/next", "ellipsis", "active-page"],
          jsx: `<Pagination total={12} page={3} onPageChange={setPage} />`,
        }}
      >
        <PaginationDemo />
      </DemoCard>

      {/* ── Comments thread ── */}
      <DemoCard
        label="Comments thread"
        selection={{
          id: "dd-comments", name: "Comments Thread", category: "Data Display",
          variants: ["nested", "reactions", "reply"],
          jsx: `<CommentNode comment={c} depth={0} />`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          {SEED_COMMENTS.map((c) => <CommentNode key={c.id} c={c} />)}
          <div className="flex gap-2 border-t border-border pt-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              You
            </div>
            <input
              placeholder="Add a comment…"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      </DemoCard>

      {/* ── Timeline ── */}
      <DemoCard
        label="Timeline"
        selection={{
          id: "dd-timeline", name: "Timeline", category: "Data Display",
          variants: ["vertical", "with-icons"],
          jsx: `<ol>\n  {events.map(e => (\n    <li className="flex gap-3">\n      <div className="flex flex-col items-center">\n        <div className="h-2 w-2 rounded-full bg-primary" />\n        <div className="flex-1 w-px bg-border" />\n      </div>\n      <div>{e.text}</div>\n    </li>\n  ))}\n</ol>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <ol className="space-y-0">
            {[
              { icon: "🚀", label: "v1.0 shipped", sub: "All 14 sections live", time: "Today" },
              { icon: "🎨", label: "Theme system", sub: "10 presets + CSS export", time: "2 days ago" },
              { icon: "♿", label: "A11y audit", sub: "WCAG AA pass on all themes", time: "Last week" },
              { icon: "🏗", label: "Project created", sub: "First commit pushed", time: "2 weeks ago" },
            ].map((ev, i, arr) => (
              <li key={ev.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-sm">
                    {ev.icon}
                  </div>
                  {i < arr.length - 1 && <div className="flex-1 w-px bg-border my-1" />}
                </div>
                <div className={`pb-4 ${i === arr.length - 1 ? "" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{ev.label}</span>
                    <span className="text-[10px] text-muted-foreground">{ev.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.sub}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </DemoCard>
    </Section>
  );
}
