import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const motion = read("src/lib/motion.ts");
const theme = read("src/atlas/providers/ZenThemeProvider.tsx");
const settings = read("src/atlas/components/SettingsModal.tsx");
const settingsSchema = read("src/lib/stores/settings/schema.ts");
const interfaceSlice = read("src/lib/stores/settings/createInterfaceSlice.ts");
const welcome = read("src/atlas/components/chat/WorkspaceWelcome.tsx");
const transition = read("src/atlas/components/chat/WorkspaceViewTransition.tsx");
const assistantMessage = read("src/atlas/components/chat/AssistantMessage.tsx");
const executionTrace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const workspaceSection = read("src/atlas/sections/WorkspaceSection.tsx");
const boot = read("src/components/bootscreen/index.tsx");
const css = read("src/styles/index.css");

assert(motion.includes("useSettingsStore") && motion.includes("return !animationsEnabled"), "motion policy must be owned by the app setting");
assert(!motion.includes("matchMedia") && !motion.includes("prefers-reduced-motion"), "motion policy must not read the OS reduced-motion preference");
assert(theme.includes("MotionConfig") && theme.includes('reducedMotion={shouldReduceMotion ? "always" : "never"}'), "theme provider must apply the central Framer Motion policy");
assert(theme.includes('updateSetting("animationsEnabled", b)') && !theme.includes("MOTION_STORAGE_KEY"), "theme motion setters must use the canonical setting");
assert(!theme.includes("pressEnabled") && !theme.includes("data.press"), "theme provider must not expose a second press-motion preference");
assert(settings.includes("animationsEnabled") && !settings.includes('updateSetting("reducedMotion"'), "settings UI must not maintain a second motion preference");
assert(!settingsSchema.includes("reducedMotion") && !interfaceSlice.includes("reducedMotion"), "settings store must not persist a second reduced-motion preference");
assert(welcome.includes('from "framer-motion"') && welcome.includes('from "@/lib/motion"') && welcome.includes("motionDurations.standard"), "welcome surface must use the central motion policy");
assert(transition.includes('from "@/lib/motion"') && !transition.includes('useReducedMotion } from "framer-motion"'), "workspace transition must use the central hook");
assert(transition.includes("motionDurations.shared") && transition.includes("y: 28") && transition.includes("y: -22"), "welcome-to-chat transition must use a visible scene crossfade");
const premiumInput = read("src/atlas/components/PremiumChatInput.tsx");
assert(premiumInput.includes("layout") && premiumInput.includes("motionDurations.shared"), "composer internals must retain layout animation without competing shared IDs");
assert(workspaceSection.includes('layoutId="workspace-composer-shell"') && workspaceSection.includes("motionDurations.shared"), "welcome and chat must share an explicit composer morph shell");
assert(transition.includes("WorkspaceTransitionContext") && transition.includes("handleAnimationStart"), "transition must expose lifecycle state to pause decorative rendering");
assert(assistantMessage.includes('from "framer-motion"') && assistantMessage.includes("executionCardMotion"), "assistant timeline rows must use shared execution motion");
assert(executionTrace.includes('from "framer-motion"') && executionTrace.includes("executionCardMotion"), "execution trace rows must use shared execution motion");
assert(motion.includes("executionCardMotion") && motion.includes("exit:"), "motion registry must define execution card choreography");
assert(read("src/atlas/components/chat/WelcomeBlackHoleBackground.tsx").includes("pausedRef.current"), "WebGL background must pause its frame loop during scene transitions");
assert(read("src/atlas/components/chat/WelcomeBlackHoleSvg.tsx").includes("shouldAnimate && !paused"), "SVG background must pause native particle motion during scene transitions");
assert(boot.includes('from "@/lib/motion"') && boot.includes("!bootEnabled || reducedMotion"), "boot screen must honor the central policy");
assert(css.includes('html[data-motion="off"] #root *') && !css.includes("prefers-reduced-motion"), "CSS motion must honor the app policy without an OS override");

console.log("motion policy verified");
