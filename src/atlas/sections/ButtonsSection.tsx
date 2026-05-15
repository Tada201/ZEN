import { useState } from "react";
import { ArrowRight, Bold, Check, ChevronDown, Download, Italic, Loader2, Minus, Plus, Strikethrough, Trash2, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MagneticButton } from "@/atlas/components/MagneticButton";
import { DemoCard, Section } from "../Section";

export function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(42);
  const [liked, setLiked] = useState(false);
  const [qty, setQty] = useState(1);

  return (
    <Section id="buttons" title="Buttons" description="The most-used control. Variants, sizes, and states.">
      <DemoCard
        label="Variants"
        selection={{
          id: "b-variants", name: "Button Variants", category: "Buttons",
          variants: ["default", "secondary", "outline", "ghost", "destructive", "link"],
          jsx: `<Button variant="default">Save</Button>\n<Button variant="secondary">Cancel</Button>\n<Button variant="outline">Outline</Button>\n<Button variant="ghost">Ghost</Button>\n<Button variant="destructive">Delete</Button>`,
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Button className="press">Save changes</Button>
          <Button variant="secondary" className="press">Cancel</Button>
          <Button variant="outline" className="press">Outline</Button>
          <Button variant="ghost" className="press">Ghost</Button>
          <Button variant="destructive" className="press">Delete</Button>
          <Button variant="link">Learn more</Button>
        </div>
      </DemoCard>

      <DemoCard
        label="Sizes"
        selection={{
          id: "b-sizes", name: "Button Sizes", category: "Buttons",
          variants: ["sm", "default", "lg", "icon"],
          jsx: `<Button size="sm">Small</Button>\n<Button>Default</Button>\n<Button size="lg">Large</Button>\n<Button size="icon"><Plus /></Button>`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="press">Small</Button>
          <Button className="press">Default</Button>
          <Button size="lg" className="press">Large</Button>
          <Button size="icon" aria-label="Add" className="press"><Plus /></Button>
        </div>
      </DemoCard>

      <DemoCard
        label="With icons"
        selection={{
          id: "b-icons", name: "Buttons with Icons", category: "Buttons",
          variants: ["leading", "trailing", "icon-only"],
          jsx: `<Button><Download /> Export</Button>\n<Button>Continue <ArrowRight /></Button>`,
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Button className="press"><Download />Export</Button>
          <Button variant="secondary" className="press">Continue<ArrowRight /></Button>
          <Button variant="outline" className="press"><Check />Approved</Button>
          <Button variant="destructive" size="icon" aria-label="Delete" className="press"><Trash2 /></Button>
        </div>
      </DemoCard>

      <DemoCard
        label="Loading"
        selection={{
          id: "b-loading", name: "Loading State", category: "Buttons",
          variants: ["idle", "loading"],
          jsx: `<Button disabled={loading}>\n  {loading && <Loader2 className="animate-spin" />} Submit\n</Button>`,
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            className="press"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              setLoading(true);
              setTimeout(() => setLoading(false), 1400);
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Check />}
            {loading ? "Saving…" : "Click to load"}
          </Button>
          <Button variant="outline" disabled className="press">Disabled</Button>
        </div>
      </DemoCard>

      <DemoCard
        label="Count / Like"
        selection={{
          id: "b-count", name: "Count Button", category: "Buttons",
          variants: ["like", "quantity stepper"],
          jsx: `const [liked, setLiked] = useState(false);\n<button onClick={() => setLiked(l => !l)}>\n  ♥ {liked ? count + 1 : count}\n</button>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-4">
          <button
            aria-pressed={liked}
            aria-label={liked ? "Unlike" : "Like"}
            onClick={() => { setLiked((l) => !l); setCount((c) => liked ? c - 1 : c + 1); }}
            className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150 ${liked ? "border-rose-400 bg-rose-500/10 text-rose-500" : "border-border bg-card text-muted-foreground hover:border-rose-300 hover:text-rose-400"}`}
          >
            <span className={`transition-transform ${liked ? "scale-125" : "scale-100"}`} aria-hidden="true">♥</span>
            <span className="tabular-nums">{count}</span>
          </button>
          <div className="inline-flex items-center gap-0 overflow-hidden rounded-lg border border-border">
            <button
              aria-label="Decrease"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="press flex h-9 w-9 items-center justify-center bg-card text-muted-foreground hover:bg-muted"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[2.5rem] bg-muted/30 px-3 py-2 text-center text-sm font-medium tabular-nums">{qty}</span>
            <button
              aria-label="Increase"
              onClick={() => setQty((q) => q + 1)}
              className="press flex h-9 w-9 items-center justify-center bg-card text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Toggle toolbar"
        selection={{
          id: "b-toggle", name: "Toggle / Toolbar", category: "Buttons",
          variants: ["bold", "italic", "underline", "strikethrough"],
          jsx: `<ToggleGroup type="multiple" value={formats} onValueChange={setFormats}>\n  <ToggleGroupItem value="bold" aria-label="Bold"><Bold /></ToggleGroupItem>\n  <ToggleGroupItem value="italic"><Italic /></ToggleGroupItem>\n</ToggleGroup>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="space-y-3">
          <ToggleGroup type="multiple" className="justify-start">
            <ToggleGroupItem value="bold" aria-label="Bold"><Bold className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Italic"><Italic className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label="Underline"><Underline className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="strikethrough" aria-label="Strikethrough"><Strikethrough className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
          <Toggle aria-label="Toggle bold" pressed={false} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <Bold className="h-4 w-4" /> Bold (single)
          </Toggle>
        </div>
      </DemoCard>

      <DemoCard
        label="Social login"
        selection={{
          id: "b-social", name: "Social Login Buttons", category: "Buttons",
          variants: ["GitHub", "Google"],
          jsx: `<Button variant="outline" className="w-full">\n  <GithubIcon /> Continue with GitHub\n</Button>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs space-y-2">
          <button className="press flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.341-3.369-1.341-.454-1.152-1.11-1.459-1.11-1.459-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
            Continue with GitHub
          </button>
          <button className="press flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <div className="relative flex items-center py-1">
            <div className="flex-1 border-t border-border" />
            <span className="mx-3 text-[11px] text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>
          <Button className="press w-full">Sign in with email</Button>
        </div>
      </DemoCard>

      <DemoCard
        label="Group"
        selection={{
          id: "b-group", name: "Button Group", category: "Buttons",
          variants: ["segmented"],
          jsx: `<div className="inline-flex rounded-md border">\n  <Button variant="ghost">Day</Button>\n  <Button variant="ghost">Week</Button>\n  <Button variant="ghost">Month</Button>\n</div>`,
        }}
      >
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {["Day", "Week", "Month", "Year"].map((label, i) => (
            <button
              key={label}
              className={`press px-4 py-2 text-sm font-medium ${i === 1 ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"} ${i > 0 ? "border-l border-border" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              {label}
            </button>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Split"
        selection={{
          id: "b-split", name: "Split Button", category: "Buttons",
          variants: ["primary action + menu"],
          jsx: `<div className="inline-flex">\n  <Button className="rounded-r-none">Save</Button>\n  <DropdownMenu>\n    <DropdownMenuTrigger asChild>\n      <Button className="rounded-l-none border-l border-primary-foreground/20 px-2"><ChevronDown /></Button>\n    </DropdownMenuTrigger>\n  </DropdownMenu>\n</div>`,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-3 py-1">
          <div className="inline-flex">
            <Button className="press rounded-r-none">Save</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="press rounded-l-none border-l border-primary-foreground/30 px-2" aria-label="More save options">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Save</DropdownMenuItem>
                <DropdownMenuItem>Save as draft</DropdownMenuItem>
                <DropdownMenuItem>Save and publish</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="inline-flex">
            <Button variant="outline" className="press rounded-r-none">
              <Download className="h-4 w-4" /> Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="press rounded-l-none border-l-0 px-2" aria-label="Export options">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem>Export as JSON</DropdownMenuItem>
                <DropdownMenuItem>Export as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Full width"
        selection={{
          id: "b-fullwidth", name: "Full-width Buttons", category: "Buttons",
          variants: ["stacked", "primary + secondary"],
          jsx: `<Button className="w-full">Continue</Button>\n<Button variant="outline" className="w-full">Cancel</Button>`,
        }}
      >
        <div className="mx-auto w-full max-w-xs space-y-2">
          <Button className="press w-full">Continue <ArrowRight /></Button>
          <Button variant="outline" className="press w-full">Cancel</Button>
        </div>
      </DemoCard>

      <DemoCard
        label="Magnetic"
        selection={{
          id: "b-magnetic", name: "Magnetic Button", category: "Buttons",
          variants: ["physics-based"],
          jsx: `<MagneticButton>Hover me</MagneticButton>`,
        }}
      >
        <div className="flex flex-wrap gap-3 py-2">
          <MagneticButton className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={(e) => e.stopPropagation()}>
            Hover me
          </MagneticButton>
          <MagneticButton className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium" strength={0.5} onClick={(e) => e.stopPropagation()}>
            Strong pull
          </MagneticButton>
        </div>
      </DemoCard>

      <DemoCard
        label="Premium"
        selection={{
          id: "b-premium", name: "Gradient Button", category: "Buttons",
          variants: ["gradient"],
          jsx: `<Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">\n  Upgrade to Pro\n</Button>`,
        }}
      >
        <button
          className="press inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-accent)", boxShadow: "var(--shadow-accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Check className="h-4 w-4" /> Upgrade to Pro
        </button>
      </DemoCard>
    </Section>
  );
}


