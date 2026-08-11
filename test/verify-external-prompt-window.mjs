import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const config = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");
const devConfig = readFileSync(new URL("../src-tauri/tauri.dev.conf.json", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/confirmation.html", import.meta.url), "utf8");
const system = readFileSync(new URL("../src-tauri/src/commands/system.rs", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/settings/Tabs/SystemSettings.tsx", import.meta.url), "utf8");

for (const source of [config, devConfig]) {
  assert(source.includes('"label": "prompt"'));
  assert(source.includes('"url": "confirmation.html"'));
  assert(source.includes('"resizable": false'));
}
assert(page.includes("Delete all Zen data?") && page.includes("Restore this backup?") && page.includes("Restart Zen?"));
assert(page.includes("@tauri-apps/api/core") && page.includes("resolve_external_prompt"));
assert(system.includes("open_external_prompt") && system.includes("resolve_external_prompt"));
assert(!ui.includes('openExternalPrompt("restore")') && !ui.includes('openExternalPrompt("restart")'));
assert(ui.includes("Restore this backup?") && ui.includes("Restart Zen"));
assert(!page.includes("http://") && !page.includes("https://"));
console.log("external prompt window contract verified");
