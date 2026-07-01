import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const bootSource = readFileSync(new URL("../src/components/bootscreen/index.tsx", import.meta.url), "utf8");
const initSource = readFileSync(new URL("../src/hooks/useAppInit.ts", import.meta.url), "utf8");

// App must mount the boot overlay and gate WorkspaceApp behind bootFinished.
assert(appSource.includes("<BootScreen") && appSource.includes("bootFinished"), "app must mount and dismiss the boot overlay");

// Boot screen must respect the bootEnabled user setting (skip if disabled).
assert(bootSource.includes("bootEnabled"), "boot screen must respect the bootEnabled user setting");

// PASSIVE-OVERLAY CONTRACT (canonical Tauri v2 splash pattern — see
// https://v2.tauri.app/learn/splashscreen/):
//
// Rust owns the splash → main handoff via SetupFlags
// (backend_ready set when core_complete, frontend_ready set when the React
// app calls systemApi.setComplete("frontend")). BootScreen does no
// gating of its own — by the time the user sees the reveal overlay, both
// signals have already arrived and the main window is visible.
//
// What BootScreen must NOT do anymore:
//   - poll backend init status
//   - call close_splashscreen (the command was removed from the Rust side)
//   - track criticalComplete / coreComplete / isInitialized gates
//   - hold the reveal animation behind a "hold at 100%" timer
//
// We check for actual code patterns (`status.X`, `setX`, `systemApi.X`) to
// avoid false positives from documentation comments that mention these
// identifiers when explaining the architecture.
assert(!/systemApi\.getInitStatus/.test(bootSource), "BootScreen must not poll backend init status (Rust owns the gate)");
assert(!/systemApi\.closeSplashscreen/.test(bootSource), "BootScreen must not call closeSplashscreen (Rust owns the handoff)");
assert(!/status\.critical_complete/.test(bootSource), "BootScreen must not read status.critical_complete (Rust owns the gate)");
assert(!/status\.core_complete/.test(bootSource), "BootScreen must not read status.core_complete (Rust owns the gate)");
assert(!/setCriticalDone|setCoreDone/.test(bootSource), "BootScreen must not maintain local readiness state");
assert(!/heldAtFull/.test(bootSource), "BootScreen must not gate the reveal animation behind a 100% hold phase");
assert(!/isInitialized/.test(bootSource), "BootScreen must not depend on useAppInit's isInitialized (Rust owns the gate)");

// What BootScreen must still do:
//   - render the wireframe assembly (panels appear staggered)
//   - play the cover-mask reveal animation on mount
//   - call onComplete after the reveal so WorkspaceApp can take over
assert(/setTimeout\(\(\)\s*=>\s*setRevealed\(true\)/.test(bootSource), "BootScreen must play the cover-mask reveal animation on mount");
assert(/setTimeout\(\(\)\s*=>\s*done\(\),\s*4400\)/.test(bootSource), "BootScreen must unmount after the reveal (~4.4s)");
assert(/setPanelVisible\(v\s*=>\s*\(\{\.\.\.v,\s*leftSidebar:\s*true\}\)\),\s*100\)/.test(bootSource), "BootScreen must assemble the wireframe panels in a stagger");

// Boot progress must be deterministic — no Math.random hot-loop fuzz.
assert(!bootSource.includes("Math.random"), "boot progress must be deterministic and avoid decorative hot-loop randomness");

// FRONTEND INIT CONTRACT:
//   - Wait for persisted settings without guessing a fixed delay.
assert(initSource.includes("waitForSettingsHydration") && initSource.includes("useSettingsStore.subscribe"), "startup must wait for persisted settings without guessing a fixed delay");

//   - Provider discovery is BLOCKING with a hard timeout ceiling
//     (Promise.race + setTimeout), not fire-and-forget.
assert(/await\s+Promise\.race[^[]*\[[\s\S]*providersApi\.getAllAvailableModels[\s\S]*setTimeout[\s\S]*resolve\(null\)/.test(initSource), "provider discovery must block on the init path with a hard timeout ceiling");
assert(!/\bvoid\s+providersApi\.getAllAvailableModels\b/.test(initSource), "provider discovery must not be fire-and-forget — main UI cannot mount before provider stack is known");

//   - The vectorstore no-op (setStep('vectorstore', 'done') without a real
//     check) is removed. Vector store / embeddings are external/optional
//     subsystems that do not gate the boot.
assert(!/setStep\(['"]vectorstore['"],\s*['"]done['"]\)/.test(initSource), "vectorstore step must not be a no-op without a real check");

//   - Startup must not run twice when hydration changes (idempotency).
assert(initSource.includes("startedRef.current"), "startup initialization must not run twice when hydration changes");

//   - After init finishes, the frontend MUST signal Rust via
//     set_complete("frontend") so the splash → main handoff can fire.
//     Without this, Rust's perform_handoff will never run.
assert(initSource.includes("setComplete") && initSource.includes("'frontend'"), "useAppInit must signal Rust via setComplete('frontend') when init finishes");

console.log("boot screen startup contract verified");
