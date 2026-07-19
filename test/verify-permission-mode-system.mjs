import { readFileSync } from "node:fs";

const check = (label, ok, detail = "") => {
  if (ok) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
};

const permission = readFileSync("src-tauri/src/tools/permission.rs", "utf8");
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

const manager = readFileSync("src-tauri/src/tools/manager.rs", "utf8");
check(
  "ToolManager parses tools.permission-mode key",
  /tool_permission_mode/.test(manager) && /tools\.permission-mode/.test(manager),
);

const settingsTab = readFileSync("src/components/settings/Tabs/ToolsSettings.tsx", "utf8");
check(
  "ToolsSettings maps new SafetyMode types (plan_mode, ask, auto_edit, yolo)",
  /type SafetyMode\s*=\s*"plan_mode"\s*\|\s*"ask"\s*\|\s*"auto_edit"\s*\|\s*"yolo"/.test(settingsTab),
);
check(
  "ToolsSettings applyMode maps values to tools.permission-mode",
  /onUpdate\("tools\.permission-mode",\s*mode\)/.test(settingsTab),
);

const chatInput = readFileSync("src/atlas/components/PremiumChatInput.tsx", "utf8");
check(
  "PremiumChatInput reads toolPermissionMode from settings store",
  /const permissionMode = useSettingsStore/.test(chatInput),
);
check(
  "PremiumChatInput defines handleSelectPermissionMode callback",
  /const handleSelectPermissionMode = useCallback/.test(chatInput),
);
check(
  "PremiumChatInput renders dropdown items for Plan, Ask, Auto-Edit, and YOLO",
  /handleSelectPermissionMode\("plan_mode"\)/.test(chatInput) &&
    /handleSelectPermissionMode\("ask"\)/.test(chatInput) &&
    /handleSelectPermissionMode\("auto_edit"\)/.test(chatInput) &&
    /handleSelectPermissionMode\("yolo"\)/.test(chatInput),
);

if (process.exitCode) {
  console.error("\nOne or more permission verifier checks failed.");
} else {
  console.log("\nAll permission verifier checks passed.");
}
