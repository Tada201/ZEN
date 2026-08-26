import { readFileSync } from "node:fs";

const read = (path) => {
  // `services/tool.rs` was split into `services/tool/{agent_exec,approval,audit,
  // authorized,entry,mutations}.rs`. Read the parent plus every submodule as one
  // blob so shape assertions that predate the split keep anchoring on the same
  // content.
  if (path === "src-tauri/src/services/tool.rs") {
    return ["agent_exec", "approval", "audit", "authorized", "entry", "mutations"]
      .map((f) => readFileSync(new URL(`../src-tauri/src/services/tool/${f}.rs`, import.meta.url), "utf8"))
      .concat(readFileSync(new URL("../src-tauri/src/services/tool.rs", import.meta.url), "utf8"))
      .join("\n");
  }
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
};
const checks = [];
const check = (label, condition) => checks.push([label, condition]);

const models = read("src-tauri/crates/zen-db/src/models.rs");
const migrations = ["core_tables.rs", "chats.rs"]
  .map((f) => read(`src-tauri/crates/zen-db/src/migrations/${f}`))
  .join("\n");
const queries = read("src-tauri/crates/zen-db/src/queries/chat.rs");
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
check("archived chat listing uses an explicit workspace-aware projection", /list_archived_chats_page/.test(queries) && /WHERE c\.is_archived = 1/.test(queries) && /c\.archived_at IS NOT NULL/.test(queries) && /c\.workspace_root/.test(queries) && !/SELECT \* FROM chats WHERE is_archived/.test(queries));
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
check("mock mode supports session workspace and group updates", /set_chat_workspace/.test(mock) && /workspaceRoot/.test(mock) && /update_chat_folder/.test(mock) && /color/.test(mock));
check("folder browser synchronizes when the active session changes", /if \(!open\)/.test(browser) && /\[open, value, browse\]/.test(browser));
// The session workspace is fixed when the chat is created, so the chat context
// surfaces it read-only. Picking a root stays in workspace settings; an in-chat
// picker would let a running session silently change its own boundary.
check("active chat header exposes the immutable session scope", /WorkspaceContextHeader/.test(workspaceUi) && /FolderLock/.test(workspaceHeader) && /capturedWorkspacePath/.test(workspaceHeader) && /effectiveWorkspacePath/.test(workspaceHeader) && /Locked for this chat/.test(workspaceHeader) && /Start a new chat to choose a different workspace/.test(workspaceHeader) && !/FolderBrowser/.test(workspaceHeader));
check("workspace labels distinguish default, captured, and missing roots", /Default workspace/.test(workspaceHeader) && /Legacy\/imported chat · follows default workspace/.test(workspaceHeader) && /Workspace not configured/.test(workspaceHeader) && /Workspace:/.test(workspaceHeader));
check("welcome picker explains the selected path before chat creation", /Workspace: \$\{workspaceName\(selectedWorkspace\)\}/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")) && /Choose a workspace before sending/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")) && /Open folder/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")));
check("welcome does not present a fake hard-coded Git branch", /Branch unavailable/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")) && /Git branch selection is not available yet/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")) && !/font-medium text-foreground>main/.test(read("src/atlas/components/chat/WorkspaceWelcome.tsx")));
check("settings and sidebar use default-workspace terminology", /Default workspace/.test(browser) && /Default workspace/.test(sidebar) && /configured default workspace/.test(sidebar));
// Sessions are grouped by their captured workspace root, the way Codex lists chats
// under their project. Date buckets hid which boundary a chat could touch.
check("sidebar groups chats by their captured workspace root", /workspaceGroups/.test(sidebar) && /workspaceRootKey\(session\)/.test(sidebar) && /Default workspace/.test(sidebar) && /workspaceDisplayName/.test(sidebar) && !/`Workspace: \$\{/.test(sidebar));
check("sidebar caps and fades long workspace names", /MAX_WORKSPACE_DISPLAY_LENGTH = 28/.test(sidebar) && /name\.slice\(0, MAX_WORKSPACE_DISPLAY_LENGTH - 1\)/.test(sidebar) && /maskImage: \"linear-gradient/.test(sidebar) && /shrink-0 text-\[10px\] text-muted-foreground/.test(sidebar));
check("sidebar names archived chats explicitly", /Open archived chats/.test(sidebar) && /Show active chats/.test(sidebar) && /Archived chats/.test(sidebar));
check("archived sidebar mode filters sessions and search results by archive state", /archivedSessions\.filter/.test(sidebar) && /session\.archived === true/.test(sidebar) && /!activeSessionIds\.has\(session\.id\)/.test(sidebar) && /sessions\.filter\(\(session\) => session\.archived !== true\)/.test(sidebar) && /visibleSearchResults/.test(sidebar) && /visibleIds\.has\(result\.chatId\)/.test(sidebar));
check("frontend archive queries enforce the backend archive boundary", /Number\(chat\.isArchived \?\? 0\) === 1 && Boolean\(chat\.archivedAt\)/.test(queriesHook) && /filter\(\(session\) => !session\.archived\)/.test(queriesHook) && /filter\(\(session\) => session\.archived\)/.test(queriesHook) && /invalidateQueries\(\{ queryKey: \[\"archived-sessions\"\]/.test(mutations));
check("legacy malformed archive rows are repaired as active", /UPDATE chats SET is_archived = 0 WHERE is_archived = 1 AND archived_at IS NULL/.test(migrations) && /c\.is_archived = 1 AND c\.archived_at IS NOT NULL/.test(queries));
check("archived sidebar rows are visibly marked as archived", /showArchived && !isSearchResult/.test(sessionItem) && /Archived chat/.test(sessionItem) && /ArchiveRestore/.test(sessionItem));
check("archived Timeline keeps non-empty chat groups without duplicating grouped chats", /visibleFolders/.test(sidebar) && /folderSessions\.get\(folder\.id\)\?\.length/.test(sidebar) && /displayMode === \"timeline\"/.test(sidebar));
check("workspace mode retains archived chats under their original workspace", /for \(const session of filteredSessions\)/.test(sidebar) && /archivedWorkspaceChatIds/.test(sidebar) && /Unarchive workspace/.test(sidebar));
check("workspace context menus can archive every active chat in that workspace", /allWorkspaceChatIds/.test(sidebar) && /Archive workspace/.test(sidebar) && /archiveWorkspaceTarget/.test(sidebar) && /chatIds\.forEach\(\(chatId\) => onArchive\(chatId\)\)/.test(sidebar));
check("archived sessions open as read-only transcripts", /archivedSessions\.some\(\(session\) => session\.id === currentSessionId\)/.test(workspaceUi) && /readOnly=\{isArchivedSession\}/.test(workspaceUi) && /Archived transcript · read-only/.test(read("src/atlas/components/ChatInputFooter.tsx")) && /disabled=\{readOnly\}/.test(read("src/atlas/components/ChatInputTextAreaBlock.tsx")));
check("archived transcript actions cannot resume agent work", /onRetry=\{isArchivedSession \? undefined : handleRetry\}/.test(workspaceUi) && /onRegenerate=\{isArchivedSession \? undefined : handleRegenerate\}/.test(workspaceUi) && /onContinueResearch=\{isArchivedSession \? undefined : handleContinueResearch\}/.test(workspaceUi));
check("archived chat header exposes unarchive instead of archive", /onUnarchiveSession/.test(workspaceHeader) && /Unarchive chat/.test(workspaceHeader) && /session\?\.archived/.test(workspaceHeader));
check("sidebar supports workspace and newest-first timeline views", /SessionDisplayMode = "workspace" \| "timeline"/.test(sidebar) && /displayMode === "timeline"/.test(sidebar) && /timelineSessions/.test(sidebar) && /sortMode === "updated"/.test(sidebar));
check("sidebar persists sort and display preferences locally", /DISPLAY_MODE_STORAGE_KEY/.test(sidebar) && /SORT_MODE_STORAGE_KEY/.test(sidebar) && /localStorage\.setItem/.test(sidebar));
check("workspace groups can be manually reordered without changing their chat roots", /WORKSPACE_ORDER_DRAG_TYPE/.test(sidebar) && /handleWorkspaceDrop/.test(sidebar) && /setWorkspaceOrder/.test(sidebar) && /workspaceOrder/.test(sidebar));
check("workspace reordering uses a dedicated handle with keyboard fallback", /aria-roledescription=\"sortable workspace\"/.test(sidebar) && /GripVertical/.test(sidebar) && /ArrowUp/.test(sidebar) && /ArrowDown/.test(sidebar));
check("workspace drag drops support reliable before-or-after placement feedback", /dragOverWorkspacePosition/.test(sidebar) && /getWorkspaceDropPosition/.test(sidebar) && /position === \"after\"/.test(sidebar) && /text\/plain/.test(sidebar) && /bg-primary/.test(sidebar));
check("new chats default to the configured workspace without a second owner", /useSettingsStore\.getState\(\)\.workspacePath/.test(mutations) && /workspaceRoot/.test(mutations) && /default workspace/.test(mutations));
check("sidebar group actions close the menu before opening dialogs", /casesMenuOpen/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setFolderDialogOpen\(true\)/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setGroupEditTarget/.test(sidebar) && /setCasesMenuOpen\(false\)[\s\S]*setDeleteFolderTarget/.test(sidebar));
check("sidebar renders folders as visible organization groups", /expandedFolders/.test(sidebar) && /folders\.map\(/.test(sidebar) && /folderChats/.test(sidebar) && /folder\.name/.test(sidebar));
check("chat groups appear only in Timeline mode", /displayMode === \"timeline\" && deferredSearch.length === 0 && visibleFolders.length > 0/.test(sidebar) && !/displayMode === \"workspace\" && deferredSearch.length === 0 && visibleFolders.length > 0/.test(sidebar));
check("Timeline does not duplicate chats assigned to a group", /filteredSessions\.filter\(\(session\) => !session\.folderId\)\.sort\(compareSessions\)/.test(sidebar) && /\.filter\(\(session\) => session\.folderId === folder\.id\)/.test(sidebar));
check("sidebar preserves empty folders and avoids duplicate assigned chats", /folders\.map\([\s\S]*folderChats/.test(sidebar) && /session\.folderId/.test(sidebar) && /!session\.folderId/.test(sidebar));
check("folder creation remains wired to the typed mutation", /onCreateFolder\(name/.test(sidebar) && /handleCreateFolder/.test(mutations));
check("chat groups support named colors in create and edit flows", /createFolder: \(name: string, color\?: string\)/.test(api) && /updateFolder: \(folderId: string, name\?: string, color\?: string\)/.test(api) && /ChatGroupDialog/.test(sidebar) && /CHAT_GROUP_COLORS/.test(read("src/atlas/components/chat/ChatGroupDialog.tsx")) && /onRenameFolder\(groupEditTarget\.id, name, color\)/.test(sidebar));
check("sidebar exposes safe CRUD actions for chats and groups", /requestDeleteSession/.test(sidebar) && /Delete chat/.test(sidebar) && /onDelete\(deleteSessionTarget\.id\)/.test(sidebar) && /Create chat group/.test(sidebar) && /Edit group/.test(sidebar) && /onDeleteFolder\(deleteFolderTarget\.id\)/.test(sidebar));
check("sidebar matches the reference utility navigation", /label=\"New task\"/.test(sidebar) && /label=\"Search\"/.test(sidebar) && /label=\"Automations\"/.test(sidebar) && /label=\"Skills\"/.test(sidebar) && /coming soon/.test(sidebar));
check("chat-group creation is exposed only in Timeline mode", /!showArchived && displayMode === \"timeline\" &&/.test(sidebar) && /aria-label=\"Create chat group\"/.test(sidebar));
check("sidebar session controls use compact aligned rows", /Session controls are intentionally split into dedicated rows/.test(sidebar) && /flex min-w-0 items-center justify-between gap-2/.test(sidebar) && /flex shrink-0 items-center gap-0\.5/.test(sidebar));
check("sidebar keeps mode and action controls compact for group creation", /h-6 shrink-0 items-center/.test(sidebar) && /h-6 w-6/.test(sidebar) && /gap-0\.5/.test(sidebar));
check("sidebar uses one unified compact spacing scale", /flex h-9 w-full/.test(sidebar) && /p-1\.5 space-y-2\.5/.test(sidebar) && /py-8 px-3/.test(sidebar) && /h-8 flex items-center justify-between px-1\.5/.test(sidebar) && /py-1\.5 rounded-md/.test(sessionItem));
check("non-selected sidebar icon controls do not retain click highlights", /focus:bg-transparent/.test(sidebar) && /focus-visible:ring-0/.test(sidebar) && /active:bg-transparent/.test(sidebar) && /data-\[state=open\]:bg-transparent/.test(sidebar));
check("sidebar removes redundant display-mode heading text", !/displayMode === \"workspace\" \? \"Workspaces\" : \"Chat timeline\"/.test(sidebar) && /role=\"tablist\" aria-label=\"Chat display mode\"/.test(sidebar));
check("sidebar uses a compact filter button for chat ordering", /ListFilter/.test(sidebar) && /Filter and sort chats: \$\{sortMode\} first/.test(sidebar) && /Updated first/.test(sidebar) && /Created first/.test(sidebar));
check("sidebar has one expand-or-collapse-all controller for the active section view", /ChevronsUpDown/.test(sidebar) && /sectionsExpansion/.test(sidebar) && /Expand all sections/.test(sidebar) && /Collapse all sections/.test(sidebar) && /setSectionsExpansion\(allSectionsExpanded \? \"none\" : \"all\"\)/.test(sidebar));
check("individual section toggles release the global expansion mode", /setSectionsExpansion\(null\)/.test(sidebar) && /isFolderExpanded/.test(sidebar) && /isWorkspaceExpanded/.test(sidebar));
check("sidebar delegates session search to the universal search surface", !/placeholder=\"Search chats\.\.\.\"/.test(sidebar) && !/Focus search/.test(sidebar) && !/searchInputRef/.test(sidebar));
check("universal search can query and open sessions", /UniversalSessionSearch/.test(workspaceUi) && /isUniversalSearchOpen/.test(workspaceUi) && /setSearch/.test(workspaceUi) && /search-sessions/.test(queriesHook) && /onOpenSearch=\{toggleUniversalSearch\}/.test(workspaceUi));
check("workspace headers can start a draft without mutating the workspace root", /onCreateInWorkspace\?:/.test(sidebar) && /New chat in workspace/.test(sidebar) && /setPendingWorkspaceRoot\(workspaceRoot/.test(read("src/atlas/sections/WorkspaceSection.tsx")));
check("group colors are visible beside group and chat labels", /folder\.color/.test(sidebar) && /folder\?\.color/.test(read("src/atlas/components/chat/SessionSidebarItem.tsx")));
check("workspace groups expose move context menus", /ContextMenu/.test(sidebar) && /Move to group/.test(sidebar) && /workspaceGroups/.test(sidebar));
check("workspace and chat rows support folder drag and drop without bubbling group ownership", /draggable/.test(sidebar) && /onDragStart/.test(sidebar) && /onDrop/.test(sidebar) && /application\/x-zen/.test(sidebar) && /event\.stopPropagation\(\)/.test(sidebar));
check("archived folder projections stay synchronized", /\[\"archived-sessions\"\]/.test(mutations) && /folderId: null/.test(mutations));
check("grouped chats are not rendered twice in Timeline", /filter\(\(session\) => session\.folderId === folder\.id\)/.test(sidebar) && /filteredSessions\.filter\(\(session\) => !session\.folderId\)/.test(sidebar));
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
