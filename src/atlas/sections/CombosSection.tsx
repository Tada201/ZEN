import { useState } from "react";
import {
  ArrowRight, Bell, Check, ChevronRight, Globe, Lock,
  Mail, Paperclip, Search, SlidersHorizontal,
  Sparkles, Star, Trash2, TrendingUp, User, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DemoCard, Section } from "../Section";

/* ─────────── Inbox ─────────── */
type MailRow = { id: string; from: string; initials: string; subject: string; preview: string; time: string; unread: boolean; starred: boolean; hasAttach?: boolean };
const SEED_MAIL: MailRow[] = [
  { id: "m1", from: "Sarah Chen", initials: "SC", subject: "Design review notes from Friday", preview: "Loved the new motion timing — one nit on the toast position…", time: "9:42 AM", unread: true, starred: true, hasAttach: true },
  { id: "m2", from: "GitHub", initials: "GH", subject: "PR #284 ready for review", preview: "fix(theme): respect reduced-motion when applying preset", time: "8:16 AM", unread: true, starred: false },
  { id: "m3", from: "Linear", initials: "LN", subject: "3 issues moved to In Review", preview: "ATL-42, ATL-58, ATL-61 are awaiting your sign-off", time: "Yesterday", unread: false, starred: false },
  { id: "m4", from: "Marcus Rivera", initials: "MR", subject: "Lunch on Thursday?", preview: "Free anytime after 12:30 — pick a spot near the office?", time: "Mon", unread: false, starred: false },
];

/* ─────────── Notification center ─────────── */
type Notif = { id: string; icon: string; text: string; time: string; read: boolean };
const SEED_NOTIFS: Notif[] = [
  { id: "n1", icon: "💬", text: "Sarah left a comment on your PR #284", time: "2m ago", read: false },
  { id: "n2", icon: "✅", text: "CI pipeline passed on main branch", time: "14m ago", read: false },
  { id: "n3", icon: "🎉", text: "ATL-42 moved to Done by Marcus", time: "1h ago", read: false },
  { id: "n4", icon: "🔔", text: "Weekly digest is ready to view", time: "Yesterday", read: true },
  { id: "n5", icon: "📌", text: "You were mentioned in #design-review", time: "Yesterday", read: true },
];

/* ─────────── Filter bar helpers ─────────── */
const STATUS_FILTERS = ["All", "Active", "Review", "Done", "Archived"] as const;
type Status = (typeof STATUS_FILTERS)[number];
type FilterRow = { id: string; name: string; status: Status; priority: string };
const FILTER_ROWS: FilterRow[] = [
  { id: "t1", name: "Update onboarding flow", status: "Active", priority: "High" },
  { id: "t2", name: "Audit contrast tokens", status: "Done", priority: "Medium" },
  { id: "t3", name: "Add range slider demo", status: "Review", priority: "High" },
  { id: "t4", name: "Write motion guidelines", status: "Active", priority: "Low" },
  { id: "t5", name: "Migrate legacy inputs", status: "Archived", priority: "Low" },
  { id: "t6", name: "Publish v1.0 changelog", status: "Review", priority: "Medium" },
];

/* ─────────── Onboarding wizard ─────────── */
const WIZARD_STEPS = ["Account", "Team", "Plan"] as const;

export function CombosSection() {
  /* Settings */
  const [notifications, setNotifications] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [twoFA, setTwoFA] = useState(true);
  const [language, setLanguage] = useState("en-US");

  /* Inbox */
  const [mailRows, setMailRows] = useState<MailRow[]>(SEED_MAIL);
  const toggleStar = (id: string) => setMailRows((rows) => rows.map((r) => (r.id === id ? { ...r, starred: !r.starred } : r)));
  const markRead = (id: string) => setMailRows((rows) => rows.map((r) => (r.id === id ? { ...r, unread: false } : r)));
  const removeRow = (id: string) => setMailRows((rows) => rows.filter((r) => r.id !== id));

  /* Notification center */
  const [notifs, setNotifs] = useState<Notif[]>(SEED_NOTIFS);
  const [notifTab, setNotifTab] = useState<"all" | "unread">("all");
  const unreadCount = notifs.filter((n) => !n.read).length;
  const markAllRead = () => setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  const dismissNotif = (id: string) => setNotifs((ns) => ns.filter((n) => n.id !== id));
  const visibleNotifs = notifTab === "unread" ? notifs.filter((n) => !n.read) : notifs;

  /* Filter bar */
  const [filterStatus, setFilterStatus] = useState<Status>("All");
  const [filterSearch, setFilterSearch] = useState("");
  const filteredRows = FILTER_ROWS.filter((r) =>
    (filterStatus === "All" || r.status === filterStatus) &&
    r.name.toLowerCase().includes(filterSearch.toLowerCase())
  );
  const priorityColor = (p: string) =>
    p === "High" ? "text-destructive" : p === "Medium" ? "text-amber-500" : "text-muted-foreground";

  /* Wizard */
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDone, setWizardDone] = useState(false);

  return (
    <Section id="combos" title="Combos & Patterns" description="Pre-assembled component combinations ready to drop into projects.">

      {/* ── Hero ── */}
      <DemoCard
        label="Hero"
        selection={{
          id: "cb-hero", name: "Hero Section", category: "Combos",
          variants: ["centered", "with-cta"],
          jsx: `<section className="py-20 text-center">\n  <Badge>NEW</Badge>\n  <h1>Build faster</h1>\n  <p>Description</p>\n  <Button>Get started</Button>\n</section>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center py-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Now in beta
          </span>
          <h3 className="mt-3 text-2xl font-bold tracking-tight">Build beautiful UIs in minutes</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">A complete design system with 50+ components, 10 themes, and copy-paste ready code.</p>
          <div className="mt-4 flex gap-2">
            <Button className="press">Get started</Button>
            <Button variant="outline" className="press">View docs</Button>
          </div>
        </div>
      </DemoCard>

      {/* ── Feature Grid ── */}
      <DemoCard
        label="Feature Grid"
        selection={{
          id: "cb-features", name: "Feature Grid", category: "Combos",
          variants: ["3-col", "with-icons"],
          jsx: `<div className="grid grid-cols-3 gap-4">\n  <FeatureCard icon={Zap} title="Fast" desc="..." />\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-2 gap-3">
          {[
            { icon: Zap, title: "Fast", desc: "Optimized rendering" },
            { icon: Star, title: "Polished", desc: "Pixel-perfect spacing" },
            { icon: TrendingUp, title: "Scalable", desc: "Grows with your team" },
            { icon: Sparkles, title: "Accessible", desc: "WCAG 2.1 AA ready" },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-lg border border-border bg-card p-3">
                <Icon className="h-5 w-5 text-primary" />
                <div className="mt-2 text-sm font-medium">{f.title}</div>
                <div className="text-[10px] text-muted-foreground">{f.desc}</div>
              </div>
            );
          })}
        </div>
      </DemoCard>

      {/* ── Filter Bar ── */}
      <DemoCard
        label="Filter bar"
        selection={{
          id: "cb-filter", name: "Filter Bar", category: "Combos",
          variants: ["status-chips", "search", "sort"],
          jsx: `<div className="flex items-center gap-2">\n  <SearchInput />\n  {STATUS_FILTERS.map(s => <FilterChip status={s} />)}\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tasks…"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`press rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            {filteredRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No tasks match the filter.</div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                    <span className="flex-1 truncate font-medium">{row.name}</span>
                    <span className={`shrink-0 font-medium ${priorityColor(row.priority)}`}>{row.priority}</span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{row.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DemoCard>

      {/* ── Notification center ── */}
      <DemoCard
        label="Notification center"
        selection={{
          id: "cb-notif", name: "Notification Center", category: "Combos",
          variants: ["popover", "tabs-all-unread", "mark-all-read"],
          jsx: `<Popover>\n  <PopoverTrigger>\n    <Bell /><Badge>{unread}</Badge>\n  </PopoverTrigger>\n  <PopoverContent>\n    <Tabs>\n      <TabsList>All | Unread</TabsList>\n      {notifs.map(n => <NotifRow />)}\n    </Tabs>\n  </PopoverContent>\n</Popover>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center py-4">
          <Popover>
            <PopoverTrigger asChild>
              <button className="press relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="center">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <h4 className="text-sm font-semibold">Notifications</h4>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="press text-[10px] font-medium text-primary hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
              </div>
              <div className="flex border-b border-border">
                {(["all", "unread"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setNotifTab(tab)}
                    className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                      notifTab === tab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                    {tab === "unread" && unreadCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">{unreadCount}</span>
                    )}
                  </button>
                ))}
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                {visibleNotifs.length === 0 ? (
                  <li className="py-8 text-center text-xs text-muted-foreground">You're all caught up.</li>
                ) : visibleNotifs.map((n) => (
                  <li key={n.id} className={`group flex items-start gap-2.5 px-3 py-2.5 ${!n.read ? "bg-primary/[0.03]" : ""}`}>
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-base">{n.icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">{n.text}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{n.time}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      {!n.read && <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />}
                      <button
                        onClick={() => dismissNotif(n.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity press text-muted-foreground hover:text-foreground"
                        aria-label="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border px-3 py-2">
                <button className="press flex w-full items-center justify-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  View all notifications <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </DemoCard>

      {/* ── Pricing Table ── */}
      <DemoCard
        label="Pricing Table"
        selection={{
          id: "cb-pricing", name: "Pricing Table", category: "Combos",
          variants: ["3-tier"],
          jsx: `<div className="grid grid-cols-3 gap-4">\n  <PricingCard tier="Starter" price="$0" />\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-3"
      >
        <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-3 gap-3">
          {[
            { name: "Starter", price: "$0", features: ["3 projects", "Community support", "Basic analytics"] },
            { name: "Pro", price: "$12", features: ["Unlimited projects", "Priority support", "Custom themes", "Team seats"], highlight: true },
            { name: "Enterprise", price: "Custom", features: ["SSO & SAML", "Dedicated support", "SLA", "On-premise option"] },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-4 ${tier.highlight ? "border-primary" : "border-border"}`}
              style={tier.highlight ? { boxShadow: "var(--shadow-accent)" } : {}}
            >
              {tier.highlight && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Popular</span>}
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tier.name}</div>
              <div className="mt-1 text-3xl font-bold">{tier.price}</div>
              <div className="text-[10px] text-muted-foreground">{tier.price === "Custom" ? "Contact sales" : "/mo"}</div>
              <ul className="mt-3 space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs">
                    <Check className="h-3.5 w-3.5 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="press mt-4 w-full" variant={tier.highlight ? "default" : "outline"} size="sm">Choose {tier.name}</Button>
            </div>
          ))}
        </div>
      </DemoCard>

      {/* ── Onboarding Wizard ── */}
      <DemoCard
        label="Onboarding wizard"
        selection={{
          id: "cb-wizard", name: "Multi-step Wizard", category: "Combos",
          variants: ["step-indicator", "validated", "animated"],
          jsx: `<div>\n  <StepBar steps={STEPS} current={step} />\n  <AnimatePresence mode="wait">\n    <StepContent key={step} />\n  </AnimatePresence>\n  <div className="flex gap-2">\n    <Button onClick={prev}>Back</Button>\n    <Button onClick={next}>Next</Button>\n  </div>\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          {wizardDone ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
                <Check className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold">You're all set!</div>
              <p className="text-xs text-muted-foreground">Your workspace is ready.</p>
              <Button size="sm" className="press mt-2" onClick={() => { setWizardStep(0); setWizardDone(false); }}>
                Restart demo
              </Button>
            </div>
          ) : (
            <>
              {/* Step bar */}
              <div className="flex items-center gap-2">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex flex-1 items-center gap-2">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                      i < wizardStep ? "bg-primary text-primary-foreground" :
                      i === wizardStep ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {i < wizardStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === wizardStep ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                    {i < WIZARD_STEPS.length - 1 && <div className={`flex-1 h-px ${i < wizardStep ? "bg-primary" : "bg-border"}`} />}
                  </div>
                ))}
              </div>

              {/* Step content */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 min-h-[100px]">
                {wizardStep === 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Create your account</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">First name</label>
                        <input defaultValue="Sarah" className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Last name</label>
                        <input defaultValue="Chen" className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[11px] text-muted-foreground">Work email</label>
                        <input defaultValue="sarah@acme.com" className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                  </div>
                )}
                {wizardStep === 1 && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Set up your team</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Team name</label>
                        <input defaultValue="Acme Design Team" className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Invite teammates (comma separated)</label>
                        <input placeholder="marcus@acme.com, aiko@acme.com" className="block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                  </div>
                )}
                {wizardStep === 2 && (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Choose your plan</div>
                    <div className="grid grid-cols-3 gap-2">
                      {["Free", "Pro", "Team"].map((plan) => (
                        <label key={plan} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border bg-card p-2 text-center has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary">
                          <input type="radio" name="wizard-plan" value={plan} defaultChecked={plan === "Pro"} className="sr-only" />
                          <div className="text-xs font-semibold">{plan}</div>
                          <div className="text-[10px] text-muted-foreground">{plan === "Free" ? "$0/mo" : plan === "Pro" ? "$12/mo" : "$29/mo"}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="press"
                  disabled={wizardStep === 0}
                  onClick={() => setWizardStep((s) => s - 1)}
                >
                  Back
                </Button>
                <span className="text-[10px] text-muted-foreground tabular-nums">{wizardStep + 1} / {WIZARD_STEPS.length}</span>
                <Button
                  size="sm"
                  className="press"
                  onClick={() => {
                    if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep((s) => s + 1);
                    else setWizardDone(true);
                  }}
                >
                  {wizardStep < WIZARD_STEPS.length - 1 ? "Next" : "Finish"}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DemoCard>

      {/* ── Dashboard Header ── */}
      <DemoCard
        label="Dashboard Header"
        selection={{
          id: "cb-dash-header", name: "Dashboard Header", category: "Combos",
          variants: ["with-search", "with-actions"],
          jsx: `<header className="flex items-center justify-between">\n  <h1>Dashboard</h1>\n  <div className="flex gap-2">\n    <SearchInput />\n    <Button>Create</Button>\n  </div>\n</header>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold">Dashboard</h4>
            <p className="text-xs text-muted-foreground">Welcome back, Sarah</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search…" className="h-8 w-40 pl-8 text-xs" />
            </div>
            <Button size="sm" className="press h-8">Create</Button>
          </div>
        </div>
      </DemoCard>

      {/* ── Newsletter ── */}
      <DemoCard
        label="Newsletter"
        selection={{
          id: "cb-newsletter", name: "Newsletter CTA", category: "Combos",
          variants: ["simple", "with-guarantee"],
          jsx: `<div className="flex gap-2">\n  <Input placeholder="Email" />\n  <Button>Subscribe</Button>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <div className="text-sm font-medium">Stay in the loop</div>
          <div className="flex gap-2">
            <Input placeholder="sarah@acme.com" className="h-8 text-xs" />
            <Button size="sm" className="press h-8">Subscribe</Button>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Mail className="h-3 w-3" /> No spam. Unsubscribe anytime.
          </div>
        </div>
      </DemoCard>

      {/* ── Settings page ── */}
      <DemoCard
        label="Settings page"
        selection={{
          id: "cb-settings", name: "Settings Section", category: "Combos",
          variants: ["toggles", "select"],
          jsx: `<section>\n  <h3>Account</h3>\n  <SettingRow icon={Bell} title="Notifications" desc="...">\n    <Switch />\n  </SettingRow>\n</section>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div onClick={(e) => e.stopPropagation()} className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h4 className="text-sm font-semibold">Account preferences</h4>
            <p className="text-xs text-muted-foreground">Manage how UI Zen notifies and protects your account.</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { icon: Bell, title: "Push notifications", desc: "Get notified when teammates comment or assign issues.", value: notifications, set: setNotifications },
              { icon: Mail, title: "Marketing emails", desc: "Product updates, tips, and occasional newsletters.", value: marketing, set: setMarketing },
              { icon: Lock, title: "Two-factor auth", desc: "Require a one-time code at sign-in.", value: twoFA, set: setTwoFA },
            ].map((row) => {
              const Icon = row.icon;
              const id = `set-${row.title.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <div key={row.title} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="block text-sm font-medium">{row.title}</label>
                    <p className="text-xs text-muted-foreground">{row.desc}</p>
                  </div>
                  <Switch id={id} checked={row.value} onCheckedChange={row.set} />
                </div>
              );
            })}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Globe className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="set-lang" className="block text-sm font-medium">Display language</label>
                <p className="text-xs text-muted-foreground">Used across the app and email notifications.</p>
              </div>
              <select
                id="set-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="ja-JP">日本語</option>
                <option value="es-ES">Español</option>
              </select>
            </div>
            <button className="press flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-destructive">Delete account</div>
                  <div className="text-xs text-muted-foreground">Permanently remove your workspace and data.</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </DemoCard>

      {/* ── Inbox ── */}
      <DemoCard
        label="Inbox"
        selection={{
          id: "cb-inbox", name: "Email / Inbox List", category: "Combos",
          variants: ["unread dot", "starred", "with attachment"],
          jsx: `<ul role="list" className="divide-y">\n  <li className="flex items-center gap-3 p-3">\n    <Avatar /> <Subject /> <Time />\n  </li>\n</ul>`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Inbox</h4>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                {mailRows.filter((m) => m.unread).length}
              </span>
            </div>
            <button
              onClick={() => setMailRows(SEED_MAIL)}
              className="press text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
          <ul role="list" className="divide-y divide-border">
            {mailRows.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">Inbox zero. Nice work.</li>
            )}
            {mailRows.map((m) => (
              <li key={m.id} className={`group flex items-start gap-3 px-3 py-2.5 ${m.unread ? "bg-primary/[0.03]" : ""}`}>
                <button
                  aria-label={m.unread ? "Mark as read" : "Read"}
                  onClick={() => markRead(m.id)}
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.unread ? "bg-primary" : "bg-transparent border border-border"}`}
                />
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
                  {m.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-xs ${m.unread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>{m.from}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{m.time}</span>
                  </div>
                  <div className={`mt-0.5 truncate text-xs ${m.unread ? "text-foreground" : "text-muted-foreground"}`}>
                    {m.subject}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {m.hasAttach && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    <p className="truncate text-[11px] text-muted-foreground">{m.preview}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    aria-label={m.starred ? "Unstar" : "Star"}
                    onClick={() => toggleStar(m.id)}
                    className="press"
                  >
                    <Star className={`h-3.5 w-3.5 ${m.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => removeRow(m.id)}
                    className="press text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </DemoCard>

      {/* ── Login Page ── */}
      <DemoCard
        label="Login Page"
        selection={{
          id: "cb-login", name: "Login Layout", category: "Combos",
          variants: ["centered", "split-screen"],
          jsx: `<div className="mx-auto max-w-sm space-y-4">\n  <h2>Sign in</h2>\n  <Input />\n  <Input type="password" />\n  <Button className="w-full">Sign in</Button>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="mx-auto max-w-[240px] space-y-3 py-2">
          <div className="text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
              <Sparkles className="h-4 w-4" />
            </div>
            <h4 className="mt-2 text-sm font-semibold">Sign in to UI Zen</h4>
          </div>
          <Input placeholder="Email" className="h-8 text-xs" />
          <Input type="password" placeholder="Password" className="h-8 text-xs" />
          <Button size="sm" className="press w-full">Sign in</Button>
          <div className="text-center text-[10px] text-muted-foreground">
            <a href="#" className="text-primary hover:underline">Forgot password?</a>
          </div>
        </div>
      </DemoCard>

      {/* ── User profile card (bonus) ── */}
      <DemoCard
        label="User profile card"
        selection={{
          id: "cb-profile-card", name: "User Profile Card", category: "Combos",
          variants: ["with-stats", "with-bio"],
          jsx: `<div className="rounded-xl border p-4">\n  <Avatar />\n  <h3>Sarah Chen</h3>\n  <p>Design Lead</p>\n  <div className="grid grid-cols-3">\n    <Stat label="Projects" value={24} />\n  </div>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
              SC
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Sarah Chen</span>
                <Badge variant="secondary" className="text-[10px]">Pro</Badge>
              </div>
              <div className="text-xs text-muted-foreground">Design Lead · Acme Inc.</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                Building design systems that scale. Open source contributor. Figma fanatic.
              </div>
            </div>
            <Button size="sm" variant="outline" className="press shrink-0">
              <User className="h-3.5 w-3.5 mr-1" /> Follow
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-2 text-center">
            {[{ label: "Projects", value: "24" }, { label: "Followers", value: "1.4k" }, { label: "Following", value: "182" }].map((s) => (
              <div key={s.label}>
                <div className="text-sm font-bold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </DemoCard>
    </Section>
  );
}

