import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const check = (label, ok) => {
  if (ok) console.log(`OK  ${label}`);
  else {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  }
};

const summary = read("src/atlas/components/chat/SecurityBoundarySummary.tsx");
const workspace = read("src/atlas/sections/WorkspaceSection.tsx");
const contextHeader = read("src/atlas/components/chat/WorkspaceContextHeader.tsx");
const settings = read("src/lib/stores/settings/types.ts");
const mcpApi = read("src/api/mcpApi.ts");

check(
  "security boundary summary is mounted in the active chat header",
  /WorkspaceContextHeader/.test(workspace) && /SecurityBoundarySummary/.test(contextHeader) && /onOpenSettings=\{onOpenCapabilities\}/.test(contextHeader) && /workspaceRoot=\{session\?\.workspaceRoot\}/.test(contextHeader),
);
check(
  "summary reads the existing workspace, terminal, and execution-mode settings",
  /state\.workspacePath/.test(summary) &&
    /state\.workspaceAllowExternalPaths/.test(summary) &&
    /state\.terminalConfirmCommands/.test(summary) &&
    /state\.terminalAutoExecute/.test(summary) &&
    /state\.toolPermissionMode/.test(summary),
);
check(
  "summary uses typed MCP list and status APIs",
  /mcpApi\.listServers\(\)/.test(summary) &&
    /mcpApi\.subscribeServerStatus/.test(summary) &&
    /McpServerEntry/.test(summary) &&
    /McpServerStatusEvent/.test(summary) &&
    /listen<McpServerStatusEvent>/.test(mcpApi),
);
check(
  "summary exposes the required boundary categories",
  /Workspace/.test(summary) &&
    /File writes/.test(summary) &&
    /Terminal/.test(summary) &&
    /Network/.test(summary) &&
    /MCP/.test(summary),
);
check(
  "summary does not claim unsupported blanket network isolation",
  /value=\"Not reported\"/.test(summary) &&
    /no authoritative network-capability snapshot/.test(summary) &&
    /Network:\s*disabled/.test(summary) === false,
);
check(
  "summary distinguishes configured policy from backend authority and OS sandboxing",
  /application-level access, not OS sandboxing/.test(summary) &&
    /Backend policy controls privileged actions/.test(summary) &&
    /Backend policy is authoritative/.test(summary) &&
    /Frontend-configured policy only/.test(summary),
);
check(
  "summary has keyboard and screen-reader accessible controls",
  /aria-label=\"Open security boundary summary\"/.test(summary) &&
    /type=\"button\"/.test(summary) &&
    /focus-visible:ring-2/.test(summary) &&
    /aria-haspopup=\"dialog\"/.test(summary),
);
check(
  "boundary fields are backed by typed settings state",
  /workspacePath:\s*string/.test(settings) &&
    /workspaceAllowExternalPaths:\s*boolean/.test(settings) &&
    /terminalConfirmCommands:\s*boolean/.test(settings) &&
    /terminalAutoExecute:\s*boolean/.test(settings),
);

if (process.exitCode) {
  console.error("\nOne or more security-boundary verifier checks failed.");
} else {
  console.log("\nAll security-boundary verifier checks passed.");
}
