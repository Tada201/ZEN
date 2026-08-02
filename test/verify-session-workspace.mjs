import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const checks = [];
const check = (label, condition) => checks.push([label, condition]);

const models = read("src-tauri/src/db/models.rs");
const migrations = read("src-tauri/src/db/mod.rs");
const queries = read("src-tauri/src/db/queries/chat.rs");
const crud = read("src-tauri/src/commands/chat/crud.rs");
const lifecycle = read("src-tauri/src/commands/chat/lifecycle.rs");
const state = read("src-tauri/src/commands/mod.rs");
const lib = read("src-tauri/src/lib.rs");
const toolService = read("src-tauri/src/services/tool.rs");
const canonicalWrite = read("src-tauri/src/tools/fs_tools/write.rs");
const canonicalPatch = read("src-tauri/src/tools/fs_tools/patch.rs");
const canonicalTerminal = read("src-tauri/src/tools/terminal_tools.rs");
const legacyFs = read("src-tauri/src/agent/tools/fs_tools.rs");
const legacyTerminal = read("src-tauri/src/agent/tools/terminal_tools.rs");
const api = read("src/api/chatApi.ts");
const mock = read("src/api/mockClient.ts");
const sessionTypes = read("src/atlas/components/chat/types.ts");
const queriesHook = read("src/atlas/hooks/chat/useChatQueries.ts");
const mutations = read("src/atlas/hooks/chat/useChatMutations.ts");
const workspaceHook = read("src/atlas/hooks/useChat.ts");
const browser = read("src/atlas/components/FolderBrowser.tsx");
const workspaceUi = read("src/atlas/sections/WorkspaceSection.tsx");
const workspaceHeader = read("src/atlas/components/chat/WorkspaceContextHeader.tsx");
const roadmap = read("docs/product-polish-roadmap.md");

check("Chat persists an optional workspace root", /workspace_root: Option<String>/.test(models) && /workspace_root TEXT/.test(migrations));
check("chat queries select and update workspace_root", /c\.workspace_root/.test(queries) && /pub async fn set_chat_workspace/.test(queries));
check("archived chat listing uses an explicit workspace-aware projection", /list_archived_chats_page/.test(queries) && /WHERE c\.is_archived = 1/.test(queries) && /c\.workspace_root/.test(queries) && !/SELECT \* FROM chats WHERE is_archived/.test(queries));
check("new chats capture the current global root once", /workspace_folder\.read\(\)\.await\.clone\(\)/.test(crud) && /Some\(workspace_root\.to_string_lossy\(\)\.as_ref\(\)\)/.test(crud));
check("workspace command canonicalizes user-selected roots", /canonicalize_workspace_root/.test(crud) && /pub async fn set_chat_workspace/.test(crud));
check("import does not trust an arbitrary machine-local root", /machine-local capabilities/.test(lifecycle) && /require the user to explicitly/.test(lifecycle) && /export\.chat\.workspace_root/.test(lifecycle) === false && /None,/.test(lifecycle));
check("chat workspace resolution does not mutate global state", /pub async fn workspace_for_chat/.test(state) && /match chat\.workspace_root/.test(state) && /_ => Ok\(global_workspace\)/.test(state));
check("workspace command is registered", /commands::chat::set_chat_workspace/.test(lib));

for (const source of [toolService, canonicalWrite, canonicalPatch, canonicalTerminal, legacyFs, legacyTerminal]) {
  check("file and terminal execution uses the session workspace", /workspace_for_chat/.test(source));
}
check("checkpoint undo resolves the session workspace", /workspace_for_chat\(&chat_id\)/.test(read("src-tauri/src/commands/checkpoint.rs")));

check("typed frontend API carries workspaceRoot", /workspaceRoot\?: string \| null/.test(api) && /setChatWorkspace/.test(api));
check("session mapping and mutation expose workspaceRoot", /workspaceRoot: chat\.workspaceRoot \?\? null/.test(queriesHook) && /setSessionWorkspaceMutation/.test(mutations) && /handleSetSessionWorkspace/.test(mutations) && /\.\.\.mutations/.test(workspaceHook));
check("mock mode supports session workspace updates", /set_chat_workspace/.test(mock) && /workspaceRoot/.test(mock));
check("folder browser synchronizes when the active session changes", /if \(!open\)/.test(browser) && /\[open, value, browse\]/.test(browser));
// The session workspace is fixed when the chat is created, so the chat context
// surfaces it read-only. Picking a root stays in workspace settings; an in-chat
// picker would let a running session silently change its own boundary.
check("active chat header exposes the immutable session scope", /WorkspaceContextHeader/.test(workspaceUi) && /FolderLock/.test(workspaceHeader) && /session\?\.workspaceRoot/.test(workspaceHeader) && !/FolderBrowser/.test(workspaceHeader));
check("roadmap records the delivered slice and limitations", /P1\.1 Isolated workspace/.test(roadmap) && /persist an optional session workspace/.test(roadmap) && /full user-facing worktree workflow/.test(roadmap));

let failed = false;
for (const [label, condition] of checks) {
  if (condition) console.log(`OK  ${label}`);
  else {
    console.error(`FAIL ${label}`);
    failed = true;
  }
}
if (failed) {
  console.error("\\nSession workspace verifier failed.");
  process.exitCode = 1;
} else {
  console.log("\\nSession workspace verifier passed.");
}
