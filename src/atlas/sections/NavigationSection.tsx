import { useState } from "react";
import {
  ChevronRight, Home, Settings, User, CreditCard, Bell,
  LayoutGrid, List, Rows3, Search as SearchIcon, MessageCircle,
  Pencil, Trash2, Copy, Share, ExternalLink, Plus,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { useUIState } from "../providers/UIStateProvider";
import { DemoCard, Section } from "../Section";

export function NavigationSection() {
  const [activeTab, setActiveTab] = useState("account");
  const [activeStep, setActiveStep] = useState(2);
  const [page, setPage] = useState(3);
  const [view, setView] = useState<"grid" | "list" | "rows">("grid");
  const [bottomNav, setBottomNav] = useState("home");
  const { setPaletteOpen } = useUIState();

  const tabs = [
    { id: "account", label: "Account", icon: User },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  const steps = ["Account", "Workspace", "Team", "Billing"];

  return (
    <Section id="navigation" title="Navigation" description="Tabs, breadcrumbs, pagination, context menus, and step indicators.">
      <DemoCard
        label="Tabs"
        selection={{
          id: "n-tabs", name: "Tabs", category: "Navigation",
          variants: ["underline", "pills"],
          jsx: `<Tabs defaultValue="account">\n  <TabsList>\n    <TabsTrigger value="account">Account</TabsTrigger>\n  </TabsList>\n</Tabs>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {activeTab === "account" && "Manage your profile settings and preferences."}
            {activeTab === "billing" && "View invoices, update payment methods, and manage subscriptions."}
            {activeTab === "notifications" && "Choose how and when you receive alerts."}
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Breadcrumbs"
        selection={{
          id: "n-breadcrumb", name: "Breadcrumbs", category: "Navigation",
          variants: ["simple", "with-icons"],
          jsx: `<Breadcrumb>\n  <BreadcrumbItem>Home</BreadcrumbItem>\n  <BreadcrumbSeparator />\n  <BreadcrumbItem>Settings</BreadcrumbItem>\n</Breadcrumb>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 text-sm">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Settings</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">Account</span>
        </div>
      </DemoCard>

      <DemoCard
        label="Stepper"
        selection={{
          id: "n-stepper", name: "Stepper", category: "Navigation",
          variants: ["horizontal", "numbered"],
          jsx: `<Stepper steps={steps} current={2} />`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => setActiveStep(i + 1)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                  i + 1 <= activeStep ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {i + 1 < activeStep ? "✓" : i + 1}
              </button>
              <span className={`text-xs font-medium ${i + 1 <= activeStep ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <div className={`h-px w-8 ${i + 1 < activeStep ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Pagination"
        selection={{
          id: "n-pagination", name: "Pagination", category: "Navigation",
          variants: ["numbered", "simple"],
          jsx: `<Pagination>\n  <PaginationPrevious />\n  <PaginationItem>1</PaginationItem>\n  <PaginationNext />\n</Pagination>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} className="press inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted">‹</button>
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`press inline-flex h-8 w-8 items-center justify-center rounded-md text-sm ${
                page === p ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
              }`}
            >
              {p}
            </button>
          ))}
          <button onClick={() => setPage(Math.min(5, page + 1))} className="press inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm hover:bg-muted">›</button>
        </div>
      </DemoCard>

      <DemoCard
        label="Context menu"
        selection={{
          id: "n-context", name: "Context Menu (right-click)", category: "Navigation",
          variants: ["with sub-menu", "with shortcuts"],
          jsx: `<ContextMenu>\n  <ContextMenuTrigger>Right-click here</ContextMenuTrigger>\n  <ContextMenuContent>\n    <ContextMenuItem>Edit<ContextMenuShortcut>⌘E</ContextMenuShortcut></ContextMenuItem>\n    <ContextMenuSub>\n      <ContextMenuSubTrigger>More</ContextMenuSubTrigger>\n      <ContextMenuSubContent>...</ContextMenuSubContent>\n    </ContextMenuSub>\n  </ContextMenuContent>\n</ContextMenu>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <ContextMenu>
            <ContextMenuTrigger className="flex h-32 w-full cursor-context-menu items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-center text-sm text-muted-foreground select-none">
              Right-click (or long-press) anywhere in this area
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              <ContextMenuItem>
                <Pencil className="mr-2 h-4 w-4" /> Edit
                <ContextMenuShortcut>⌘E</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                <Copy className="mr-2 h-4 w-4" /> Copy
                <ContextMenuShortcut>⌘C</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Share className="mr-2 h-4 w-4" /> Share
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-40">
                  <ContextMenuItem>
                    <ExternalLink className="mr-2 h-4 w-4" /> Copy link
                  </ContextMenuItem>
                  <ContextMenuItem>Email</ContextMenuItem>
                  <ContextMenuItem>Slack</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
                <ContextMenuShortcut>⌫</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </DemoCard>

      <DemoCard
        label="Sidebar"
        selection={{
          id: "n-sidebar", name: "Sidebar Navigation", category: "Navigation",
          variants: ["with-icons", "collapsible"],
          jsx: `<Sidebar>\n  <SidebarItem icon={Home}>Home</SidebarItem>\n  <SidebarItem icon={Settings}>Settings</SidebarItem>\n</Sidebar>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[200px] space-y-0.5">
          {[
            { label: "Dashboard", icon: Home, active: true },
            { label: "Account", icon: User, active: false },
            { label: "Billing", icon: CreditCard, active: false },
            { label: "Settings", icon: Settings, active: false },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  item.active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>
      </DemoCard>

      <DemoCard
        label="Segmented"
        selection={{
          id: "n-segmented", name: "Segmented Control", category: "Navigation",
          variants: ["icon", "icon+text"],
          jsx: `<SegmentedControl value={view} onChange={setView}>\n  <Segment value="grid"><LayoutGrid /></Segment>\n</SegmentedControl>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <div role="radiogroup" aria-label="View mode" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {([
              { id: "grid", icon: LayoutGrid, label: "Grid" },
              { id: "list", icon: List, label: "List" },
              { id: "rows", icon: Rows3, label: "Rows" },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const active = view === opt.id;
              return (
                <button
                  key={opt.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setView(opt.id)}
                  className={`press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{view}</span>
          </p>
        </div>
      </DemoCard>

      <DemoCard
        label="Dropdown menu"
        selection={{
          id: "n-dropdown", name: "Dropdown Menu", category: "Navigation",
          variants: ["with shortcuts", "with separators"],
          jsx: `<DropdownMenu>\n  <DropdownMenuTrigger asChild><Button>Menu</Button></DropdownMenuTrigger>\n  <DropdownMenuContent>\n    <DropdownMenuItem>Profile<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut></DropdownMenuItem>\n  </DropdownMenuContent>\n</DropdownMenu>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="press">Open menu <ChevronRight className="h-3.5 w-3.5 rotate-90" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="h-4 w-4" /> Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard className="h-4 w-4" /> Billing
                <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="h-4 w-4" /> Settings
                <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DemoCard>

      <DemoCard
        label="Command trigger"
        selection={{
          id: "n-command", name: "Command Trigger", category: "Navigation",
          variants: ["with kbd"],
          jsx: `<button onClick={openPalette}>\n  <Search /> Search… <kbd>⌘K</kbd>\n</button>`,
        }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPaletteOpen(true); }}
          className="press flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <SearchIcon className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search components, themes…</span>
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </DemoCard>

      <DemoCard
        label="FAB"
        selection={{
          id: "n-fab", name: "Floating Action Button", category: "Navigation",
          variants: ["primary", "extended"],
          jsx: `<button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">\n  <Plus />\n</button>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="relative h-36 overflow-hidden rounded-lg border border-border bg-muted/20">
          <div className="p-4 text-xs text-muted-foreground">Page content area</div>
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg"
              style={{ boxShadow: "var(--shadow-accent)" }}
            >
              <Plus className="h-4 w-4" /> New item
            </button>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Mobile bottom nav"
        selection={{
          id: "n-bottom", name: "Bottom Navigation", category: "Navigation",
          variants: ["icon+label", "active dot"],
          jsx: `<nav className="grid grid-cols-4">\n  <button aria-current="page"><Home /></button>\n</nav>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="aspect-[9/16] max-h-[260px] bg-gradient-to-br from-muted/40 to-muted/10 p-3">
            <div className="h-full rounded-xl border border-dashed border-border" />
          </div>
          <nav aria-label="Bottom" className="grid grid-cols-4 border-t border-border">
            {([
              { id: "home", icon: Home, label: "Home" },
              { id: "search", icon: SearchIcon, label: "Search" },
              { id: "messages", icon: MessageCircle, label: "Inbox" },
              { id: "me", icon: User, label: "Me" },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const active = bottomNav === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setBottomNav(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={`press relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                  {active && <span className="absolute -top-px h-0.5 w-8 rounded-full bg-primary" />}
                </button>
              );
            })}
          </nav>
        </div>
      </DemoCard>

      <DemoCard
        label="Anchor"
        selection={{
          id: "n-anchor", name: "Table of Contents", category: "Navigation",
          variants: ["sticky"],
          jsx: `<nav className="sticky top-20">\n  <a href="#intro">Introduction</button>\n</nav>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2 text-sm">
          {["Introduction", "Getting Started", "Components", "Theming", "API Reference"].map((item, i) => (
            <button key={item} role="button" className={`block ${i === 1 ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {item}
            </button>
          ))}
        </div>
      </DemoCard>
    </Section>
  );
}
