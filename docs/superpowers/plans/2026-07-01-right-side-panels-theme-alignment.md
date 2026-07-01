# Right-Side Panels Theme Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the right-side panels (Agent Orchestrator, Drawing Canvas, Math Plot, XTerm, Memory widget, Sparkline) so all surfaces, accents, borders, and status colors resolve to the existing Zen theme tokens (`--background`, `--card`, `--muted`, `--border`, `--primary`, `--success`, `--warning`, `--destructive`) instead of hardcoded VS Code dark hex and neon green `#00ff9f`.

**Architecture:** Pure token swap on existing files. No new files, no new helpers, no abstraction. Replace hardcoded values with semantic Tailwind classes / `hsl(var(--token))` references. xterm.js terminal core theme stays unchanged (it owns its own color palette). Chrome around xterm gets restyled to use semantic tokens.

**Tech Stack:** React + Tailwind v4 (CSS-variable theming) + framer-motion. No new dependencies.

---

## Theme Token Map (SSOT reference)

From `src/styles/index.css`:

| Token | Dark default | Purpose |
|---|---|---|
| `--background` | 240 10% 6% | Page canvas |
| `--card` | 240 8% 9% | Surface chrome |
| `--muted` | 240 6% 14% | Subtle bg |
| `--muted-foreground` | 240 5% 68% | De-emphasized text |
| `--border` | 240 6% 18% | Hairline |
| `--border-strong` | 240 6% 28% | Heavier hairline |
| `--primary` | 262 83% 65% | Brand accent (replaces neon green) |
| `--success` | 142 65% 50% | Success state |
| `--warning` | 38 92% 55% | Pending / warn state |
| `--destructive` | 0 72% 55% | Fault state |

Status color rules:
- running / in_progress → `text-primary`
- success → `text-success` (or existing `text-green-500` if Tailwind green is preferred — see Task 2)
- pending → `text-warning`
- fault / error → `text-destructive`

`font-mono` stays for code/IDs/status only. Section headers and labels drop to system font.

---

## Task 1: Agent Orchestrator CSS — chrome & status tokens

**Files:**
- Modify: `src/components/widgets/orchestrator/agent-orchestrator.css:1-420`

**Scope:** Replace fixed dark hex with token-based colors. Keep all layout / spacing / sizing rules intact.

- [ ] **Step 1.1 — Replace background / surface hex**

```css
/* Was: #1e1e24, #1b1b20, #18181c, #1e1e1e, #131316
   Now: token-driven */

.agent-orchestrator {
    background: hsl(var(--background));
}

.agent-birds-eye__header,
.live-agent-panel__header,
.agent-workspace__header,
.telemetry-header,
.agent-workspace__footer {
    background: hsl(var(--card));
}

.live-agent-panel {
    background: hsl(var(--card));
}

.agent-card,
.agent-workspace,
.agent-workspace__task-info {
    background: hsl(var(--background));
}

.agent-card:hover {
    background: hsl(var(--muted));
}

.agent-card--active {
    background: hsl(var(--muted));
    border-left-color: hsl(var(--primary));
}

.agent-workspace__telemetry {
    background: hsl(var(--code-background));
}

.chat-bubble-style {
    background: hsl(var(--code-background));
}
```

- [ ] **Step 1.2 — Replace neon-green status indicators with `hsl(var(--primary))`**

```css
/* Was: rgba(0, 255, 159, 0.25 / 0.08 / 0.82)
   Now: token-driven at appropriate alpha */

.live-agent-panel__state--running {
    border-color: hsl(var(--primary) / 0.25);
    background: hsl(var(--primary) / 0.08);
    color: hsl(var(--primary) / 0.9);
}

.live-agent-panel__metric--active span:first-child {
    color: hsl(var(--primary) / 0.9);
}

.live-agent-panel__metric--warn span:first-child {
    color: hsl(var(--warning) / 0.9);
}

.live-agent-panel__tool-status--running {
    background: hsl(var(--primary));
}

.live-agent-panel__tool-status--awaiting_approval {
    background: hsl(var(--warning));
}

.live-agent-panel__tool-status--completed {
    background: hsl(var(--success));
}

.live-agent-panel__tool-status--error {
    background: hsl(var(--destructive));
}

.agent-card__icon,
.agent-card--active,
.agent-card__progress-bar,
.log-entry--status .chat-bubble-style {
    /* All used #00ff9f as accent — switch to primary */
    color: hsl(var(--primary));
    background: hsl(var(--primary));
    border-left-color: hsl(var(--primary));
}
```

- [ ] **Step 1.3 — Tokenize foreground text colors**

Replace remaining `color: #e1e1e1`, `#cccccc`, `#d4d4d4`, `#858585` with `hsl(var(--foreground) / <alpha>)`:

```css
.log-entry__time { color: hsl(var(--muted-foreground)); }
.log-entry__content { color: hsl(var(--foreground) / 0.85); }
.log-entry--bubble .log-entry__content { color: hsl(var(--foreground) / 0.9); }
.log-entry--error .log-entry__content { color: hsl(var(--destructive)); }
.log-entry__type { color: hsl(var(--primary) / 0.8); }
.log-entry--tool_call .log-entry__type { color: hsl(var(--primary) / 0.7); }
.back-button:hover { color: hsl(var(--foreground)); }
```

- [ ] **Step 1.4 — Replace `#2a2d2e` (hover) with `hsl(var(--muted))`**

```css
.agent-card:hover { background: hsl(var(--muted)); }
```

- [ ] **Step 1.5 — Drop blanket `font-mono` on root, keep on log/code only**

```css
/* Remove: font-family: var(--font_mono), monospace; on .agent-orchestrator */
.agent-orchestrator {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    overflow: hidden;
    position: relative;
    /* system font now */
}

/* Keep mono only on log entries */
.log-entry {
    font-family: var(--font_mono), monospace;
    font-size: 10.5px;
    line-height: 1.5;
    /* ...rest unchanged */
}
```

- [ ] **Step 1.6 — Verify file**

Run: `grep -n "#00ff9f\|#1e1e24\|#18181c\|#1b1b20\|#1e1e1e\|#131316\|#2a2d2e" src/components/widgets/orchestrator/agent-orchestrator.css`
Expected: no output (all hardcoded colors replaced).

- [ ] **Step 1.7 — Commit**

```bash
git add src/components/widgets/orchestrator/agent-orchestrator.css
git commit -m "refactor(orchestrator): tokenize chrome and status colors"
```

---

## Task 2: Agent Orchestrator Panel — drop hardcoded Tailwind arbitrary values

**Files:**
- Modify: `src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx:1-431`

- [ ] **Step 2.1 — Remove `text-neon` usage (YAGNI: not in any other file)**

```tsx
// Was: text-neon
// Now: text-primary  (running/in_progress accent)

function StatusBadge({ task }: { task: ActiveAgentTask }) {
    const config = {
        pending: { icon: 'codicon:clock', color: 'text-warning', label: 'PENDING' },
        in_progress: { icon: 'codicon:pulse', color: 'text-primary', label: 'ACTIVE' },
        completed: { icon: 'codicon:check', color: 'text-success', label: 'SUCCESS' },
        failed: { icon: 'codicon:error', color: 'text-destructive', label: 'FAULT' },
    }[task.status];

    return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted border border-border">
            <WorkbenchIcon name={config.icon} size={11} className={config.color} />
            <span className={`text-[11px] font-bold tracking-wider font-mono ${config.color}`}>
                {task.status === 'in_progress' ? (
                    <>RUNNING_<ElapsedTime start={task.startedAt} /></>
                ) : config.label}
            </span>
        </div>
    );
}
```

- [ ] **Step 2.2 — Replace all `text-[#00ff9f]`, `bg-[#00ff9f]`, `border-[#00ff9f]`, `bg-[#18181c]`**

Use `text-primary`, `bg-primary`, `border-primary`, `bg-card`. Replace `text-green-400` (RESOLUTION_PAYLOAD text) with `text-success`, `text-yellow-400` (PENDING_QUEUE header) with `text-warning`.

```tsx
// Birds Eye header (line 71-79)
<WorkbenchIcon name="codicon:dashboard" size={14} className="text-primary" />
<span className="agent-birds-eye__title font-mono tracking-wider">ORCHESTRATOR_DASHBOARD</span>
<div className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
<span className="text-[11px] font-mono text-primary uppercase">{runningTasks.length} ACTIVE</span>

// Section headers (line 106, 121, 136, 151)
<div className="text-[11px] text-primary bg-card font-bold uppercase tracking-wider px-3.5 py-1.5 border-b border-border ...">  // ACTIVE_NODES
<div className="text-[11px] text-warning bg-card ...">  // PENDING_QUEUE
<div className="text-[11px] text-muted-foreground bg-card ...">  // SESSION_ARCHIVE, CROSS_SESSION_REGISTRY

// Workspace task icon (line 189)
<div className="task-item__icon w-7 h-7 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary rounded-md">
    <WorkbenchIcon name={...} size={15} />
</div>

// Mission objective section (line 215, 219, 225-228, 231, 235)
<div className="flex items-center gap-1.5 text-[11px] text-primary uppercase tracking-wider mb-2 font-bold font-mono">  // MISSION_OBJECTIVE
<div className="text-[12px] text-foreground leading-relaxed font-mono p-3 bg-muted border border-border rounded-md">  // task body

<div className="agent-workspace__task-info p-3 px-4 border-b border-border bg-card">
<div className="telemetry-header sticky top-0 bg-card z-20 px-4 py-1.5 border-b border-border flex justify-between items-center">
    <div className="... text-muted-foreground ...">  // TASK_CHRONICLE header
    <div className="text-[11px] font-mono text-primary">  // LOGS counter

// Resolution payload (line 259-265)
<div className="text-[11px] text-success uppercase tracking-wider mb-2 font-bold font-mono flex items-center gap-1.5">
    RESOLUTION_PAYLOAD
</div>
<div className="text-[12px] text-success bg-muted p-3 border border-success/20 rounded-md overflow-auto max-h-[200px] custom-scrollbar font-mono leading-relaxed">

// System fault (line 271-278)
<div className="text-[11px] text-destructive ...">  // header
<div className="text-[12px] text-destructive bg-destructive/10 p-3 border border-destructive/20 rounded-md font-mono leading-relaxed">

// Task card (line 306, 311, 344-345, 350)
<div className={`agent-card__icon w-7 h-7 flex items-center justify-center rounded-md ${isRunning ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
<div className={`agent-card__name text-[11px] font-bold uppercase tracking-wider ${isRunning ? 'text-primary' : 'text-foreground'}`}>
<span className="text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors uppercase tracking-wider">Inspect</span>
<WorkbenchIcon name="codicon:chevron-right" size={10} className="text-muted-foreground group-hover:text-primary transition-all" />
<div className="agent-card__progress-bar absolute bottom-0 left-0 h-[1px] bg-primary motion-safe:animate-pulse" />

// StatusIcon (line 360)
case 'in_progress': return <WorkbenchIcon name="codicon:pulse" size={14} className="text-primary motion-safe:animate-pulse" />;
```

- [ ] **Step 2.3 — Drop the `#131316` background on StatusBadge**

The new `bg-muted` (Step 2.1) replaces this.

- [ ] **Step 2.4 — Verify file**

Run: `grep -n "#00ff9f\|#18181c\|#131316\|#1e1e24\|text-neon" src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx`
Expected: no output.

- [ ] **Step 2.5 — Commit**

```bash
git add src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx
git commit -m "refactor(orchestrator): align panel chrome with theme tokens"
```

---

## Task 3: Live Session panel — tokenize neon references

**Files:**
- Modify: `src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx:1-81`

- [ ] **Step 3.1 — Replace `text-[#00ff9f]` with `text-primary`**

```tsx
<WorkbenchIcon name="codicon:run-all" size={13} className={isStreaming ? "text-primary" : "text-muted-foreground"} />
```

- [ ] **Step 3.2 — Verify file**

Run: `grep -n "#00ff9f" src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx`
Expected: no output.

- [ ] **Step 3.3 — Commit**

```bash
git add src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx
git commit -m "refactor(orchestrator): replace neon in live session panel"
```

---

## Task 4: Interactive Drawing Canvas — tokenize background and chrome

**Files:**
- Modify: `src/components/widgets/workbench/InteractiveDrawingCanvas.tsx:1-396`

- [ ] **Step 4.1 — Replace root backgrounds (`#050505`, `#0A0F0A`)**

```tsx
// Empty state container (line 207)
<div className="flex-1 flex items-center justify-center bg-background font-mono">

// Empty state card (line 211)
<motion.div className="flex flex-col items-center gap-6 p-12 sm:p-16 border border-primary/20 rounded-xl bg-card relative overflow-hidden">
    <WorkbenchIcon name="codicon:edit" size={48} className="text-primary mb-2" />
    <div className="text-center">
        <h2 className="text-2xl font-bold tracking-widest uppercase mb-2">Workspace Offline</h2>
        <p className="text-muted-foreground text-sm font-mono tracking-tighter">INITIALIZE NEW CANVAS TO PROCEED</p>
    </div>
    <WorkbenchButton onClick={() => createCanvas()} className="flex items-center gap-3 px-8 py-3 bg-transparent border border-primary text-primary font-bold text-sm tracking-widest rounded-md hover:bg-primary/10 hover:shadow-[0_0_15px_hsl(var(--primary)/0.3)] active:scale-95 transition-all">
        <WorkbenchIcon name="codicon:add" size={18} />
        GENERATE CANVAS
    </WorkbenchButton>
</motion.div>

// Root canvas container (line 229)
<div className="relative flex flex-col h-full bg-background overflow-hidden group/draw font-mono">
```

- [ ] **Step 4.2 — Restyle top floating HUD (line 232-262)**

```tsx
<motion.div
    className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 bg-card/80 backdrop-blur-md border border-border rounded-xl shadow-2xl animate-fade-in"
>
    <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
        <WorkbenchButton onClick={() => undo(activeCanvasId!)} disabled={!canUndo(activeCanvasId!)} className="p-2 text-primary hover:bg-primary/10 disabled:opacity-20 rounded-lg transition-colors">...</WorkbenchButton>
        <WorkbenchButton onClick={() => redo(activeCanvasId!)} disabled={!canRedo(activeCanvasId!)} className="p-2 text-primary hover:bg-primary/10 disabled:opacity-20 rounded-lg transition-colors">...</WorkbenchButton>
    </div>
    <div className="flex flex-col items-center min-w-[120px]">
        <span className="text-[10px] text-muted-foreground leading-none mb-1">DATASTREAM: {activeCanvasId?.slice(0, 8)}</span>
        <span className="text-xs font-bold text-foreground tracking-widest">{canvasState.name.toUpperCase()}</span>
    </div>
    <div className="flex items-center gap-1 border-l border-border pl-2 ml-2">
        <WorkbenchButton ... className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors">...</WorkbenchButton>
        <WorkbenchButton ... className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors">...</WorkbenchButton>
    </div>
</motion.div>
```

- [ ] **Step 4.3 — Restyle bottom floating ToolHUD (line 291-348)**

```tsx
<motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-2xl px-6">
    <div className="flex items-center gap-2 p-1.5 bg-card/90 backdrop-blur-xl border border-border rounded-2xl shadow-2xl">
        {/* Main Tools */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl border border-border">
            {tools.map(t => (
                <WorkbenchButton
                    key={t.id}
                    onClick={() => setActiveTool(t.id as DrawingToolType)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg transition-all relative ${
                        activeTool === t.id ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                    }`}
                >
                    <WorkbenchIcon name={t.icon} size={18} />
                    <span className="text-[8px] font-bold opacity-50 leading-none">{t.label}</span>
                    {activeTool === t.id && <motion.div layoutId="tool-glow" className="absolute inset-0 rounded-lg border-2 border-primary opacity-50" />}
                </WorkbenchButton>
            ))}
        </div>

        {/* Style Toggles */}
        <div className="flex items-center gap-1 ml-2 border-l border-border pl-2">
            <WorkbenchButton
                onClick={() => setColorPickerOpen(colorPickerOpen === 'stroke' ? null : 'stroke')}
                className={`p-2.5 rounded-lg transition-all ${colorPickerOpen === 'stroke' ? 'bg-primary/20' : 'hover:bg-primary/10'}`}
            >
                <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: toolStyle.stroke }} title="Stroke Color" />
            </WorkbenchButton>
            <WorkbenchButton ...>
                <div className="w-5 h-5 rounded border border-border overflow-hidden relative" style={{ backgroundColor: toolStyle.fill || 'transparent' }} title="Fill Color">
                    {!toolStyle.fill && <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-destructive/40 to-transparent rotate-45" />}
                </div>
            </WorkbenchButton>
            <select
                value={toolStyle.strokeWidth}
                onChange={(e) => setToolStyle({ strokeWidth: Number(e.target.value) })}
                className="bg-transparent text-primary text-xs font-bold px-2 py-1 outline-none appearance-none hover:bg-primary/10 rounded transition-colors"
                title="Stroke Width"
            >
                {STROKE_WIDTHS.map(w => <option key={w} value={w}>{w}PX</option>)}
            </select>
        </div>
    </div>

    <AnimatePresence>
        {colorPickerOpen && (
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                className="absolute bottom-24 p-4 bg-card/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl"
            >
                <div className="grid grid-cols-6 gap-2">
                    {COLOR_PALETTE.map(c => (
                        <WorkbenchButton
                            key={c}
                            onClick={() => { ... }}
                            className={`w-8 h-8 rounded-lg shadow-lg hover:scale-110 transition-transform ${
                                (colorPickerOpen === 'stroke' ? toolStyle.stroke : toolStyle.fill) === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''
                            }`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    {colorPickerOpen === 'fill' && (
                        <WorkbenchButton
                            onClick={() => { setToolStyle({ fill: null }); setColorPickerOpen(null); }}
                            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-destructive/10 hover:border-destructive/50 transition-colors"
                        >
                            <WorkbenchIcon name="codicon:close" size={16} className="text-muted-foreground" />
                        </WorkbenchButton>
                    )}
                </div>
            </motion.div>
        )}
    </AnimatePresence>
</motion.div>
```

- [ ] **Step 4.4 — Restyle viewport info & cursor HUD (line 284-287, 388-393)**

```tsx
{/* Viewport Info */}
<div className="absolute top-6 right-6 flex flex-col items-end gap-1 opacity-40 select-none">
    <span className="text-[10px] text-muted-foreground">ZOOM: {Math.round(zoom * 100)}%</span>
    <span className="text-[10px] text-muted-foreground">POS: {Math.round(panOffset.x)}, {Math.round(panOffset.y)}</span>
</div>

{/* Cursor HUD */}
<div className="absolute bottom-4 right-6 text-[9px] text-muted-foreground flex gap-4 select-none">
```

- [ ] **Step 4.5 — Tokenize the in-canvas grid border stroke**

In the canvas redraw effect (line 89):

```tsx
// Was: ctx.strokeStyle = 'rgba(0, 255, 159, 0.3)';
// Now: read theme primary at runtime via getComputedStyle

const root = getComputedStyle(document.documentElement);
const primary = root.getPropertyValue('--primary').trim() || '262 83% 65%';
// Convert "262 83% 65%" → "hsla(262, 83%, 65%, 0.3)"
ctx.strokeStyle = `hsl(${primary} / 0.3)`;
```

(Add this inside the existing `useEffect` redraw loop, line 71-95, before `ctx.strokeRect`.)

- [ ] **Step 4.6 — Verify file**

Run: `grep -n "#00ff9f\|#00FF9F\|#0A0F0A\|#050505" src/components/widgets/workbench/InteractiveDrawingCanvas.tsx`
Expected: no output.

- [ ] **Step 4.7 — Commit**

```bash
git add src/components/widgets/workbench/InteractiveDrawingCanvas.tsx
git commit -m "refactor(canvas): align drawing canvas with theme tokens"
```

---

## Task 5: Math Plot CSS — tokenize local color variables

**Files:**
- Modify: `src/components/widgets/workbench/math-plot.css:1-855`

- [ ] **Step 5.1 — Replace `:root` overrides with token-based values**

```css
/* Was: --math-bg, --math-sidebar-bg, --math-input-bg, --math-accent, --math-fg
   Now: aliases to theme tokens */

:root {
  --math-bg: hsl(var(--background));
  --math-sidebar-bg: hsl(var(--card));
  --math-input-bg: hsl(var(--muted));
  --math-border: hsl(var(--border));
  --math-border-dim: hsl(var(--border) / 0.5);
  --math-fg: hsl(var(--foreground));
  --math-accent: hsl(var(--primary));
  --math-accent-dim: hsl(var(--primary) / 0.15);
  --math-font: var(--font_mono), monospace;
}
```

- [ ] **Step 5.2 — Replace remaining `rgba(0, 255, 159, 0.05 / 0.15)` and `#2a2d2e` / `#fff` / `#f48771`**

```css
.math-plot__item:hover { background: hsl(var(--muted)); border-color: hsl(var(--border-strong)); }
.math-plot__input { color: hsl(var(--foreground)); }
.math-plot__input:focus { border-color: hsl(var(--primary)); }
.math-plot__error { color: hsl(var(--destructive)); }
.math-plot__action-btn:hover { color: hsl(var(--foreground)); }
.math-plot__action-btn--danger:hover { color: hsl(var(--destructive)); }
.math-plot__spreadsheet-col-input { color: hsl(var(--primary)); }
.math-plot__spreadsheet-col-input:focus { background: hsl(var(--primary) / 0.05); }
.math-plot__spreadsheet-cell-input { color: hsl(var(--foreground)); }
.math-plot__btn--danger:hover { background: hsl(var(--destructive) / 0.1); border-color: hsl(var(--destructive)); color: hsl(var(--destructive)); }
.math-plot__var-name { color: hsl(var(--primary) / 0.7); }
.math-plot__var-range { accent-color: hsl(var(--primary) / 0.7); }
.math-plot__var-range::-webkit-slider-thumb { background: hsl(var(--primary) / 0.7); }
.math-plot__issue { border-color: hsl(var(--destructive) / 0.3); color: hsl(var(--destructive)); }
.math-plot__issue-suggestion { color: hsl(var(--destructive) / 0.7); }
.math-plot__spreadsheet-row-del:hover { color: hsl(var(--destructive)); }
```

- [ ] **Step 5.3 — Verify file**

Run: `grep -n "#00ff9f\|#1e1e24\|#18181c\|#131316\|#2a2d2e\|#f48771" src/components/widgets/workbench/math-plot.css`
Expected: no output (except possibly in comments).

- [ ] **Step 5.4 — Commit**

```bash
git add src/components/widgets/workbench/math-plot.css
git commit -m "refactor(math-plot): tokenize color variables"
```

---

## Task 6: Math Plot TSX — replace neon defaults

**Files:**
- Modify: `src/components/widgets/workbench/MathPlotInterface.tsx:1-300`
- Modify: `src/components/widgets/workbench/MathPlotExpressionItem.tsx:1-120`

- [ ] **Step 6.1 — MathPlotInterface: read theme primary at runtime instead of `#00FF9F`**

```tsx
// At top of file or inside a hook:
const PRIMARY = (() => {
  if (typeof window === 'undefined') return '262 83% 65%';
  return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '262 83% 65%';
})();

// Replace all 4 occurrences of color: '#00FF9F' (lines 174, 188, 196, 206)
// with: color: `hsl(${PRIMARY})`
```

- [ ] **Step 6.2 — MathPlotExpressionItem: tokenize neon defaults**

```tsx
// Lines 55-57, 107 — replace `|| '#00FF9F'` with runtime token:

const accent = (() => {
  if (typeof window === 'undefined') return '262 83% 65%';
  return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '262 83% 65%';
})();
const PRIMARY_HSL = `hsl(${accent})`;

// Use PRIMARY_HSL in inline styles and as the default `<input type="color">` value.
```

- [ ] **Step 6.3 — Verify**

Run: `grep -n "#00FF9F\|#00ff9f" src/components/widgets/workbench/MathPlotInterface.tsx src/components/widgets/workbench/MathPlotExpressionItem.tsx`
Expected: no output.

- [ ] **Step 6.4 — Commit**

```bash
git add src/components/widgets/workbench/MathPlotInterface.tsx src/components/widgets/workbench/MathPlotExpressionItem.tsx
git commit -m "refactor(math-plot): tokenize default accent color"
```

---

## Task 7: Drawing canvas color palette — keep palette, no neon binding

**Files:**
- Modify: `src/components/widgets/workbench/drawingCanvasUtils.ts:1-50`

- [ ] **Step 7.1 — Confirm palette is intentionally user-facing**

The `COLOR_PALETTE` is user-facing brush colors (a swatch picker). It is **not** chrome. Do not change the literal values. The first color happens to be neon green which is a happy accident of the brand palette, not a theme token reference.

- [ ] **Step 7.2 — Verify no theme-token-looking values in this file**

Run: `grep -n "var(--\|hsl(var" src/components/widgets/workbench/drawingCanvasUtils.ts`
Expected: no output.

No code change. Skip commit.

---

## Task 8: Memory widget — replace neon references

**Files:**
- Modify: `src/components/widgets/memory/MemoryStatsWidget.tsx:1-300`

- [ ] **Step 8.1 — Replace `text-[#00ff9f]` with `text-primary`**

```tsx
// Lines 122, 125, 247 — three occurrences
<Cpu size={10} className="text-primary" /> Vector Size
<span className="text-xl font-bold font-mono text-primary tracking-tight">
<span className="font-bold text-primary">{(1 - score).toFixed(3)}</span>
```

- [ ] **Step 8.2 — Verify**

Run: `grep -n "#00ff9f\|#00FF9F" src/components/widgets/memory/MemoryStatsWidget.tsx`
Expected: no output.

- [ ] **Step 8.3 — Commit**

```bash
git add src/components/widgets/memory/MemoryStatsWidget.tsx
git commit -m "refactor(memory-widget): tokenize accent color"
```

---

## Task 9: Sparkline — fallback to primary token instead of neon

**Files:**
- Modify: `src/components/shared/Sparkline.tsx:1-150`

- [ ] **Step 9.1 — Replace literal `#00FF9F` fallback with `hsl(var(--primary))`**

```tsx
// Line 108
// Was: resolvedColor = ... || '#00FF9F';
// Now: resolvedColor = ... || 'hsl(var(--primary))';
```

(Note: Sparkline is rendered through SVG `stroke`/`fill` — these accept CSS color values including `hsl(var(--...))` form. If the runtime injection of `var(...)` fails, fall back to a literal HSL string built from getComputedStyle.)

- [ ] **Step 9.2 — Verify**

Run: `grep -n "#00FF9F\|#00ff9f" src/components/shared/Sparkline.tsx`
Expected: no output.

- [ ] **Step 9.3 — Commit**

```bash
git add src/components/shared/Sparkline.tsx
git commit -m "refactor(sparkline): fallback to theme primary"
```

---

## Task 10: XTermPanel + XTermSessionView — leave xterm core theme, restyle chrome

**Files:**
- Modify: `src/components/Zen/XTermPanel.tsx:1-122`
- Modify: `src/components/Zen/XTermSessionView.tsx:1-163`

- [ ] **Step 10.1 — XTermSessionView: keep terminal theme colors intact**

`XTermSessionView.tsx:53-65` defines xterm's internal palette (background, foreground, green, cyan). These are the *rendered text* colors inside the PTY display. xterm.js requires hex/rgb literals via its `theme` config — `hsl(var(--primary))` strings are not parsed.

**Do not change these hex values.** They are functionally distinct from chrome theme tokens: they represent ANSI palette colors the user sees when programs print colored text in their shell.

- [ ] **Step 10.2 — XTermPanel: align chrome to theme**

The current panel already uses `bg-code-background`, `border-code-border`, `text-code-foreground` — which are themselves semantic tokens. No changes needed if these resolve cleanly. Verify:

Run: `grep -n "#00ff9f\|#1e1e24\|#18181c" src/components/Zen/XTermPanel.tsx`
Expected: no output.

- [ ] **Step 10.3 — Verify both files**

Run: `grep -n "#00ff9f\|#1e1e24\|#18181c\|#0A0F0A" src/components/Zen/XTermPanel.tsx src/components/Zen/XTermSessionView.tsx`
Expected: no output (in panel; xterm core theme in session view is intentionally kept as hex).

- [ ] **Step 10.4 — Commit (only if changes were made)**

If Step 10.2 revealed changes:

```bash
git add src/components/Zen/XTermPanel.tsx src/components/Zen/XTermSessionView.tsx
git commit -m "refactor(xterm): align chrome with theme tokens"
```

Otherwise skip.

---

## Task 11: Final verification — full audit

- [ ] **Step 11.1 — Search all targeted right-side panel files for hardcoded neon/dark hex**

Run:
```bash
grep -rn "#00ff9f\|#00FF9F\|#1e1e24\|#18181c\|#1b1b20\|#1e1e1e\|#0A0F0A\|#050505\|#131316\|#2a2d2e" \
  src/components/widgets/orchestrator/ \
  src/components/widgets/workbench/ \
  src/components/widgets/memory/ \
  src/components/Zen/ \
  src/components/shared/Sparkline.tsx
```

Expected: no output (except maybe `--primary` references in CSS comments).

- [ ] **Step 11.2 — Confirm `text-neon` removed**

Run: `grep -rn "text-neon\|bg-neon" src/`
Expected: no output.

- [ ] **Step 11.3 — TypeScript build check**

Run: `npm run typecheck` (or `pnpm typecheck` — check `package.json`)
Expected: zero errors.

- [ ] **Step 11.4 — Manual visual check (deferred to reviewer)**

Open the right panel, cycle through tabs (Metrics, Artifacts, Terminal, Agents, Drawing). Verify:
- No more hardcoded neon green surfaces.
- Status colors render via `text-primary` (running), `text-success` (done), `text-warning` (pending), `text-destructive` (fault).
- Borders, dividers, hover states use `border-border` / `bg-muted` / `bg-card`.
- Drawing canvas: empty state uses `bg-card`, toolbar uses `bg-card/80` with `border-border`.
- Math Plot: sidebar uses `bg-card`, accent uses `text-primary`.
- XTerm: terminal text colors unchanged, header chrome unchanged.

- [ ] **Step 11.5 — Final commit if any leftover refactor**

```bash
git status
# If anything modified outside the above, address per-file.
```

---

## Out of Scope (deliberately untouched)

- `src/components/Zen/StatusBar.tsx` — uses tokens already.
- `src/components/Zen/XTermTelemetryDrawer.tsx` — uses tokens already.
- `src/components/workbench/cesium/cesiumMapHelpers.ts` — out of scope (map, not panel chrome).
- xterm.js internal `theme` config in `XTermSessionView.tsx` — these are ANSI palette colors, not chrome.
- `drawingCanvasUtils.ts` `COLOR_PALETTE` — user-facing brush swatches, not chrome.
- `Sparkline.tsx` is used by many components; the fallback change is safe but the existing `getComputedStyle` resolution path is left as-is.
