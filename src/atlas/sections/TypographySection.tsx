import { KineticText } from "@/atlas/components/KineticText";
import { DemoCard, Section } from "../Section";

export function TypographySection() {
  return (
    <Section id="typography" title="Typography" description="Type scale, inline elements, gradient text, and scroll-reactive kinetic text.">
      <DemoCard
        label="Kinetic"
        selection={{
          id: "t-kinetic", name: "Kinetic Text", category: "Typography",
          variants: ["scroll-reactive", "character-level"],
          jsx: '<KineticText text="Scroll to animate" />',
        }}
        className="md:col-span-2 xl:col-span-3"
      >
        <div className="flex flex-col items-center justify-center py-20 min-h-[60vh]">
          <KineticText text="Scroll to animate" />
          <p className="mt-6 text-sm text-muted-foreground max-w-md text-center">
            Each character animates with spring physics as it enters the viewport.
            Scroll up and down to see the effect replay.
          </p>
        </div>
      </DemoCard>

      <DemoCard
        label="Gradient text"
        selection={{
          id: "t-gradient", name: "Gradient Text", category: "Typography",
          variants: ["accent", "rainbow", "foreground fade"],
          jsx: `<span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">\n  Gradient headline\n</span>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div className="space-y-5 py-2">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Accent</div>
            <h2
              className="text-4xl font-bold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-accent)" }}
            >
              Build with clarity.
            </h2>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rainbow</div>
            <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500">
              Ship faster today.
            </h2>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Foreground fade</div>
            <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/30">
              Designing systems.
            </h2>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Type scale"
        selection={{
          id: "t-scale", name: "Type Scale", category: "Typography",
          variants: ["display", "h1", "h2", "h3", "body", "small", "caption"],
          jsx: `<h1 className="text-5xl font-bold tracking-tight">Display</h1>\n<h2 className="text-3xl font-semibold">Heading 2</h2>\n<p className="text-base">Body</p>\n<p className="text-xs text-muted-foreground">Caption</p>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <div className="space-y-3">
          {[
            { label: "DISPLAY", cls: "text-5xl font-bold tracking-tight", text: "Build with clarity" },
            { label: "HEADING 1", cls: "text-3xl font-semibold tracking-tight", text: "Designing systems" },
            { label: "HEADING 2", cls: "text-2xl font-semibold", text: "A modern approach" },
            { label: "HEADING 3", cls: "text-xl font-semibold", text: "Section title" },
            { label: "BODY", cls: "text-base", text: "Inter is a versatile UI typeface optimized for screens." },
            { label: "SMALL", cls: "text-sm text-muted-foreground", text: "Supporting copy and helper text." },
            { label: "CAPTION", cls: "text-xs uppercase tracking-wider text-muted-foreground", text: "Metadata · 2 min read" },
          ].map((row) => (
            <div key={row.label} className="grid grid-cols-[80px_1fr] items-baseline gap-4 border-b border-border/40 pb-2 last:border-b-0">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{row.label}</span>
              <span className={row.cls}>{row.text}</span>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        label="Line clamp & truncation"
        selection={{
          id: "t-clamp", name: "Line Clamp & Truncation", category: "Typography",
          variants: ["1-line", "2-line", "3-line", "single truncate"],
          jsx: `<p className="line-clamp-2">Long text…</p>\n<p className="truncate">Long text…</p>`,
        }}
      >
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Single line (truncate)</div>
            <p className="truncate text-foreground">A great design system feels invisible. It removes the small frictions that slow teams down so the energy left can go into the parts of a product only your team can build.</p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">2-line clamp</div>
            <p className="line-clamp-2 text-muted-foreground">A great design system feels invisible. It removes the small frictions that slow teams down — naming things, picking colors, reaching for the closest shadow — so the energy that's left can go into the parts of a product that only your team can build.</p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">3-line clamp</div>
            <p className="line-clamp-3 text-muted-foreground">A great design system feels invisible. It removes the small frictions that slow teams down — naming things, picking colors, reaching for the closest shadow — so the energy that's left can go into the parts of a product that only your team can build. The hardest part isn't choosing the components. It's deciding what to leave out.</p>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Inline elements"
        selection={{
          id: "t-inline", name: "Inline Elements", category: "Typography",
          variants: ["link", "code", "kbd", "mark", "strong", "em"],
          jsx: `<a href="#">Link</a>\n<code>code</code>\n<kbd>⌘K</kbd>\n<mark>highlighted</mark>\n<strong>bold</strong> <em>italic</em>`,
        }}
      >
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            Visit the <a href="#" className="font-medium text-primary underline-offset-4 hover:underline" onClick={(e) => e.preventDefault()}>documentation</a> for guides
            and reference material.
          </p>
          <p>
            Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium shadow-sm">⌘</kbd>
            <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium shadow-sm">K</kbd> to open the command palette.
          </p>
          <p>
            Inline <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary">code</code> snippets and <mark className="rounded bg-yellow-300/30 px-1 text-foreground">highlighted text</mark> blend with copy.
          </p>
          <p>
            Use <strong>bold for emphasis</strong> and <em>italic for nuance</em>. Add <s className="text-muted-foreground">strikethrough</s> for revisions.
          </p>
        </div>
      </DemoCard>

      <DemoCard
        label="Lists"
        selection={{
          id: "t-lists", name: "Lists", category: "Typography",
          variants: ["unordered", "ordered", "description"],
          jsx: `<ul className="list-disc pl-5">\n  <li>Item one</li>\n</ul>\n<ol className="list-decimal pl-5">\n  <li>First step</li>\n</ol>`,
        }}
      >
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unordered</div>
            <ul className="list-disc space-y-1 pl-5 marker:text-primary">
              <li>Drop-in component library</li>
              <li>Theme-able CSS variables</li>
              <li>Keyboard-first interactions</li>
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ordered</div>
            <ol className="list-decimal space-y-1 pl-5 marker:text-primary marker:font-semibold">
              <li>Pick a theme preset</li>
              <li>Copy a component snippet</li>
              <li>Paste into your project</li>
            </ol>
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</div>
            <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Framework</dt><dd className="font-medium">React + Vite</dd>
              <dt className="text-muted-foreground">Styling</dt><dd className="font-medium">Tailwind v3 · CSS vars</dd>
              <dt className="text-muted-foreground">License</dt><dd className="font-medium">MIT</dd>
            </dl>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        label="Blockquote"
        selection={{
          id: "t-blockquote", name: "Blockquote", category: "Typography",
          variants: ["with-citation"],
          jsx: `<blockquote className="border-l-4 border-primary pl-4 italic">\n  "Design is intelligence made visible."\n  <footer>— Alina Wheeler</footer>\n</blockquote>`,
        }}
      >
        <blockquote className="relative rounded-r-lg border-l-4 border-primary bg-muted/30 py-3 pl-4 pr-3">
          <p className="text-base italic leading-relaxed">
            "Design is intelligence made visible. Good systems remove friction so people can focus on the work that matters."
          </p>
          <footer className="mt-2 text-xs text-muted-foreground">
            — Alina Wheeler, <cite className="not-italic font-medium">Designing Brand Identity</cite>
          </footer>
        </blockquote>
      </DemoCard>

      <DemoCard
        label="Reading sample"
        selection={{
          id: "t-reading", name: "Article Sample", category: "Typography",
          variants: ["prose"],
          jsx: `<article className="prose prose-sm max-w-prose">\n  <h2>Section heading</h2>\n  <p>...</p>\n</article>`,
        }}
        className="md:col-span-2 xl:col-span-2"
      >
        <article className="max-w-prose space-y-3 text-sm leading-relaxed">
          <h3 className="text-xl font-semibold tracking-tight">Composing with restraint</h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">By Sarah Chen · 4 min read</p>
          <p>
            A great design system feels invisible. It removes the small frictions that
            slow teams down — naming things, picking colors, reaching for the closest
            shadow — so the energy that's left can go into the parts of a product
            that only your team can build.
          </p>
          <p>
            The hardest part isn't choosing the components. It's deciding what to
            leave out, then defending those decisions when the next deadline hits.
          </p>
        </article>
      </DemoCard>

      <DemoCard
        label="Numerics"
        selection={{
          id: "t-numerics", name: "Tabular Numerals", category: "Typography",
          variants: ["tabular", "currency", "metric"],
          jsx: `<span className="font-mono tabular-nums">$1,284.50</span>`,
        }}
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Revenue", value: "$1,284.50", trend: "+12.4%" },
            { label: "Sessions", value: "48,219", trend: "+3.1%" },
            { label: "Conv. rate", value: "2.84%", trend: "-0.2%" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{m.value}</div>
              <div className={`text-[10px] font-medium tabular-nums ${m.trend.startsWith("+") ? "text-emerald-500" : "text-rose-500"}`}>{m.trend}</div>
            </div>
          ))}
        </div>
      </DemoCard>
    </Section>
  );
}

export default TypographySection;


