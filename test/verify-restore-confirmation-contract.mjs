import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const ui = readFileSync(new URL("../src/components/settings/Tabs/SystemSettings.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src-tauri/src/commands/backup.rs", import.meta.url), "utf8");
assert(ui.includes("setRestoreDialogOpen(true)"));
assert(ui.includes("Restore this backup?") && ui.includes("Restore backup"));
assert(ui.includes("restartPrompt") && ui.includes("Restart Zen"));
assert(!ui.includes('openExternalPrompt("restore")'));
assert(!ui.includes("window.confirm"));
assert(backend.includes("validate_snapshot") && backend.includes("Backup contains an orphan message"));
assert(backend.includes("archive.len() != 2") && backend.includes("Backup snapshot checksum or size validation failed"));
console.log("restore confirmation contract verified");
