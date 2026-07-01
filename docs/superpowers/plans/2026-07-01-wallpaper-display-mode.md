# Wallpaper Display Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wallpaper display mode options while keeping `Fill screen` as default behavior that covers the full app viewable section.

**Architecture:** Extend existing settings store/schema/bridge path with one field: `backgroundFit`. Render maps that field to CSS `background-size` and `background-repeat` in `WorkspaceBackground`. Existing GUI appearance tab gets one dropdown; no new store or dependency.

**Tech Stack:** React, TypeScript, Zustand, Zod, existing settings bridge, Node verifier script.

---

### Task 1: Regression Contract

**Files:**
- Modify: `test/verify-background-image-settings.mjs`

- [ ] **Step 1: Add failing assertions**

Add these assertions after existing background blur assertion:

```js
assert.match(mapper, /backgroundFit:\s*"ui\.background-fit"/, 'backgroundFit must persist to ui.background-fit');
assert.match(background, /backgroundFit/, 'WorkspaceBackground must read wallpaper display mode');
assert.match(background, /backgroundSize/, 'WorkspaceBackground must set CSS backgroundSize');
assert.match(background, /backgroundRepeat/, 'WorkspaceBackground must set CSS backgroundRepeat');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/verify-background-image-settings.mjs
```

Expected: FAIL with `backgroundFit must persist to ui.background-fit`.

---

### Task 2: Settings State And Persistence

**Files:**
- Modify: `src/lib/stores/settings/types.ts`
- Modify: `src/lib/stores/settings/schema.ts`
- Modify: `src/lib/stores/settings/createInterfaceSlice.ts`
- Modify: `src/lib/stores/settings/settingsBridge.ts`
- Modify: `src/lib/stores/settingsMapper.ts`

- [ ] **Step 1: Add type and setter**

In `src/lib/stores/settings/types.ts`, add:

```ts
export type BackgroundFit = "cover" | "contain" | "stretch" | "original" | "tile";
```

Add field and setter to `InterfaceSlice`:

```ts
backgroundFit: BackgroundFit;
setBackgroundFit: (fit: BackgroundFit) => void;
```

- [ ] **Step 2: Add schema default**

In `src/lib/stores/settings/schema.ts`, add near background fields:

```ts
backgroundFit: z.enum(["cover", "contain", "stretch", "original", "tile"]).default("cover"),
```

- [ ] **Step 3: Add slice default and setter**

In `src/lib/stores/settings/createInterfaceSlice.ts`, import type:

```ts
import type { SettingsState, InterfaceSlice, BackgroundFit } from "./types";
```

Add default:

```ts
backgroundFit: "cover",
```

Add setter:

```ts
setBackgroundFit: (fit: BackgroundFit) => {
  get().updateSetting("backgroundFit", fit);
},
```

- [ ] **Step 4: Add bridge mapping**

In `src/lib/stores/settings/settingsBridge.ts`, add:

```ts
"ui.background-fit": { field: "backgroundFit", type: "string" },
```

- [ ] **Step 5: Add SQLite mapper override**

In `src/lib/stores/settingsMapper.ts`, add:

```ts
backgroundFit: "ui.background-fit",
```

---

### Task 3: Renderer CSS Mapping

**Files:**
- Modify: `src/components/workbench/WorkspaceBackground.tsx`

- [ ] **Step 1: Add display style helper**

Add:

```ts
function getBackgroundDisplayStyle(fit: string): Pick<React.CSSProperties, "backgroundSize" | "backgroundRepeat"> {
  switch (fit) {
    case "contain":
      return { backgroundSize: "contain", backgroundRepeat: "no-repeat" };
    case "stretch":
      return { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" };
    case "original":
      return { backgroundSize: "auto", backgroundRepeat: "no-repeat" };
    case "tile":
      return { backgroundSize: "auto", backgroundRepeat: "repeat" };
    case "cover":
    default:
      return { backgroundSize: "cover", backgroundRepeat: "no-repeat" };
  }
}
```

- [ ] **Step 2: Read setting and apply style**

Add store selector:

```ts
const backgroundFit = useSettingsStore(s => s.backgroundFit ?? "cover");
```

Add memo:

```ts
const displayStyle = useMemo(() => getBackgroundDisplayStyle(backgroundFit), [backgroundFit]);
```

Add to wallpaper style:

```ts
...displayStyle,
```

Expected default remains `cover`, filling entire viewable app section.

---

### Task 4: GUI Dropdown

**Files:**
- Modify: `src/components/settings/Tabs/GUISettings.tsx`

- [ ] **Step 1: Use existing select components if already imported in file**

If not imported, add existing workbench select import matching local settings components:

```ts
import { WorkbenchSelect } from "../ui/WorkbenchSelect";
```

- [ ] **Step 2: Add display mode row**

Add row inside `Workspace Wallpaper` section after custom wallpaper input:

```tsx
<SettingsRow
  label="Wallpaper Display"
  description="Choose how the wallpaper fills the app background"
  control={
    <WorkbenchSelect
      value={settings["ui.background-fit"] || "cover"}
      onChange={(value) => onUpdate("ui.background-fit", value)}
      options={[
        { value: "cover", label: "Fill screen" },
        { value: "contain", label: "Fit inside" },
        { value: "stretch", label: "Stretch" },
        { value: "original", label: "Original size" },
        { value: "tile", label: "Tile" },
      ]}
      className="w-full sm:w-[200px]"
    />
  }
  icon="lucide:image"
/>
```

If `WorkbenchSelect` API differs, use same select pattern already used in sibling settings tabs.

---

### Task 5: Verify

**Files:**
- Test: `test/verify-background-image-settings.mjs`

- [ ] **Step 1: Run regression check**

Run:

```bash
node test/verify-background-image-settings.mjs
```

Expected: `background image settings contract ok`.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass.

---

## Self-Review

Spec coverage: display options, default fill screen, persistence, render mapping, GUI control covered.
Placeholder scan: no TODO/TBD placeholders. One conditional note for existing select API, bounded to existing component pattern.
Type consistency: `backgroundFit`, `ui.background-fit`, values `cover|contain|stretch|original|tile` used consistently.
