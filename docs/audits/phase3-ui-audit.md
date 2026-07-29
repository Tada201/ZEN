# Phase 3 — Chat Inline UI/UX Audit

**Scope:** `ToolCallCard`, `AgentExecutionTrace`, `ExecutionGroup`, `AssistantMessage`

**Date:** 2026-07-25

**Auditor:** thinker-with-files-gemini

**Goal:** Remove overly transparent / glassy backgrounds and inconsistent styling so the chat timeline feels calm, dense, and professional while remaining readable.

---

## Applied Fixes

The following className changes were applied to remove glassy/transparent backgrounds and normalize hover states:

| File | Change |
|---|---|
| `AssistantMessage.tsx` | Premium cards: `bg-background/40 backdrop-blur-md` → `bg-card`, border `border/[0.08]` → `border-border` |
| `AssistantMessage.tsx` | Premium card trigger hover: `hover:bg-card/[0.04]` → `hover:bg-muted` |
| `AssistantMessage.tsx` | Model badge: `bg-primary/20 backdrop-blur-sm text-primary/70` → `bg-muted text-muted-foreground border-border` |
| `AssistantMessage.tsx` | Provider span: `opacity-40 border-primary/20` → `text-muted-foreground border-border` |
| `AssistantMessage.tsx` | Card fallback: `bg-card/20` → `bg-muted` |
| `AssistantMessage.tsx` | Artifact card: `bg-card/40 hover:bg-muted/40` → `bg-card hover:bg-muted` |
| `AssistantMessage.tsx` | Artifact metadata: `text-muted-foreground/60` → `text-muted-foreground` |
| `ExecutionGroup.tsx` | Group card: `bg-card/20 border-border/60` → `bg-card border-border`; hover `bg-muted/30` → `bg-muted` |
| `ToolCallCard.tsx` | Tool card: `bg-background/35 border-border/70` → `bg-card border-border`; hover `bg-muted/35` → `bg-muted` |
| `ToolCallCard.tsx` | Focus ring: `ring-ring/40` → `ring-ring`; added `transition-colors duration-200` |
| `AgentExecutionTrace.tsx` | Trace header: `bg-muted/50 hover:bg-muted/70` → `bg-muted hover:bg-muted/80` |

Validation: `npx tsc --noEmit` passes.

## Findings Summary

| # | Severity | File | Issue | Fix |
|---|---|---|---|---|
| 1 | 🔴 Critical | `AssistantMessage.tsx` | Premium foldable cards use `bg-background/40 backdrop-blur-md` | Use solid `bg-card` |
| 2 | 🔴 Critical | `AssistantMessage.tsx` | Model badge uses `backdrop-blur-sm`, `bg-primary/20`, `opacity-40` provider text | Use `bg-muted` badge + `text-muted-foreground` |
| 3 | 🟠 High | `ExecutionGroup.tsx` | Group card uses `bg-card/20` | Use solid `bg-card` |
| 4 | 🟠 High | `ToolCallCard.tsx` | Tool call card uses `bg-background/35` | Use solid `bg-card` |
| 5 | 🟠 High | `AssistantMessage.tsx` | Artifact card uses `bg-card/40` + `text-muted-foreground/60` | Use solid `bg-card` + `text-muted-foreground` |
| 6 | 🟡 Medium | `AgentExecutionTrace.tsx` | Trace header uses `bg-muted/50` | Use `bg-muted` |
| 7 | 🟡 Medium | `AssistantMessage.tsx` | Card fallback uses `bg-card/20` | Use `bg-muted` |
| 8 | 🟠 High | `ReasoningBlock.tsx` | Reasoning card uses `bg-card/90 border-border/40` | Use solid `bg-card border-border` |
| 9 | 🟠 High | `ReasoningBlock.tsx` | Header uses `bg-muted/5 border-border/25` | Use solid `bg-muted border-border` |
| 10 | 🔴 Critical | `ReasoningBlock.tsx` | Elapsed timer uses `text-muted-foreground/25` | Use `text-muted-foreground` |
| 11 | 🟠 High | `MarkdownContent.tsx` | References grid uses `bg-card/60 border-border/30` | Use solid `bg-card border-border` |
| 12 | 🟠 High | `MarkdownContent.tsx` | Rich block fallback uses `bg-card/90 border-border/30` | Use solid `bg-card border-border` |
| 13 |  Medium | `MarkdownContent.tsx` | Inline code uses `bg-muted/50 text-foreground/80` | Use `bg-muted text-foreground` |
| 14 | 🟡 Medium | `MarkdownContent.tsx` | Table wrapper uses `bg-card/90 border-border/40` | Use solid `bg-card border-border` |
| 15 | 🟠 High | `StreamingSkeleton.tsx` | Skeleton bars use `bg-muted/40` | Use `bg-muted` |
| 16 | 🔴 Critical | `CodeBlock.tsx` | Code block uses `bg-background/30 backdrop-blur-sm border-border/[0.08]` | Use `bg-card border-border` |
| 17 | 🟠 High | `CodeBlock.tsx` | Code block header uses `bg-card/[0.02] border-border/[0.06]` | Use `bg-muted border-border` |
| 18 | 🟠 High | `FileTree.tsx` | File tree card uses `bg-card/90 border-border/40` | Use `bg-card border-border` |
| 19 | 🟠 High | `FileTree.tsx` | File tree header uses `bg-muted/80 border-border/20` | Use `bg-muted border-border` |
| 20 | 🟡 Medium | `MessageList.tsx` | Empty state icon uses `bg-primary/5` | Use `bg-muted` |
| 21 | 🔴 Critical | `DeepResearchRunMessage.tsx` | Research card uses `bg-gradient-to-b from-indigo-500/10 to-transparent backdrop-blur-sm` | Use solid `bg-card` |
| 22 | 🟠 High | `DeepResearchRunMessage.tsx` | Research card uses `border-primary/20` and glow shadow | Use `border-primary` without shadow |
| 23 | 🟠 High | `DeepResearchRunMessage.tsx` | Process step items use `bg-background/20 hover:bg-background/30` | Use `bg-muted hover:bg-muted/80` |
| 24 | 🟡 Medium | `DeepResearchRunMessage.tsx` | Elapsed time badge uses `bg-primary/10 border-primary/20 shadow-[...]` | Use `bg-muted border-border text-primary` |

---

## Detailed Findings

### 1. Premium Foldable Cards (`AssistantMessage.tsx`)

```tsx
<FoldOutCard className="rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md overflow-hidden">
  <FoldOutCardTrigger className="... hover:bg-card/[0.04]">
```

**Problem:** Directly violates "avoid noisy backgrounds, excessive glow, and glassy backgrounds."

**Recommendation:**
```tsx
<FoldOutCard className="rounded-2xl border border-border bg-card overflow-hidden">
  <FoldOutCardTrigger className="... hover:bg-muted/50 transition-colors">
```

### 2. Model Badge (`AssistantMessage.tsx`)

```tsx
<Badge variant="outline" className="... bg-primary/20 backdrop-blur-sm border-primary/20 text-primary/70 hover:bg-primary/30 shadow-sm">
```

**Problem:** Backdrop blur, glow, and reduced text opacity make it look decorative/disabled.

**Recommendation:**
```tsx
<Badge variant="outline" className="... bg-muted text-muted-foreground hover:bg-muted/80 border-transparent">
```

### 3. Execution Group Card (`ExecutionGroup.tsx`)

```tsx
<FoldOutCard open={open} onOpenChange={setOpen} className="... border-border/60 bg-card/20 shadow-sm">
```

**Recommendation:**
```tsx
<FoldOutCard open={open} onOpenChange={setOpen} className="... border-border bg-card shadow-sm">
```

### 4. Tool Call Card (`ToolCallCard.tsx`)

```tsx
<FoldOutCard ... className={cn("... border-border/70 bg-background/35", className)}>
```

**Recommendation:**
```tsx
<FoldOutCard ... className={cn("... border-border bg-card", className)}>
```

Also fix trigger hover/focus:
```tsx
// Old: hover:bg-muted/35 focus-visible:ring-ring/40
// New: hover:bg-muted focus-visible:ring-ring
```

### 5. Artifact Card (`AssistantMessage.tsx`)

```tsx
div className="... border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/40 ..."
```

**Recommendation:**
```tsx
div className="... border-border bg-card p-4 cursor-pointer hover:bg-muted ..."
```

Also fix metadata text:
```tsx
// Old: className="text-[10px] text-muted-foreground/60 ..."
// New: className="text-[10px] text-muted-foreground ..."
```

### 6. Agent Execution Trace Header (`AgentExecutionTrace.tsx`)

```tsx
<FoldOutCardTrigger ... className="... border-border bg-muted/50 ... hover:bg-muted/70">
```

**Recommendation:**
```tsx
<FoldOutCardTrigger ... className="... border-border bg-muted ... hover:bg-muted/80">
```

### 7. Card Fallback Skeleton (`AssistantMessage.tsx`)

```tsx
const CardFallback = () => (
  <div className="... border border-border/30 bg-card/20 ..." />
);
```

**Recommendation:**
```tsx
const CardFallback = () => (
  <div className="... border border-border bg-muted ..." />
);
```

---

## Principles Applied

1. **Calm & dense over glassy** — remove `backdrop-blur` and low-opacity backgrounds.
2. **Semantic surfaces** — use `bg-card`, `bg-muted`, and `bg-background` at full opacity.
3. **Readable contrast** — avoid `text-*/*/60` and `opacity-40` on meaningful labels.
4. **Summary-first timeline** — keep tool cards quiet by default, visible on error/approval.
5. **Consistent hover states** — use `hover:bg-muted` across cards and triggers.
