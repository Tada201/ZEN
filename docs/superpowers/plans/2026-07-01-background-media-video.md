# Background Media Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow workspace background media to be either image or video, with video using same fitting semantics as image and default still filling app view.

**Architecture:** Reuse existing wallpaper URL setting and add one media type setting: `backgroundMediaType`. `WorkspaceBackground` auto-detects video by extension unless user forces image/video. GUI updates file picker formats and adds a media type dropdown.

**Tech Stack:** React, TypeScript, Zustand, Zod, Tauri dialog plugin, existing settings bridge, Node verifier script.

---

### Task 1: Regression Contract

**Files:**
- Modify: `test/verify-background-image-settings.mjs`

- [ ] **Step 1: Add failing assertions**

Add after existing `backgroundFit` mapper assertion:

```js
assert.match(mapper, /backgroundMediaType:\s*"ui\.background-media-type"/, 'backgroundMediaType must persist to ui.background-media-type');
```

Add after existing `backgroundRepeat` assertion:

```js
assert.match(background, /<video/, 'WorkspaceBackground must render video backgrounds');
assert.match(background, /isVideoBackground/, 'WorkspaceBackground must detect video backgrounds');
assert.match(background, /objectFit/, 'video background must use objectFit fitting logic');
assert.match(background, /mp4|webm|mov|m4v|ogv/, 'video background must restrict common video formats');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/verify-background-image-settings.mjs
```

Expected: FAIL with `backgroundMediaType must persist to ui.background-media-type`.

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
export type BackgroundMediaType = "auto" | "image" | "video";
```

Add field and setter to `InterfaceSlice` near background fields:

```ts
backgroundMediaType: BackgroundMediaType;
setBackgroundMediaType: (mediaType: BackgroundMediaType) => void;
```

- [ ] **Step 2: Add schema default**

In `src/lib/stores/settings/schema.ts`, add near background fields:

```ts
backgroundMediaType: z.enum(["auto", "image", "video"]).default("auto"),
```

- [ ] **Step 3: Add slice default and setter**

In `src/lib/stores/settings/createInterfaceSlice.ts`, import type:

```ts
import type { SettingsState, InterfaceSlice, BackgroundFit, BackgroundMediaType } from "./types";
```

Add default:

```ts
backgroundMediaType: "auto",
```

Add setter:

```ts
setBackgroundMediaType: (mediaType: BackgroundMediaType) => {
  get().updateSetting("backgroundMediaType", mediaType);
},
```

- [ ] **Step 4: Add bridge mapping**

In `src/lib/stores/settings/settingsBridge.ts`, add:

```ts
"ui.background-media-type": { field: "backgroundMediaType", type: "string" },
```

- [ ] **Step 5: Add SQLite mapper override**

In `src/lib/stores/settingsMapper.ts`, add:

```ts
backgroundMediaType: "ui.background-media-type",
```

---

### Task 3: Renderer Video Support

**Files:**
- Modify: `src/components/workbench/WorkspaceBackground.tsx`

- [ ] **Step 1: Add helpers**

Add below `getBackgroundDisplayStyle`:

```ts
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

function getExtension(url: string): string {
  const clean = url.split(/[?#]/, 1)[0] ?? "";
  return clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
}

function isVideoBackground(url: string, mediaType: string): boolean {
  if (mediaType === "video") return VIDEO_EXTENSIONS.has(getExtension(url));
  if (mediaType === "image") return false;
  return VIDEO_EXTENSIONS.has(getExtension(url));
}

function getVideoDisplayStyle(fit: string): Pick<CSSProperties, "objectFit"> {
  switch (fit) {
    case "contain":
      return { objectFit: "contain" };
    case "stretch":
      return { objectFit: "fill" };
    case "original":
      return { objectFit: "none" };
    case "tile":
    case "cover":
    default:
      return { objectFit: "cover" };
  }
}
```

- [ ] **Step 2: Read media type and compute mode**

Add store selector:

```ts
const backgroundMediaType = useSettingsStore(s => s.backgroundMediaType ?? "auto");
```

Add memos:

```ts
const videoBackground = useMemo(
  () => isVideoBackground(backgroundImageUrl, backgroundMediaType),
  [backgroundImageUrl, backgroundMediaType]
);
const videoStyle = useMemo(() => getVideoDisplayStyle(backgroundFit), [backgroundFit]);
```

- [ ] **Step 3: Render video or image**

Replace current wallpaper render block with:

```tsx
{resolvedUrl && videoBackground && (
  <video
    className="absolute inset-0 h-full w-full transition-all duration-500 ease-in-out [will-change:transform,opacity,filter]"
    src={resolvedUrl}
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    style={{
      ...videoStyle,
      opacity: backgroundOpacity,
      filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
      transform: backgroundBlur > 0 ? 'scale(1.03) translate3d(0,0,0)' : 'scale(1.01) translate3d(0,0,0)',
    }}
  />
)}

{resolvedUrl && !videoBackground && (
  <div
    className="absolute inset-0 bg-center transition-all duration-500 ease-in-out [will-change:transform,opacity,filter]"
    style={{
      backgroundImage: `url("${cssUrl}")`,
      ...displayStyle,
      opacity: backgroundOpacity,
      filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
      transform: backgroundBlur > 0 ? 'scale(1.03) translate3d(0,0,0)' : 'scale(1.01) translate3d(0,0,0)',
    }}
  />
)}
```

---

### Task 4: GUI Controls And File Picker

**Files:**
- Modify: `src/components/settings/Tabs/GUISettings.tsx`

- [ ] **Step 1: Update labels and allowed formats**

Change custom wallpaper label/description:

```tsx
label="Background Media"
description="Remote URL or browse a local image/video file"
```

Change placeholder:

```tsx
placeholder="e.g., https://example.com/wallpaper.mp4"
```

Change dialog filter:

```ts
filters: [{
  name: "Images and Videos",
  extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "mp4", "webm", "mov", "m4v", "ogv"],
}],
```

- [ ] **Step 2: Add background type dropdown**

Add row after background media input:

```tsx
<SettingsRow
  label="Background Type"
  description="Auto-detect, or force image/video rendering"
  control={
    <WorkbenchSelect
      value={settings["ui.background-media-type"] || "auto"}
      onValueChange={(value) => onUpdate("ui.background-media-type", value)}
      options={[
        { value: "auto", label: "Auto detect" },
        { value: "image", label: "Image" },
        { value: "video", label: "Video" },
      ]}
      className="h-9 w-full bg-muted/50 text-xs sm:w-[200px]"
    />
  }
  icon="lucide:file-video"
/>
```

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

Spec coverage: image/video switching, auto detection, common video extensions, existing fit logic, GUI controls, default fill behavior all covered.
Placeholder scan: no TODO/TBD placeholders.
Type consistency: `backgroundMediaType`, `ui.background-media-type`, and values `auto|image|video` used consistently.
