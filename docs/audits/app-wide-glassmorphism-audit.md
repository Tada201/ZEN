# App-Wide Glassmorphism & Low-Contrast Audit

**Date:** 2026-07-25

**Scope:** All `src/` components outside `src/atlas/components/chat/` (chat timeline was handled in Phase 3).

**Goal:** Identify remaining glassmorphism, semi-transparent surfaces, and low-contrast text that violate the new "Surface & Readability Rules" in `docs/architecture/frontend-rules.md`.

**Method:** Ripgrep search for `backdrop-blur`, low-opacity backgrounds (`bg-*/\d+`), low-opacity borders (`border-*/\d+`), and low-opacity text (`text-*/\d+`).

---

## Summary

| Category | Count | Notes |
|---|---|---|
| `backdrop-blur` usages | ~35 | Many are overlays, modals, or floating panels. Some are on primary content surfaces. |
| Low-opacity backgrounds (`bg-*/\d+`) | 100+ | Widespread in settings, GTSM/Zen widgets, Atlas sections, and GenUI premium cards. |
| Low-opacity borders (`border-*/\d+`) | ~60 | Often paired with glassy backgrounds. |
| Low-opacity text (`text-*/\d+`) | 120+ | Mostly small labels, but some readable content. |

**Key hotspots:**
- `src/components/Zen/*` — telemetry, modals, widgets, terminals
- `src/atlas/components/genui/premium/*` — GenUI cards
- `src/components/GTSM/*` — map/viewport panels
- `src/components/settings/*` — settings panels
- `src/atlas/CommandPalette.tsx` — modal backdrop/card
- `src/atlas/layouts/WorkspaceLayout.tsx` — layout panels
- `src/atlas/components/ModelSelector.tsx` — model selector
- `src/components/ui/*` — shadcn primitives (alerts, dialogs, drawers)

---

## Critical / High Findings

### 1. Command Palette (`src/atlas/CommandPalette.tsx`)

```tsx
// Backdrop glassmorphism
<div className="absolute inset-0 bg-background/50 backdrop-blur-sm" />

// Card border with opacity
<div className="... border border-border/[0.06] bg-card shadow-2xl">

// Header/footer/input borders with opacity
<div className="... border-b border-border/[0.06]">
<kbd className="... border border-border/[0.06]">
<footer className="... border-t border-border/[0.06]">

// Hover state too faint
hover:bg-muted/50
```

**Status:** ✅ Fixed in this audit.

**Recommended fix:**
```tsx
<div className="absolute inset-0 bg-background/80" />
<div className="... border border-border bg-card shadow-2xl">
<div className="... border-b border-border">
<kbd className="... border border-border bg-muted">
<footer className="... border-t border-border">
hover:bg-muted
```

---

### 2. Workspace Layout (`src/atlas/layouts/WorkspaceLayout.tsx`)

```tsx
// Mobile overlay
<button className="... bg-background/60 md:hidden" />

// Resizer handle uses glass + hardcoded dark color
<div className="... border border-border/10 bg-[#0d0d11]/85 backdrop-blur-sm ...">

// Custom glass-panel classes used throughout
className="... glass-panel ..."
className="... glass-panel-activity ..."
className="... glass-panel-strong ..."
```

**Status:** ✅ Fixed.

**Applied fix:**
- Mobile overlay kept as an acceptable modal dim (`bg-background/60`).
- Sidebar/activity bar/status bar: removed `glass-panel`, `glass-panel-activity`, `glass-panel-strong` and replaced with solid `bg-card` and `border-border`.
- Resizer handle: `bg-muted border-border text-muted-foreground` (removed custom `#0d0d11` and `backdrop-blur`).

---

### 3. Model Selector (`src/atlas/components/ModelSelector.tsx`)

```tsx
// Sidebar background tint
<div className="w-64 bg-muted/10 border-r border-border ...">

// Local mode area tint
<div className="px-4 py-3 border-b border-border bg-muted/5">

// Main header background
<div className="p-6 border-b border-border ... bg-card/20">

// Search input
<Input ... className="... bg-muted/30" />

// Model card
selected ? "bg-primary/5 border-primary" : "bg-card/40 border-border/60 hover:border-primary/40 hover:bg-muted/30"
!model.available && "opacity-75 bg-muted/20 border-border/60"

// Metadata badges
text-muted-foreground/70 bg-muted/50 border border-border/40
bg-muted/50 border border-border/40
```

**Recommended fix:**
```tsx
<div className="w-64 bg-muted border-r border-border ...">
<div className="px-4 py-3 border-b border-border bg-muted">
<div className="p-6 border-b border-border ... bg-card">
<Input ... className="... bg-muted" />
selected ? "bg-primary/5 border-primary" : "bg-card border-border hover:border-primary hover:bg-muted"
!model.available && "opacity-75 bg-muted border-border"
```

For metadata badges, use solid `bg-muted border-border text-muted-foreground`.

---

### 4. GenUI Premium Cards (`src/atlas/components/genui/premium/*.tsx`)

Most premium card components use a shared `CardShell` with glassmorphism:

```tsx
// CardShell.tsx
className="w-full rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md shadow-lg overflow-hidden"
```

And individual cards repeat the pattern:
```tsx
className="... border border-border/[0.08] bg-background/30 backdrop-blur-sm ..."
```

**Status:** ✅ Fixed across all premium card components.

**Applied fix:**
```tsx
// CardShell
className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
```

`CardLabel`, `CardValue`, and `CardSection` divider were also de-translucified.

Outer card shells were converted from `bg-background/40 backdrop-blur-md border-border/[0.08]` to solid `bg-card border-border`. Inner surfaces used `bg-muted` and `bg-card`. Low-contrast text like `text-primary-foreground/30` was replaced with `text-muted-foreground`. Template-literal conditionals (ComparisonCard, RecipeCard, etc.) were manually de-translucified.

**Validation:**
- `npx tsc --noEmit` passes.
- Final code-search for `backdrop-blur`, `bg-background/`, `bg-card/[`, `border-[a-z]+/[0-9]`, `text-primary-foreground/[0-9]`, etc. in `src/atlas/components/genui/premium` returned zero matches.

**Affected files:**
- `src/atlas/components/genui/premium/AgentStepCard.tsx`
- `src/atlas/components/genui/premium/BookCard.tsx`
- `src/atlas/components/genui/premium/ChartCard.tsx`
- `src/atlas/components/genui/premium/CitationCard.tsx`
- `src/atlas/components/genui/premium/CodeSnippetCard.tsx`
- `src/atlas/components/genui/premium/ComparisonCard.tsx`
- `src/atlas/components/genui/premium/CurrencyCard.tsx`
- `src/atlas/components/genui/premium/DataRecordCard.tsx`
- `src/atlas/components/genui/premium/DiffCard.tsx`
- `src/atlas/components/genui/premium/DocumentSummaryCard.tsx`
- `src/atlas/components/genui/premium/EventCard.tsx`
- `src/atlas/components/genui/premium/FlashcardComponent.tsx`
- `src/atlas/components/genui/premium/FlightCard.tsx`
- `src/atlas/components/genui/premium/InvoiceCard.tsx`
- `src/atlas/components/genui/premium/JobCard.tsx`
- `src/atlas/components/genui/premium/LinkPreviewCard.tsx`
- `src/atlas/components/genui/premium/MapPinCard.tsx`
- `src/atlas/components/genui/premium/MathCard.tsx`
- `src/atlas/components/genui/premium/MemoryRecallCard.tsx`
- `src/atlas/components/genui/premium/MetricCard.tsx`
- `src/atlas/components/genui/premium/MovieCard.tsx`
- `src/atlas/components/genui/premium/NutritionCard.tsx`
- `src/atlas/components/genui/premium/StatusCard.tsx`
- `src/atlas/components/genui/premium/TimelineCard.tsx`
- `src/atlas/components/genui/premium/TranslationCard.tsx`
- `src/atlas/components/genui/premium/primitives/WorldTimeGlow.tsx`

---

### 5. PremiumCard / GenUI Base (`src/atlas/components/genui/PremiumCard.tsx`, `Map.tsx`)

```tsx
// PremiumCard.tsx
<div className="w-full rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5">
<div className="w-full p-1 rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md ...">

// Map.tsx
<div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-border/50 ...">
```

**Recommended fix:**
```tsx
<div className="w-full rounded-2xl border border-border bg-card p-5">
<div className="... border border-border bg-card ...">
<div className="... bg-card border border-border ...">
```

---

### 6. Zen / GTSM Widgets & HUDs

`src/components/Zen/` and `src/components/GTSM/` use a lot of glassmorphism:

```tsx
// XTermTelemetryDrawer.tsx
<div className="... bg-card/95 backdrop-blur-md ...">
<div className="... bg-muted/20 ...">
<div className="... bg-muted/20 ...">
<div className="... bg-muted/30 hover:bg-muted/60 ...">
<div className="... bg-card/10 ...">

// GlobeWidget.tsx
<div className="bg-card/60 backdrop-blur-md border border-border ...">

// ViewportHUD.tsx, Timeline.tsx, NavigationPanel.tsx, FavoritesPanel.tsx, MapSettingsPanel.tsx, etc.
<div className="... bg-background/45 backdrop-blur-md ...">
<div className="... bg-background/60 backdrop-blur-md ...">
<div className="... bg-card/80 backdrop-blur-md ...">
```

**Recommended fix:**
- Telemetry/terminal drawers: `bg-card border-border` (no blur)
- HUD overlays: `bg-card border-border` or `bg-muted border-border`
- Hover states: `hover:bg-muted` instead of `hover:bg-muted/60`

---

### 7. Modals & Dialogs

```tsx
// AppDialog.tsx
<DialogContent className="... border-border/15 bg-background/95 ... backdrop-blur-xl ...">

// CanvasPreview.tsx
<div className="... bg-background/95 backdrop-blur-sm ...">

// GraphCanvas.tsx
<div className="... bg-card/90 border border-border backdrop-blur-sm ...">

// ToolAuthorizationModal.tsx
<div className="... bg-background/90 backdrop-blur-sm ...">
```

**Status:** ✅ Fixed in `AppDialog.tsx`.

**Applied fix:**
```tsx
<DialogContent className="... border-border bg-background ...">
```
Header/footer borders changed from `border-border/10` to `border-border`.

Remaining modals (`CanvasPreview`, `GraphCanvas`, `ToolAuthorizationModal`) still need attention.

---

### 8. shadcn Primitives (`src/components/ui/`)

```tsx
// alert-dialog.tsx, dialog.tsx, drawer.tsx
"fixed inset-0 z-50 bg-background/80"

// chart.tsx
"... border-border/50 bg-background ..."
```

**Recommended fix:**
```tsx
"fixed inset-0 z-50 bg-background/80" // overlays are acceptable, but remove if combined with blur
```

Note: overlays behind modals/drawers are generally acceptable as decorative surfaces, but should not use `backdrop-blur`.

---

### 9. Settings Panels

```tsx
// SettingsRow.tsx
"group flex flex-col gap-3 border-b border-border/50 px-1 py-4 ..."

// UnderConstructionBanner.tsx
className="... border border-warning/10 bg-warning/[0.02] backdrop-blur-md ... hover:border-warning/20"

// ModelInPageSelector.tsx, WorkbenchSelect.tsx, etc.
className="... bg-muted/50 border-border ..."
className="... bg-muted/20 ..."
```

**Recommended fix:**
```tsx
"group flex flex-col gap-3 border-b border-border px-1 py-4 ..."
className="... border border-warning bg-card ..."
className="... bg-muted border-border ..."
```

---

### 10. Atlas Sections / Demos

```tsx
// CardsSection.tsx
<span className="... bg-background/90 ... backdrop-blur">

// WorkspaceSection.tsx
<div className="... bg-background/80 backdrop-blur-md ...">

// MediaVisualDemos.tsx
<span className="... bg-background/60 ...">

// Lab3DSection.tsx
<div className="... bg-card/85 ... backdrop-blur">
<div className="... bg-background/60 ... backdrop-blur">
```

**Recommended fix:**
```tsx
<span className="... bg-background ...">
<div className="... bg-background border-t border-border ...">
<span className="... bg-card ...">
<div className="... bg-card ...">
```

---

### 11. OpenUI Renderer / Canvas

```tsx
// OpenUIRenderer.tsx
<div className="... border border-border/50 bg-background/80 backdrop-blur-md ...">
<div className="... bg-card/95 border border-border/45 ... backdrop-blur-sm ...">

// OpenUICanvas.tsx
className="... bg-card/5 ... border-border/5 ..."

// DesmosCanvas.tsx
<div className="... bg-background/5 ... backdrop-blur-sm ...">

// InteractiveDrawingCanvas.tsx
<div className="... bg-card/80 backdrop-blur-md ...">
<div className="... bg-card/90 backdrop-blur-xl ... shadow-[...]">
<div className="... bg-card/95 backdrop-blur-2xl ...">
```

**Recommended fix:**
```tsx
<div className="... border border-border bg-background ...">
<div className="... bg-card border border-border ...">
className="... bg-card border border-border ..."
<div className="... bg-background border border-border ...">
<div className="... bg-card border border-border ...">
```

---

## Medium / Low Findings

### Low-Contrast Text

Many small labels use low opacity:

```tsx
text-muted-foreground/50
text-muted-foreground/60
text-muted-foreground/70
text-foreground/80
text-foreground/90
text-primary/60
text-primary/70
text-primary/80
```

**Recommended fix:** Use `text-muted-foreground` or `text-foreground` without opacity modifiers.

---

### Low-Opacity Borders

```tsx
border-border/10
border-border/20
border-border/30
border-border/40
border-border/50
border-border/60
border-primary/20
border-destructive/30
```

**Recommended fix:** Use `border-border` for neutral borders; solid semantic colors (`border-primary`, `border-destructive`) for accent borders.

---

## Exceptions & Allowed Patterns

Per `docs/architecture/frontend-rules.md`:

1. **Overlays behind modals/drawers** — `bg-background/80` without blur is acceptable.
2. **Disabled states** — `opacity-50`, `bg-muted/30`, etc. are allowed to communicate state.
3. **Loading skeletons** — `bg-muted/40`, `animate-pulse` are allowed.
4. **Tiny accent badges/dots** — `bg-primary/10`, `text-primary/70` on small indicators are allowed.
5. **Explicit decorative accents** — subtle glows or tints that do not carry readable content may be allowed, but should be documented.

---

## Fixes Applied

### Zen / GTSM Widgets & HUDs

Applied solid-surface replacements across `src/components/Zen/` and `src/components/GTSM/`.

**Replaced primary-surface glass / opacity:**
- HUD panels (`ViewportHUD`, `Timeline`, `FavoritesPanel`, `TargetInspector`) moved from `bg-background/45 backdrop-blur-md` / `bg-background/55 backdrop-blur-md` to solid `bg-card`.
- `NavigationPanel` removed translucent focus rings (`/40`, `/30`), profile tints borders (`/50`), and route-summary tints (`bg-cyan-400/5`) in favor of `focus:border-cyan-400 focus:ring-cyan-400`, `border-cyan-400`, and `bg-muted`.
- `LayerManager` (Zen and GTSM) replaced `bg-primary/15` with `bg-primary/10` and `hover:bg-muted/50` with `hover:bg-muted`; removed row-level `opacity-60` in favor of explicit `text-muted-foreground`.
- `XTermTelemetryDrawer` removed remaining `hover:bg-destructive/10` and `hover:border-destructive/20` on the clear button in favor of solid `hover:bg-destructive hover:text-destructive-foreground`.
- `ToolAuthorizationModal` replaced low-opacity risk badge borders/backgrounds (`/30`, `/5`) with solid semantic borders and `/10` accent fills.
- `CameraCatalogPanel` replaced `border-amber-300/25 bg-amber-300/10 text-amber-100` with `border-warning bg-warning/10 text-warning`.
- `MapSettingsPanel` replaced `border-rose-400/50 text-rose-200` with `border-destructive text-destructive` and `border-emerald-400/50` with `border-success`.
- `XTermPanel` replaced terminal-specific opacity tints (`bg-code-foreground/10`, `text-code-foreground/60`, etc.) with solid `bg-muted`/`text-muted-foreground` and `bg-code-foreground text-code-background` for the active tab.
- `GeoJsonLayerPanel`, `SearchBar`, and other small components had low-opacity borders (`/80`, `/60`) replaced with solid `border-border` / `border-primary`.

**Validation:**
- `npx tsc --noEmit` passes.
- Final ripgrep for `backdrop-blur|bg-background/|bg-card/|bg-muted/` in `src/components/Zen` and `src/components/GTSM` returned zero matches.

**Files touched:**
- `src/components/GTSM/ViewportHUD.tsx`
- `src/components/GTSM/timeline/Timeline.tsx`
- `src/components/GTSM/favorites/FavoritesPanel.tsx`
- `src/components/GTSM/TargetInspector.tsx`
- `src/components/GTSM/NavigationPanel.tsx`
- `src/components/GTSM/LayerManager.tsx`
- `src/components/GTSM/CameraCatalogPanel.tsx`
- `src/components/GTSM/MapSettingsPanel.tsx`
- `src/components/GTSM/geojson/GeoJsonLayerPanel.tsx`
- `src/components/GTSM/search/SearchBar.tsx`
- `src/components/Zen/LayerManager.tsx`
- `src/components/Zen/XTermTelemetryDrawer.tsx`
- `src/components/Zen/XTermPanel.tsx`
- `src/components/Zen/modals/ToolAuthorizationModal.tsx`

---

## Recommended Next Steps

1. **Fix the shared components first** — `CardShell.tsx`, `AppDialog.tsx`, shadcn primitives, and `WorkspaceLayout.tsx` glass-panel classes will fix many downstream instances.
2. **Batch-fix GenUI premium cards** — they all share the same `CardShell` glassmorphism; updating `CardShell` covers most of them.
3. **Fix Zen/GTSM widgets in a separate pass** — these are highly visual and may need design review to avoid losing their "HUD" feel.
4. **Run the same regex search after fixes** to verify the count of `backdrop-blur` and `/40`, `/30`, `/20` patterns drops significantly.

---

## Validation

After each batch of fixes, run:

```bash
npx tsc --noEmit
```

For the chat-adjacent fixes in this audit, `npx tsc --noEmit` passes.
