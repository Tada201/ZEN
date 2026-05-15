import { useState } from "react";
import { ChevronDown, GripVertical, CalendarDays, Info, User, Settings, Activity } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DemoCard, Section } from "../Section";

/* ── Tab panel card data ── */
const TAB_PROFILE = {
  name: "Sarah Chen",
  role: "Design Lead · Acme Inc.",
  bio: "Building design systems that scale. Open source contributor. Figma fanatic. She/her.",
  stats: [{ label: "Projects", value: "24" }, { label: "Followers", value: "1.4k" }, { label: "Stars", value: "382" }],
};

const TAB_ACTIVITY = [
  { icon: "✏️", text: "Updated button variants", time: "2h ago" },
  { icon: "💬", text: "Commented on PR #284", time: "5h ago" },
  { icon: "⭐", text: "Starred radix-ui/primitives", time: "Yesterday" },
  { icon: "🚀", text: "Published @acme/ui v1.2", time: "2 days ago" },
];

const TAB_SETTINGS_ITEMS = [
  { label: "Display name", value: "Sarah Chen" },
  { label: "Handle", value: "@sarah" },
  { label: "Email", value: "sarah@acme.com" },
  { label: "Role", value: "Design Lead" },
];

/* ── Scroll area items ── */
const NOTIF_ITEMS = [
  { icon: "💬", title: "New comment on your PR", sub: "Marcus left a review · 2m ago", unread: true },
  { icon: "✅", title: "CI checks passed", sub: "main branch · 15m ago", unread: true },
  { icon: "🎉", title: "Issue ATL-42 closed", sub: "Done by Aiko · 1h ago", unread: true },
  { icon: "📌", title: "Mentioned in #design", sub: "Sarah tagged you · 2h ago", unread: false },
  { icon: "🔔", title: "Weekly digest ready", sub: "Read your summary · Yesterday", unread: false },
  { icon: "⭐", title: "Project starred", sub: "3 new stars on ui-Zen · Yesterday", unread: false },
  { icon: "🚀", title: "Deploy succeeded", sub: "ui-Zen v1.2 live · 2 days ago", unread: false },
  { icon: "👋", title: "New team member", sub: "Elena joined Acme · 3 days ago", unread: false },
  { icon: "📊", title: "Monthly report", sub: "April stats available · 4 days ago", unread: false },
  { icon: "🔒", title: "Security update", sub: "deps patched · 5 days ago", unread: false },
];

export function SurfacesSection() {
  const [openItems, setOpenItems] = useState<string[]>(["item-1"]);
  const toggle = (id: string) => {
    setOpenItems((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  /* Tab panel */
  const [activeTab, setActiveTab] = useState<"profile" | "activity" | "settings">("profile");

  return (
    <Section id="surfaces" title="Surfaces & Layouts" description="Accordions, separators, aspect ratios, and grid systems.">

      {/* ── Accordion ── */}
      <DemoCard
        label="Accordion"
        selection={{
          id: "s-accordion", name: "Accordion", category: "Surfaces",
          variants: ["single", "multiple"],
          jsx: `<Accordion type="single" collapsible>\n  <AccordionItem value="item-1">\n    <AccordionTrigger>Is it accessible?</AccordionTrigger>\n    <AccordionContent>Yes.</AccordionContent>\n  </AccordionItem>\n</Accordion>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="divide-y divide-border rounded-lg border border-border">
          {[
            { id: "item-1", q: "Is it accessible?", a: "Yes. It adheres to the WAI-ARIA design pattern for accordions and supports keyboard navigation." },
            { id: "item-2", q: "Can I use it in production?", a: "Absolutely. Every component is built on Radix UI primitives with full TypeScript support." },
            { id: "item-3", q: "Is it customizable?", a: "Yes. All colors, radii, and shadows are controlled via CSS variables." },
          ].map((item) => (
            <div key={item.id}>
              <button
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
                aria-expanded={openItems.includes(item.id)}
              >
                {item.q}
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openItems.includes(item.id) ? "rotate-180" : ""}`} />
              </button>
              {openItems.includes(item.id) && (
                <div className="px-4 pb-3 text-sm text-muted-foreground">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </DemoCard>

      {/* ── Tab panel card ── */}
      <DemoCard
        label="Tab panel card"
        selection={{
          id: "s-tabcard", name: "Tab Panel Card", category: "Surfaces",
          variants: ["profile", "activity", "settings"],
          jsx: `<div className="rounded-xl border">\n  <div className="flex border-b">\n    <TabTrigger active={tab==="profile"} onClick={() => setTab("profile")}>Profile</TabTrigger>\n  </div>\n  <div className="p-4">{tabContent}</div>\n</div>`,
        }}
        className="md:col-span-2 xl:col-span-1"
      >
        <div onClick={(e) => e.stopPropagation()} className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {([
              { id: "profile", label: "Profile", icon: User },
              { id: "activity", label: "Activity", icon: Activity },
              { id: "settings", label: "Settings", icon: Settings },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === id
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === "profile" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>
                    SC
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{TAB_PROFILE.name}</div>
                    <div className="text-xs text-muted-foreground">{TAB_PROFILE.role}</div>
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">{TAB_PROFILE.bio}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-2 text-center">
                  {TAB_PROFILE.stats.map((s) => (
                    <div key={s.label}>
                      <div className="text-sm font-bold">{s.value}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "activity" && (
              <ul className="space-y-2">
                {TAB_ACTIVITY.map((ev) => (
                  <li key={ev.text} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">{ev.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{ev.text}</div>
                      <div className="text-[10px] text-muted-foreground">{ev.time}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {activeTab === "settings" && (
              <dl className="divide-y divide-border text-xs">
                {TAB_SETTINGS_ITEMS.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </DemoCard>

      {/* ── Scroll area ── */}
      <DemoCard
        label="Scroll area"
        selection={{
          id: "s-scroll", name: "Scroll Area", category: "Surfaces",
          variants: ["fixed-height", "custom-scrollbar"],
          jsx: `<ScrollArea className="h-52 rounded-lg border">\n  {items.map(item => <NotifRow key={item.title} {...item} />)}\n</ScrollArea>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Notifications</div>
            <Badge variant="outline" className="text-[10px]">{NOTIF_ITEMS.filter((n) => n.unread).length} unread</Badge>
          </div>
          <ScrollArea className="h-48 rounded-lg border border-border">
            <div className="divide-y divide-border">
              {NOTIF_ITEMS.map((item, i) => (
                <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 ${item.unread ? "bg-primary/[0.03]" : ""}`}>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm">{item.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs ${item.unread ? "font-semibold" : "font-medium text-muted-foreground"}`}>{item.title}</div>
                    <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                  </div>
                  {item.unread && <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </div>
              ))}
            </div>
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground">Radix ScrollArea — consistent cross-browser, accessible scrollbar.</p>
        </div>
      </DemoCard>

      {/* ── Aspect Ratios ── */}
      <DemoCard
        label="Aspect Ratios"
        selection={{
          id: "s-aspect", name: "Aspect Ratio", category: "Surfaces",
          variants: ["16:9", "4:3", "1:1", "3:4"],
          jsx: `<div className="aspect-video rounded-lg bg-muted" />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-4 gap-2">
          {[
            { label: "16:9", cls: "aspect-video" },
            { label: "4:3", cls: "aspect-[4/3]" },
            { label: "1:1", cls: "aspect-square" },
            { label: "3:4", cls: "aspect-[3/4]" },
          ].map((r) => (
            <div key={r.label} className="space-y-1 text-center">
              <div className={`w-full rounded-lg border border-border bg-muted ${r.cls}`} />
              <span className="text-[10px] text-muted-foreground">{r.label}</span>
            </div>
          ))}
        </div>
      </DemoCard>

      {/* ── Grid Layouts ── */}
      <DemoCard
        label="Grid Layouts"
        selection={{
          id: "s-grid", name: "Grid Layouts", category: "Surfaces",
          variants: ["2-col", "3-col", "4-col", "masonry"],
          jsx: `<div className="grid grid-cols-3 gap-4">\n  <div />\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-md border border-border bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-md border border-border bg-muted" />
            ))}
          </div>
          <p className="text-center text-[10px] text-muted-foreground">Responsive grid systems with consistent gap spacing.</p>
        </div>
      </DemoCard>

      {/* ── Split Layout ── */}
      <DemoCard
        label="Split Layout"
        selection={{
          id: "s-split", name: "Split Layout", category: "Surfaces",
          variants: ["sidebar+main", "holy-grail"],
          jsx: `<div className="flex">\n  <aside className="w-64" />\n  <main className="flex-1" />\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex h-28 gap-2 rounded-lg border border-border p-2">
          <div className="w-1/3 rounded-md bg-muted" />
          <div className="flex-1 rounded-md bg-muted/50" />
        </div>
      </DemoCard>

      {/* ── Separators ── */}
      <DemoCard
        label="Separators"
        selection={{
          id: "s-sep", name: "Separators", category: "Surfaces",
          variants: ["horizontal", "vertical"],
          jsx: `<Separator />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div className="text-sm">Section A</div>
          <div className="h-px w-full bg-border" />
          <div className="text-sm">Section B</div>
          <div className="flex h-8 items-center gap-3">
            <span className="text-sm">Left</span>
            <div className="h-full w-px bg-border" />
            <span className="text-sm">Right</span>
          </div>
        </div>
      </DemoCard>

      {/* ── Drawer ── */}
      <DemoCard
        label="Drawer"
        selection={{
          id: "s-drawer", name: "Bottom Drawer", category: "Surfaces",
          variants: ["bottom"],
          jsx: `<Drawer>\n  <DrawerTrigger asChild><Button>Open</Button></DrawerTrigger>\n  <DrawerContent>...</DrawerContent>\n</Drawer>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center py-4">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="press">Open drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="mx-auto w-full max-w-md">
                <DrawerHeader>
                  <DrawerTitle>Edit profile</DrawerTitle>
                  <DrawerDescription>Make tweaks to your public profile here.</DrawerDescription>
                </DrawerHeader>
                <div className="space-y-3 px-4 pb-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="drawer-name">Name</Label>
                    <Input id="drawer-name" defaultValue="Sarah Chen" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="drawer-handle">Handle</Label>
                    <Input id="drawer-handle" defaultValue="@sarah" />
                  </div>
                </div>
                <DrawerFooter>
                  <Button>Save changes</Button>
                  <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </DemoCard>

      {/* ── Popover ── */}
      <DemoCard
        label="Popover"
        selection={{
          id: "s-popover", name: "Popover", category: "Surfaces",
          variants: ["form", "menu"],
          jsx: `<Popover>\n  <PopoverTrigger asChild><Button>Open</Button></PopoverTrigger>\n  <PopoverContent>...</PopoverContent>\n</Popover>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center py-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="press">
                <CalendarDays className="h-4 w-4" /> Pick date range
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold">Date range</h4>
                  <p className="text-xs text-muted-foreground">Filter results by date.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="from" className="text-xs">From</Label>
                    <Input id="from" type="date" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="to" className="text-xs">To</Label>
                    <Input id="to" type="date" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost">Clear</Button>
                  <Button size="sm">Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </DemoCard>

      {/* ── Hover card ── */}
      <DemoCard
        label="Hover card"
        selection={{
          id: "s-hovercard", name: "Hover Card", category: "Surfaces",
          variants: ["profile", "info"],
          jsx: `<HoverCard>\n  <HoverCardTrigger>@sarah</HoverCardTrigger>\n  <HoverCardContent>...</HoverCardContent>\n</HoverCard>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <span>Mentioned by</span>
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <button className="press inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10">
                @sarah
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground" style={{ background: "var(--gradient-accent)" }}>SC</div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold">Sarah Chen</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">Design lead at Acme. Building UI Zen.</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex h-3 w-3 items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
                    </span> @sarahchen
                    <span className="ml-1 inline-flex h-3 w-3 items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.341-3.369-1.341-.454-1.152-1.11-1.459-1.11-1.459-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
                    </span> sarahc
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          <span>and 3 others.</span>
          <div className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Hover to preview
          </div>
        </div>
      </DemoCard>

      {/* ── Resizable ── */}
      <DemoCard
        label="Resizable"
        selection={{
          id: "s-resizable", name: "Resizable Panels", category: "Surfaces",
          variants: ["horizontal", "with handle"],
          jsx: `<ResizablePanelGroup direction="horizontal">\n  <ResizablePanel defaultSize={30} />\n  <ResizableHandle withHandle />\n  <ResizablePanel />\n</ResizablePanelGroup>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="h-32 overflow-hidden rounded-lg border border-border">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={30} minSize={20} className="bg-muted/40">
              <div className="flex h-full items-center justify-center text-xs font-medium text-muted-foreground">Sidebar</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70} className="bg-card">
              <div className="flex h-full items-center justify-center text-xs font-medium text-muted-foreground">Main · drag the handle</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </DemoCard>

      {/* ── Sortable ── */}
      <DemoCard
        label="Sortable"
        selection={{
          id: "s-sortable", name: "Sortable List", category: "Surfaces",
          variants: ["drag handle"],
          jsx: `<div className="flex items-center gap-2">\n  <GripVertical />\n  <span>Item</span>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-1">
          {["First item", "Second item", "Third item"].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {item}
            </div>
          ))}
        </div>
      </DemoCard>
    </Section>
  );
}

