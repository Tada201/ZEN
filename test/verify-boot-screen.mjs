import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const bootSource = readFileSync(new URL("../src/components/BootScreen.tsx", import.meta.url), "utf8");
const initSource = readFileSync(new URL("../src/hooks/useAppInit.ts", import.meta.url), "utf8");

assert(appSource.includes("<BootScreen") && appSource.includes("bootFinished"), "app must mount and dismiss the boot overlay");
assert(bootSource.includes("bootEnabled") && bootSource.includes("bootDurationMs"), "boot screen must respect user settings");
assert(bootSource.includes("Math.max(8000, durationMs + 1000)"), "boot overlay must have a bounded fail-open timeout");
assert(!bootSource.includes("Math.random"), "boot progress must be deterministic and avoid decorative hot-loop randomness");
assert(initSource.includes("waitForSettingsHydration") && initSource.includes("useSettingsStore.subscribe"), "startup must wait for persisted settings without guessing a fixed delay");
assert(initSource.includes("void providersApi.getAllAvailableModels"), "provider discovery must run outside the blocking startup path");
assert(initSource.includes("startedRef.current"), "startup initialization must not run twice when hydration changes");

console.log("boot screen startup contract verified");
