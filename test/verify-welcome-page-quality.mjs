import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const types = read("src/lib/stores/settings/types.ts");
const schema = read("src/lib/stores/settings/schema.ts");
const slice = read("src/lib/stores/settings/createInterfaceSlice.ts");
const bridge = read("src/lib/stores/settings/settingsBridge.ts");
const mapper = read("src/lib/stores/settingsMapper.ts");
const settingsModal = read("src/atlas/components/SettingsModal.tsx");
const welcome = read("src/atlas/components/chat/WorkspaceWelcome.tsx");
const svg = read("src/atlas/components/chat/WelcomeBlackHoleSvg.tsx");
const transition = read("src/atlas/components/chat/WorkspaceViewTransition.tsx");

assert(types.includes('WelcomePageQuality = "low" | "high" | "image" | "none"'), "welcome background must expose animated, image, and disabled modes");
assert(schema.includes('welcomePageQuality: z.enum(["low", "high", "image", "none"]).default("high")'), "schema must validate all welcome background modes");
assert(slice.includes('welcomePageQuality: "high"'), "interface slice must provide the high-quality default");
assert(bridge.includes('"ui.welcome-page-quality": { field: "welcomePageQuality", type: "string" }'), "settings bridge must map the General setting");
assert(mapper.includes('welcomePageQuality: "ui.welcome-page-quality"'), "SQLite mapper must persist the setting in the UI namespace");

assert(settingsModal.includes("Welcome Page"), "General settings must expose the Welcome Page option");
assert(settingsModal.includes("Low · SVG") && settingsModal.includes("High · Three.js"), "Welcome Page must offer both animated renderer choices");
assert(settingsModal.includes("Still · Image") && settingsModal.includes("Off · None"), "Welcome Page must offer still-image and disabled choices");
assert(welcome.includes('welcomePageQuality === "low"'), "welcome page must select the low-quality renderer");
assert(welcome.includes('welcomePageQuality === "high"'), "welcome page must select the high-quality renderer");
assert(!welcome.includes('src="/background.png"') && transition.includes("WorkspaceBackground"), "welcome page must reuse the shared workspace wallpaper for still-image mode");
assert(welcome.includes('let welcomeBackground: ReactNode = null'), "welcome page must support disabling the background");
assert(!welcome.includes('Pick a workspace, then start a conversation.'), "welcome page should not render the redundant workspace subtitle");
assert(welcome.includes("formatWorkspacePath") && welcome.includes("extendedWindowsPrefix"), "welcome page must normalize extended Windows workspace paths for display");

assert(svg.includes("<svg"), "low-quality renderer must be SVG");
assert(svg.includes("animateMotion"), "SVG renderer must animate particles without a JavaScript render loop");
assert(svg.includes("<mpath href={`#${path.motionId}`}"), "SVG particles must reuse shared motion paths");
assert(svg.includes("SVG_OUTER_PARTICLE_COUNT = 1"), "SVG renderer must keep the low-quality particle budget bounded");
assert(svg.includes('shapeRendering="optimizeSpeed"'), "SVG renderer must request the lightweight shape-rendering mode");
assert(svg.includes("dur={`${duration}s`}"), "SVG particles must have continuous native motion timing");
assert(!svg.includes('calcMode="discrete"'), "SVG particles must not use discrete keyframes that cause teleporting");
assert(svg.includes("CAMERA_POSITION") && svg.includes("CAMERA_FOV_DEGREES"), "SVG renderer must define the supplied camera position and field of view");
assert(svg.includes("BLACK_HOLE_SCALE = 1"), "SVG renderer must apply the reduced 1.5x smaller scale");
assert(svg.includes("rotateDiskPoint") && svg.includes("getProjectedDiskAnchor"), "SVG renderer must project the tilted disk and camera-space lens geometry");
assert(svg.includes("makeLensPath") && svg.includes("outerLensPath"), "SVG renderer must include the lens and occlusion geometry");
assert(!svg.includes(">Z<"), "SVG renderer must not render the incorrect Z label");
assert(svg.includes("aria-hidden=\"true\""), "decorative SVG must be hidden from assistive technology");
// Comments may mention "Three.js" for provenance, but the renderer must not
// import or depend on the three.js package.
assert(!svg.includes('from "three"') && !svg.includes("from 'three'") && !svg.includes('require("three")'), "low-quality SVG renderer must not import Three.js");

console.log("welcome page quality setting contract verified");
