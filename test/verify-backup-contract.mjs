import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const backend = readFileSync(new URL("../src-tauri/src/commands/backup.rs", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/api/backupApi.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/settings/Tabs/SystemSettings.tsx", import.meta.url), "utf8");

assert(backend.includes("FORMAT_VERSION"));
assert(backend.includes("manifest.json") && backend.includes("snapshot.json"));
assert(backend.includes("secrets_excluded: true"));
assert(backend.includes("workspace_roots_excluded: true"));
assert(backend.includes("MAX_ARCHIVE_BYTES"));
assert(backend.includes("workspace_roots_excluded") && backend.includes("chat_count"));
assert(backend.includes("REPLACE ZEN DATA"));
assert(backend.includes("Sha256"));
assert(!backend.includes("keyring_entry"));
assert(api.includes('"export_zen_backup"') && api.includes('"inspect_zen_backup"'));
assert(ui.includes("Export Zen backup") && ui.includes(".zenbackup"));
assert(ui.includes("API keys, databases, logs, runtimes, and workspace paths are excluded"));
console.log("backup contract verified");
