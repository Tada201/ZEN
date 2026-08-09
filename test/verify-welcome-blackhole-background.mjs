import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const bg = read("src/atlas/components/chat/WelcomeBlackHoleBackground.tsx");
const welcome = read("src/atlas/components/chat/WorkspaceWelcome.tsx");
const motion = read("src/lib/motion.ts");

// Bundled Three.js, no external CDN script.
assert(bg.includes('from "three"'), "welcome background must use the bundled Three.js dependency");
assert(!bg.includes("https://") && !bg.includes("cdnjs"), "welcome background must not load a remote script");

// Full-viewport stage, non-interactive, matching the supplied sample.
assert(bg.includes("absolute inset-0"), "welcome background stage must cover the viewport");
assert(bg.includes("pointer-events-none"), "welcome background must not intercept pointer events");
assert(bg.includes("aria-hidden"), "welcome background must be hidden from assistive tech");

// Central app motion policy (no OS media query / second preference).
assert(bg.includes('useAnimationsEnabled') || bg.includes('useReducedMotion'), "welcome background must use the app motion policy");
assert(bg.includes('from "@/lib/motion"') || bg.includes('from "@/hooks/useReducedMotion"'), "welcome background must import the canonical motion hook");
assert(!bg.includes("prefers-reduced-motion") && !bg.includes("matchMedia"), "welcome background must not read the OS motion preference");

// Renderer must target the mounted canvas; otherwise the scene renders into an
// unattached canvas and the visible welcome background stays blank.
assert(bg.includes("canvas,"), "Three renderer must use the mounted welcome canvas");
assert(bg.includes("buildScene(host.clientWidth || 1, host.clientHeight || 1, canvas, pixelRatio)"), "scene setup must pass the mounted canvas");

// Pause + cleanup.
assert(bg.includes("IntersectionObserver"), "welcome background must pause when offscreen");
assert(bg.includes("objects.reverse().forEach"), "cleanup must not mutate the scene while traversing it");
assert(!bg.includes("loseContext"), "cleanup must preserve the WebGL context across React StrictMode remounts");
assert(bg.includes("if (!shouldAnimate)"), "motion-off mode must keep a static black-hole frame visible");
assert(bg.includes("renderer.render(scene, camera)"), "background must render an initial/static frame");
assert(bg.includes('getContext("2d")'), "background must provide a 2D fallback when WebGL is unavailable");
assert(bg.includes("drawCanvasFallback"), "2D fallback must render the black-hole composition");
assert(bg.includes("visibilitychange"), "welcome background must pause when the tab is hidden");
assert(bg.includes("dispose()") || bg.includes("renderer.dispose"), "welcome background must dispose WebGL resources on unmount");

// Scale + FPS caps: the enlarged scene keeps the existing low-power budget.
assert(bg.includes("BLACK_HOLE_SCALE = 1.8"), "Three.js/fallback renderer must apply the requested 1.8x scale");
assert(bg.includes("FPS_TARGET") && bg.includes("FPS_POWER_SAVE"), "welcome background must define normal and power-save FPS caps");
assert(bg.includes("FALLBACK_FPS_TARGET") && bg.includes("FALLBACK_FPS_POWER_SAVE"), "2D fallback must use a lower frame budget");
assert(bg.includes("MAX_PIXEL_RATIO") && bg.includes("POWER_SAVE_PIXEL_RATIO"), "welcome background must cap canvas resolution for a decorative scene");
assert(bg.includes("renderer.setPixelRatio(pixelRatio)"), "WebGL renderer must use the capped pixel ratio");
assert(bg.includes("renderer.setScissorTest(true)"), "WebGL renderer should clip transparent outer margins");
assert(!bg.includes("function detectWebGL"), "welcome background must not probe a second WebGL canvas");
assert(bg.includes("1000 / (powerSave ? FPS_POWER_SAVE : FPS_TARGET)"), "welcome background must switch the frame cap by power signal");
assert(bg.includes("saveData") || bg.includes("getBattery"), "welcome background must detect a constrained-power signal");
assert(bg.includes("30") && bg.includes("15"), "welcome background must cap at 30fps normal / 15fps power-save");

// Fallback when WebGL is unavailable.
assert(bg.includes("webglOk") && bg.includes("initError"), "welcome background must have a WebGL-unavailable fallback");

// Welcome integration: mounted at the root, content stays above it.
assert(welcome.includes("WelcomeBlackHoleBackground"), "welcome screen must retain the high-quality black-hole background");
assert(welcome.includes("WelcomeBlackHoleSvg"), "welcome screen must expose the low-quality SVG background");
assert(welcome.includes('import { WelcomeBlackHoleBackground } from "./WelcomeBlackHoleBackground"'), "welcome screen must import the high-quality background");
assert(welcome.includes('import { WelcomeBlackHoleSvg } from "./WelcomeBlackHoleSvg"'), "welcome screen must import the low-quality SVG background");

console.log("welcome black-hole background contract verified");
