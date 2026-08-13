---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. This client has already rejected proposals that felt templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take one real aesthetic risk you can justify.

## Ground it in the subject

If the brief does not pin down what the product or subject is, pin it yourself before designing: name one concrete subject, its audience, and the page's single job, and state your choice. If there's any information in your memory about the human's preferences, context about what they're building, or designs you've made before – use that as a hint. The subject's own world, its materials, instruments, artifacts, and vernacular, is where distinctive choices come from. Build with the brief's real content and subject matter throughout.

## Design principles

For web designs, the hero is a thesis. Open with the most characteristic thing in the subject's world, in whatever form makes sense for it: a headline, an image, an animation, a live demo, an interactive moment. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the template answer, only use if that's truly the best option.

Typography carries the personality of the page. Pair the display and body faces deliberately, not the same families you would reach for on any other project, and set a clear type scale with intentional weights, widths, and spacing. Make the type treatment itself a memorable part of the design, not a neutral delivery vehicle for the content.

Structure is information. Structural devices, numbering, eyebrows, dividers, labels, should encode something true about the content, not decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence - like a real process or a typed timeline where order carries information the reader needs. Question if choices like numbered markers actually make sense before incorporating them.

Leverage motion deliberately. Think about where and if animation can serve the subject: a page-load sequence, a scroll-triggered reveal, hover micro-interactions, ambient atmosphere. An orchestrated moment usually lands harder than scattered effects; choose what the direction calls for. However, sometimes less is more, and extra animation contributes to the feeling that the design is AI-generated.

### Zen motion standard

For Zen, motion must be considered relationally: a new component is not done
when its own entrance looks polished; it is done when its entrance, exit, resize,
loading state, and neighboring surfaces form one calm, legible sequence. Avoid
instant appearance, abrupt layout reflow, icon popping, and unrelated timing
between a trigger and the surface it controls. Use the shared app-owned motion
tokens and preference in `src/lib/motion.ts`, stable keys, and coordinated
enter/exit/layout transitions. Keep streaming deltas steady rather than
animating every token. Motion should explain continuity or state, not exist as
decoration; when a transition is intentionally omitted, record that reason in
the component review.

Match complexity to the vision. Maximalist directions need elaborate execution; minimal directions need precision in spacing, type, and detail. Elegance is executing the chosen vision well.

Consider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.

## Process: brainstorm, explore, plan, critique, build, critique again

For calibration: AI-generated design right now clusters around three looks: (1) a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta accent; (2) a near-black background with a single bright acid-green or vermilion accent; (3) a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns. All three are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. Just like a human designer who's hired, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, brainstorm a short design plan based on the human's design brief: create a compact token system with color, type, layout, and signature. Color: describe the palette as 4–6 named hex values. Type: the typefaces for 2+ roles (a characterful display face that's used with restraint, a complementary body face, and a utility face for captions or data if needed). Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Signature: the single unique element this page will be remembered by that embodies the brief in an appropriate way.

Then review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar) rather than a choice made for this specific brief — revise that part, say what you changed and why. Only after you've confirmed the relative uniqueness of your design plan should you start to write the code, following the revised plan exactly and deriving every color and type decision from it.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and a element-based selector like .cta). This can happen often with paddings/margins between sections.

Try to do a lot of this planning and iteration in your thinking, and only show ideas to the user when you have higher confidence it'll delight them.

## Restraint and self-critique

Spend your boldness in one place. Let the signature element be the one memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Not taking a risk can be a risk itself! Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected. Critique your own work as you build, taking screenshots if your environment supports it – a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creators have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Bring the same intentionality to copy that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config. Describe what something does in plain terms rather than selling it. Being specific is always better than being clever.

Use active voice as default. A control should say exactly what happens when it's used: "Save changes," not "Submit." An action keeps the same name through the whole flow, so the button that says "Publish" produces a toast that says "Published." The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the register conversational and tuned: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each element do exactly one job. A label labels, an example demonstrates, and nothing quietly does double duty.

## Zen chat execution UI

Zen's chat is a workbench conversation, not a terminal transcript. Execution UI
should feel like a calm progress ledger:

- Show what matters now: action, target, status, result, and required user
  decision.
- Hide implementation material by default: raw JSON, tool arguments, stdout,
  stderr, event metadata, prompt bodies, stack traces, and full subagent
  transcripts.
- Use disclosures intentionally. "Technical details" is for debugging failures
  or auditing a specific approved action, not for routine successful work.
- Subagents should read as delegated work: who received it, whether it is
  running/completed/failed, and the final summary. Avoid spawn cards, token
  streams, and lifecycle chatter unless the user opens details.
- For successful work, collapse detail aggressively. Surface artifacts, changed
  files, search result summaries, and test/build outcomes only when they help
  the user decide what to do next.

## Premium density and typography contract

Zen must feel premium through restraint, not decoration. The premium quality
comes from typography, spacing, and silence — not from glow, gradient, or
animation volume.

### Reading width and line height

Assistant message prose must be constrained for reading comfort:

- **Max prose width:** 68–72ch. Never stretch assistant text to full viewport.
- **Prose line-height:** 1.6 (generous — users evaluate and trust this content).
- **Code block line-height:** 1.4 (tighter — developers scan code vertically).
- **UI labels / captions:** 1.2–1.3 (compact — information density).
- **Paragraph spacing:** at least 0.75em between paragraphs in assistant prose.

These values create editorial-quality readability without explicit "article"
styling. The typography should make the assistant's output feel considered and
worth reading — not dumped into a container.

### Density modes

Zen uses two density modes within a single chat surface:

| Surface | Density | Spacing | Line-height |
|---|---|---|---|
| Assistant prose | Generous | Comfortable margins, 68ch max | 1.6 |
| Tool execution rows | Compact | Tight rows, monospace data | 1.3 |
| Status / phase badges | Minimal | Single line, dim text | 1.2 |
| Code blocks | Reading-compact | Moderate padding, full width | 1.4 |

The contrast between generous prose and compact execution creates visual
hierarchy without decoration. Prose breathes; execution is dense and efficient.

### Silence as design

The premium aesthetic is defined by what is *not* on screen:

- **Idle = invisible.** Hover/focus action controls (copy, regenerate, retry)
  must take zero layout room when idle. Use `display: none` with a coordinated
  enter transition — not `opacity: 0` reserving space.
- **No decorative borders on message bubbles.** Separation between messages
  comes from vertical spacing and a subtle background tint difference, not
  visible border strokes.
- **Glyph gutters over card chrome for tool rows.** A leading icon (`▸`, `│`,
  `✓`, `⚠`) in an accent color marks a tool row's state. Full surrounding
  card borders are reserved for approval gates and expanded disclosures.
- **One hairline rule between sections** (e.g., between the chat timeline and
  the composer) rather than heavy borders or shadow separation.

### One motion per state

Premium motion is singular and brief:

- Each component gets **one** transition per state change (120–180ms ease-out).
  If something fades in, do not also scale it. If it slides, do not also fade.
- Message mount: a single subtle vertical reveal (4–8px) + opacity.
- Tool card expand/collapse: height + opacity as one coordinated transition.
- Streaming: no motion at all. Text appends silently. The trailing CSS cursor
  is the only visual indicator of activity.
- Decorative animation (pulse, bounce, shake, glow cycles) is never permitted
  on primary content surfaces during normal operation.

### Semantic color budget

Zen's palette must carry meaning, not decoration:

| Color role | Usage | Where |
|---|---|---|
| Primary accent | AI-generated content markers, send button, active focus | Sparingly |
| Success (green) | Completed status, passed tests, successful tools | Status only |
| Error (red) | Failed state, inline errors, destructive warnings | Errors only |
| Warning (amber) | Approval needed, interrupted state, pending review | Gating only |
| Muted foreground | Secondary text, timestamps, collapsed tool summaries | Everywhere quiet |
| Neutral running | In-progress work (spinners, phase labels) | During execution |

Rules:
- Never use accent color for decoration (background washes, gradient fills).
- Never introduce a color that doesn't correspond to a semantic role above.
- If removing a color from an element loses no information, remove it.
- The chat surface should read clearly in grayscale — color is confirmation,
  not the only signal.

### The premium test

Before shipping a chat UI surface, apply this checklist:

- [ ] Can I remove an element without losing function? If yes, remove it.
- [ ] Is there only one transition happening per state change?
- [ ] Do idle messages have zero chrome (no visible buttons, badges, or borders)?
- [ ] Does assistant prose respect the 68ch / 1.6 line-height contract?
- [ ] Are tool rows visually denser than prose without feeling cramped?
- [ ] Does the surface read clearly with animations disabled?
- [ ] Is the accent color used fewer than 5 times on the visible viewport?
