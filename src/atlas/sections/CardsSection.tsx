import { useState } from "react";
import { ArrowUpRight, Bell, Check, Circle, Clock, GitBranch, Heart, MessageSquare, MoreHorizontal, ShoppingCart, Sparkles, Star, TrendingUp, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoCard, Section } from "../Section";

const AVATAR_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#f472b6"];

function ProductCard() {
  const [saved, setSaved] = useState(false);
  return (
    <article onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: "var(--gradient-accent)" }}>
        <div className="absolute inset-0 flex items-center justify-center text-primary-foreground/80">
          <ShoppingCart className="h-10 w-10" aria-hidden="true" />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground backdrop-blur">
          New
        </span>
        <button
          type="button"
          onClick={() => setSaved((s) => !s)}
          aria-pressed={saved}
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          className="press absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
        >
          <Heart className={`h-4 w-4 transition ${saved ? "fill-rose-500 text-rose-500" : "text-foreground"}`} aria-hidden="true" />
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">Zen Hoodie</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Heavy fleece · Unisex</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">$58</div>
            <div className="text-[10px] text-muted-foreground line-through">$72</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px]">
          <Star className="h-3 w-3 fill-current text-[hsl(var(--warning))]" aria-hidden="true" />
          <span className="font-medium">4.8</span>
          <span className="text-muted-foreground">(312)</span>
        </div>
        <Button size="sm" className="press mt-3 w-full">Add to cart</Button>
      </div>
    </article>
  );
}

function NotificationCard() {
  return (
    <article onClick={(e) => e.stopPropagation()} className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
          </span>
          <div>
            <div className="text-sm font-semibold">Activity</div>
            <div className="text-[10px] text-muted-foreground">Last 24 hours</div>
          </div>
        </div>
        <button className="press text-xs font-medium text-primary hover:underline">Mark read</button>
      </header>
      <ul className="mt-3 space-y-2.5">
        {[
          { who: "Sarah", what: "commented on your design", when: "2m" },
          { who: "Marcus", what: "approved the spec", when: "1h" },
          { who: "Aiko", what: "shared a Figma file", when: "3h" },
        ].map((n, i) => (
          <li key={n.who} className="flex items-start gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground"
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              {n.who[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug">
                <span className="font-medium">{n.who}</span>{" "}
                <span className="text-muted-foreground">{n.what}</span>
              </p>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <MessageSquare className="h-3 w-3" aria-hidden="true" /> {n.when} ago
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function KanbanTaskCard() {
  const [checked, setChecked] = useState([true, false, false]);
  const done = checked.filter(Boolean).length;
  const tasks = ["Write copy", "Review designs", "Ship to staging"];
  const priorityColors: Record<string, string> = { High: "text-rose-500 bg-rose-500/10", Medium: "text-amber-500 bg-amber-500/10", Low: "text-emerald-500 bg-emerald-500/10" };
  const priority = "High";
  return (
    <article onClick={(e) => e.stopPropagation()} className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityColors[priority]}`}>
              <Circle className="h-1.5 w-1.5 fill-current" aria-hidden="true" /> {priority}
            </span>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">UI / Design</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-snug">Redesign onboarding flow for mobile</h3>
        </div>
        <button className="press shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {tasks.map((task, i) => (
          <li key={task} className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={checked[i]}
              aria-label={task}
              onClick={() => setChecked((prev) => prev.map((v, idx) => idx === i ? !v : v))}
              className={`press flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked[i] ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
            >
              {checked[i] && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </button>
            <span className={`text-xs ${checked[i] ? "line-through text-muted-foreground" : "text-foreground"}`}>{task}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(done / tasks.length) * 100}%` }} />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{done}/{tasks.length}</span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {["SC", "MR", "AT"].map((init, i) => (
            <span key={init} className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-primary-foreground ring-2 ring-card" style={{ background: AVATAR_COLORS[i] }}>
              {init}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> <span>Dec 15</span>
        </div>
      </div>
    </article>
  );
}

function TimelineCard() {
  const events = [
    { icon: GitBranch, color: "text-primary bg-primary/10", title: "Branch merged", desc: "feat/onboarding merged into main", time: "2m ago", actor: "Sarah" },
    { icon: MessageSquare, color: "text-blue-500 bg-blue-500/10", title: "Review comment", desc: "Left 3 inline comments on PR #142", time: "18m ago", actor: "Marcus" },
    { icon: Check, color: "text-emerald-500 bg-emerald-500/10", title: "Tests passed", desc: "All 48 checks completed successfully", time: "1h ago", actor: "CI" },
    { icon: User, color: "text-amber-500 bg-amber-500/10", title: "Assignee changed", desc: "Aiko Tanaka → Sarah Chen", time: "3h ago", actor: "Marcus" },
  ];
  return (
    <article onClick={(e) => e.stopPropagation()} className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Activity feed</h3>
      <ol className="relative space-y-4 pl-6 before:absolute before:left-2.5 before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border">
        {events.map((e) => {
          const Icon = e.icon;
          return (
            <li key={e.title} className="relative flex flex-col gap-0.5">
              <span className={`absolute -left-[22px] flex h-5 w-5 items-center justify-center rounded-full ${e.color}`}>
                <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{e.title}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{e.time}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{e.desc}</p>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function CardsSection() {
  return (
    <Section id="cards" title="Cards" description="Containers for content, identity, and conversion.">
      <DemoCard
        label="Basic"
        selection={{
          id: "c-basic", name: "Basic Card", category: "Cards",
          variants: ["content"],
          jsx: `<Card>\n  <CardHeader><CardTitle>...</CardTitle></CardHeader>\n  <CardContent>...</CardContent>\n</Card>`,
        }}
      >
        <article className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-base font-semibold">Weekly digest</h3>
          <p className="mt-1 text-sm text-muted-foreground">A summary of activity across your projects, sent every Monday at 9 AM.</p>
          <button className="press mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Read more <ArrowUpRight className="h-3.5 w-3.5" /></button>
        </article>
      </DemoCard>

      <DemoCard
        label="Profile"
        selection={{
          id: "c-profile", name: "Profile Card", category: "Cards",
          variants: ["avatar + meta"],
          jsx: `<Card>\n  <Avatar /> <div>{name}</div> <Button>Follow</Button>\n</Card>`,
        }}
      >
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>SC</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">Sarah Chen</div>
              <div className="truncate text-xs text-muted-foreground">Design Lead · Acme Corp</div>
            </div>
            <Button size="sm" variant="outline" className="press">Follow</Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <div><div className="text-sm font-semibold">248</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Posts</div></div>
            <div><div className="text-sm font-semibold">12.4k</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Followers</div></div>
            <div><div className="text-sm font-semibold">389</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Following</div></div>
          </div>
        </article>
      </DemoCard>

      <DemoCard
        label="Pricing"
        selection={{
          id: "c-pricing", name: "Pricing Card", category: "Cards",
          variants: ["featured"],
          jsx: `<Card>\n  <Badge>Popular</Badge>\n  <h3>Pro</h3>\n  <Price /> <FeatureList /> <Button>Get started</Button>\n</Card>`,
        }}
      >
        <article className="relative rounded-lg border-2 border-primary bg-card p-5" style={{ boxShadow: "var(--shadow-accent)" }}>
          <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Popular</span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pro</h3>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$12</span><span className="text-sm text-muted-foreground">/mo</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {["Unlimited projects", "Priority support", "Custom themes", "Team seats"].map((f) => (
              <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{f}</li>
            ))}
          </ul>
          <Button className="press mt-5 w-full">Get started</Button>
        </article>
      </DemoCard>

      <DemoCard
        label="Stat"
        selection={{
          id: "c-stat", name: "Stat with Trend", category: "Cards",
          variants: ["positive trend"],
          jsx: `<Card>\n  <div>Revenue</div>\n  <div>$12,450</div>\n  <Trend value="+12.4%" />\n</Card>`,
        }}
      >
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Revenue</span>
            <TrendingUp className="h-4 w-4 text-[hsl(var(--success))]" />
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight">$12,450</div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="rounded-md bg-[hsl(var(--success))]/10 px-1.5 py-0.5 font-medium" style={{ color: "hsl(var(--success))" }}>+12.4%</span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
          <svg viewBox="0 0 100 30" className="mt-4 h-12 w-full">
            <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" points="0,22 12,18 24,20 36,14 48,16 60,10 72,12 84,6 100,4" />
          </svg>
        </article>
      </DemoCard>

      <DemoCard
        label="Kanban task"
        selection={{
          id: "c-kanban", name: "Kanban Task Card", category: "Cards",
          variants: ["priority badge", "checklist", "assignee stack", "due date"],
          jsx: `<Card>\n  <PriorityBadge /> <h3>Task title</h3>\n  <Checklist items={tasks} />\n  <Progress />\n  <AvatarStack /> <DueDate />\n</Card>`,
        }}
      >
        <KanbanTaskCard />
      </DemoCard>

      <DemoCard
        label="Timeline"
        selection={{
          id: "c-timeline", name: "Activity Timeline", category: "Cards",
          variants: ["feed", "connector line", "icon badges"],
          jsx: `<ol className="relative pl-6 before:absolute before:left-2.5 before:top-1 before:h-full before:w-px before:bg-border">\n  {events.map(e => <TimelineItem key={e.title} {...e} />)}\n</ol>`,
        }}
      >
        <TimelineCard />
      </DemoCard>

      <DemoCard
        label="Feature"
        selection={{
          id: "c-feature", name: "Feature Card", category: "Cards",
          variants: ["icon + copy"],
          jsx: `<Card>\n  <Icon /> <h3>Feature</h3> <p>Description</p>\n</Card>`,
        }}
      >
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Lightning fast</h3>
          <p className="mt-1 text-sm text-muted-foreground">Components render instantly with zero layout shift, even on slow connections.</p>
        </article>
      </DemoCard>

      <DemoCard
        label="Product"
        selection={{
          id: "c-product", name: "Product Card", category: "Cards",
          variants: ["wishlist toggle", "badge"],
          jsx: `<Card>\n  <Image /> <Badge>New</Badge> <WishlistButton />\n  <Title /> <Price /> <Button>Add to cart</Button>\n</Card>`,
        }}
      >
        <ProductCard />
      </DemoCard>

      <DemoCard
        label="Notification"
        selection={{
          id: "c-notification", name: "Notification Card", category: "Cards",
          variants: ["unread dot", "list"],
          jsx: `<Card>\n  <Bell /> Activity\n  <ul>{notifications.map(...)}</ul>\n</Card>`,
        }}
      >
        <NotificationCard />
      </DemoCard>

      <DemoCard
        label="Testimonial"
        selection={{
          id: "c-testimonial", name: "Testimonial", category: "Cards",
          variants: ["quote + author"],
          jsx: `<Card>\n  <Stars /> <blockquote>...</blockquote> <Author />\n</Card>`,
        }}
      >
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="flex gap-0.5 text-[hsl(var(--warning))]">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
          </div>
          <blockquote className="mt-3 text-sm leading-relaxed">
            "UI Zen saved our design team weeks. We picked a theme, copied the tokens, and shipped a polished dashboard the same week."
          </blockquote>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">AT</div>
            <div className="text-xs">
              <div className="font-medium">Aiko Tanaka</div>
              <div className="text-muted-foreground">CTO, Soylent Corp</div>
            </div>
            <Sparkles className="ml-auto h-4 w-4 text-primary" />
          </div>
        </article>
      </DemoCard>
    </Section>
  );
}

