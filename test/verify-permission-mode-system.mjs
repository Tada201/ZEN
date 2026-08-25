import { readFileSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

// `src-tauri/src/tools/permission.rs` is a re-export shim now; the permission
// rules engine lives in the `zen-security` crate's policy module.
const permission = readFileSync("src-tauri/crates/zen-security/src/policy.rs", "utf8");
check(
  "ToolPermissions has permission_mode field",
  /pub permission_mode:\s*String/.test(permission),
);
check(
  "Permission mode yolo matches Allow decision",
  /"yolo"\s*=>\s*PermissionDecision::Allow/.test(permission),
);
check(
  "Permission mode plan_mode denies Critical risk",
  /"plan_mode"\s*=>\s*\{[\s\S]*?else\s*\{\s*PermissionDecision::Deny/.test(permission),
);

// `src-tauri/src/tools/manager.rs` is an alias shim; the discovery manager that
// reads the permission-mode setting lives in the `zen-tools` crate.
const manager = readFileSync("src-tauri/crates/zen-tools/src/manager.rs", "utf8");
check(
  "ToolManager parses tools.permission-mode key",
  /tool_permission_mode/.test(manager) && /tools\.permission-mode/.test(manager),
);

const settingsTab = readFileSync("src/components/settings/Tabs/ToolsSettings.tsx", "utf8");
const modeRegistry = readFileSync("src/lib/constants/permissionModes.ts", "utf8");
const permissionMenu = readFileSync("src/atlas/components/PermissionModeMenu.tsx", "utf8");
const settingsCommands = readFileSync("src-tauri/src/commands/settings.rs", "utf8");
check(
  "Shared mode registry owns all SafetyMode variants",
  /export type SafetyMode\s*=\s*"plan_mode"\s*\|\s*"ask"\s*\|\s*"auto_edit"\s*\|\s*"yolo"/.test(modeRegistry) &&
    /SAFETY_MODE_DEFINITIONS/.test(modeRegistry) &&
    /isSafetyMode/.test(modeRegistry),
);
check(
  "ToolsSettings consumes the shared mode registry",
  /permissionModes/.test(settingsTab) &&
    /SAFETY_MODE_DEFINITIONS\.map/.test(settingsTab) &&
    /getSafetyModeSettingEntries/.test(settingsTab),
);
check(
  "PermissionModeMenu consumes the shared mode registry",
  /permissionModes/.test(permissionMenu) &&
    /SAFETY_MODE_DEFINITIONS\.map/.test(permissionMenu) &&
    /getSafetyModeSettings/.test(permissionMenu) &&
    /isSafetyMode\(state\.toolPermissionMode\)/.test(permissionMenu),
);
check(
  "Registry projects all compatibility fields for each mode",
  /toolPermissionMode: mode/.test(modeRegistry) &&
    /toolYoloMode: true/.test(modeRegistry) &&
    /toolAutoApproveLowRisk: true/.test(modeRegistry) &&
    /toolGlobalDefault: "always_allow"/.test(modeRegistry) &&
    /toolYoloMode: false/.test(modeRegistry) &&
    /toolGlobalDefault: "confirm"/.test(modeRegistry),
);
check(
  "All emitted permission keys are recognized by backend auto-sync",
  /tools\.permission-mode/.test(settingsCommands) &&
    /tools\.yolo-mode/.test(settingsCommands) &&
    /tools\.auto-approve-low-risk/.test(settingsCommands) &&
    /tools\.global-default/.test(settingsCommands),
);
check(
  "Execution mode selector exposes accessible state and backend-sync feedback",
  /aria-label=\{`Execution mode:/.test(permissionMenu) &&
    /aria-current=\{selected \? "true"/.test(permissionMenu) &&
    /syncFailed/.test(permissionMenu) &&
    /toast\.error/.test(permissionMenu) &&
    /previous mode was restored/.test(permissionMenu),
);
check(
  "Full Access remains confirmation-gated",
  /mode === "yolo"/.test(permissionMenu) &&
    /window\.confirm/.test(permissionMenu) &&
    /Hard security blocks still apply/.test(permissionMenu),
);

if (process.exitCode) {
  console.error("\nOne or more permission verifier checks failed.");
} else {
  console.log("\nAll permission verifier checks passed.");
}
