import { useState } from "react";
import {
  ArrowRight, Bell, Check, ChevronRight, Globe, Lock,
  Mail, Search, SlidersHorizontal,
  Sparkles, Star, Trash2, TrendingUp, User, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DemoCard, Section } from "../Section";
import { CombosInbox } from "./CombosInbox";
import { CombosNotificationCenter } from "./CombosNotificationCenter";
import { CombosPricingTable } from "./CombosPricingTable";
import { FILTER_ROWS, MailRow, Notif, SEED_MAIL, SEED_NOTIFS, STATUS_FILTERS, Status, WIZARD_STEPS } from "./combosData";

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

      <CombosNotificationCenter
        notifTab={notifTab}
        unreadCount={unreadCount}
        visibleNotifs={visibleNotifs}
        setNotifTab={setNotifTab}
        markAllRead={markAllRead}
        dismissNotif={dismissNotif}
      />
      <CombosPricingTable />

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

      <CombosInbox
        mailRows={mailRows}
        setMailRows={setMailRows}
        toggleStar={toggleStar}
        markRead={markRead}
        removeRow={removeRow}
      />
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

