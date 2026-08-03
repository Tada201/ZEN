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
const sidebar = read("src/atlas/components/chat/SessionSidebar.tsx");
const sessionItem = read("src/atlas/components/chat/SessionSidebarItem.tsx");
const roadmap = read("docs/product-polish-roadmap.md");

check("Chat persists an optional workspace root", /workspace_root: Option<String>/.test(models) && /workspace_root TEXT/.test(migrations));
check("chat queries select and update workspace_root", /c\.workspace_root/.test(queries) && /pub async fn set_chat_workspace/.test(queries));
check("archived chat listing uses an explicit workspace-aware projection", /list_archived_chats_page/.test(queries) && /WHERE c\.is_archived = 1/.test(queries) && /c\.workspace_root/.test(queries) && !/SELECT \* FROM chats WHERE is_archived/.test(queries));
check("new chats capture an explicit or current canonical root once", /pub async fn create_chat/.test(crud) && /workspace_root: Option<String>/.test(crud) && /canonicalize_workspace_root/.test(crud) && /workspace_folder\.read\(\)\.await\.clone\(\)/.test(crud) && /workspace_root_string\.as_deref\(\)/.test(crud));
check("legacy workspace assignment canonicalizes once and rejects initialized chats", /pub async fn set_chat_workspace/.test(crud) && /Chat workspace is immutable after initialization/.test(crud) && /A workspace root is required/.test(crud));
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
// Sessions are grouped by their captured workspace root, the way Codex lists chats
// under their project. Date buckets hid which boundary a chat could touch.
check("sidebar groups chats by their captured workspace root", /workspaceGroups/.test(sidebar) && /session\.workspaceRoot\?\.trim\(\) \|\| "__global__"/.test(sidebar) && /Global workspace/.test(sidebar));
check("new chats default to the configured workspace without a second owner", /useSettingsStore\.getState\(\)\.workspacePath/.test(mutations) && /workspaceRoot/.test(mutations));
check("sidebar folder actions close the menu before opening dialogs", /casesMenuOpen/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setFolderPromptOpen\(true\)/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setRenameFolderTarget/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setDeleteFolderTarget/.test(sidebar));
check("sidebar renders folders as visible organization groups", /expandedFolders/.test(sidebar) && /folders\.map\(/.test(sidebar) && /folderChats/.test(sidebar) && /folder\.name/.test(sidebar));
check("sidebar preserves empty folders and avoids duplicate assigned chats", /folders\.map\([\s\S]*folderChats/.test(sidebar) && /session\.folderId/.test(sidebar) && /!session\.folderId/.test(sidebar));
check("folder creation remains wired to the typed mutation", /onCreateFolder\(name\)/.test(sidebar) && /handleCreateFolder/.test(mutations));
check("workspace groups expose move context menus", /ContextMenu/.test(sidebar) && /Move to Folder/.test(sidebar) && /workspaceGroups\.map/.test(sidebar));
check("workspace and chat rows support folder drag and drop without bubbling group ownership", /draggable/.test(sidebar) && /onDragStart/.test(sidebar) && /onDrop/.test(sidebar) && /application\/x-zen/.test(sidebar) && /event\.stopPropagation\(\)/.test(sidebar));
check("archived folder projections stay synchronized", /\[\"archived-sessions\"\]/.test(mutations) && /folderId: null/.test(mutations));
check("pinned folder chats are not rendered twice", /filteredSessions\.filter\(\(session\) => session\.folderId === folder\.id && \(!session\.pinned/.test(sidebar));
check("rename commits once across Enter and blur", /renameCommittedRef/.test(sessionItem) && /event\.preventDefault\(\)/.test(sessionItem));
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
