export { mcpApi } from "./mcpApi";
export {
  getIpcErrorMessage,
  IpcCommandError,
  IS_TAURI,
  isIpcCommandError,
} from "./tauriClient";
export type { IpcErrorCode, IpcErrorPayload } from "./tauriClient";
export type {
  McpAvailability,
  McpCapabilitySummary,
  McpConfig,
  McpElicitAction,
  McpElicitMode,
  McpInventory,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpResource,
  McpResourceContents,
  McpResourceTemplate,
  McpScope,
  McpServerEntry,
  McpServerRecord,
  McpServerStatus,
  McpServerStatusEvent,
  McpTransport,
  PendingConsent,
  PendingElicitation,
} from "./mcpApi";
export { chatApi } from "./chatApi";
export type {
  BackendChat,
  BackendExecutionTrace,
  BackendChatTag,
  BackendFolder,
  BackendMessage,
  PaginatedResponse,
  SearchResult,
  SendMessageRequest,
} from "./chatApi";
export { goalApi } from "./goalApi";
export type { BackendThreadGoal, ThreadGoalStatus } from "./goalApi";
export { artifactsApi } from "./artifactsApi";
export type { BackendArtifact } from "./artifactsApi";
export { documentsApi } from "./documentsApi";
export type { BackendDocument } from "./documentsApi";
export { dependenciesApi } from "./dependenciesApi";
export type { DependencyStatus } from "./dependenciesApi";
export {
  mapBackendToolMeta,
  normalizeToolRiskLevel,
  toolsApi,
} from "./toolsApi";
export type {
  BackendToolMeta,
  RunToolCommandRequest,
  ToolCheckpoint,
  ToolMeta,
  ToolRiskLevel,
  UndoToolCallResult,
} from "./toolsApi";
export {
  isSecretPresentValue,
  SECRET_PRESENT_VALUE,
  settingsApi,
} from "./settingsApi";
export { providersApi } from "./providersApi";
export type { ProviderConfigRequest } from "./providersApi";
export { backupApi } from "./backupApi";
export type { BackupInspection, BackupOptions, BackupSummary } from "./backupApi";
export { systemApi } from "./systemApi";
export type { BackendSystemMetrics, HardwareInfo } from "./systemApi";
export { terminalApi } from "./terminalApi";
export { workspaceApi } from "./workspaceApi";
export type { BrowseFolderResult, FolderEntry } from "./workspaceApi";
export { agentsApi } from "./agentsApi";
export type { AgentInfo, AgentProfileDraft } from "./agentsApi";
export { memoryApi } from "./memoryApi";
export type { MemoryEntry, MemorySearchResult, MemoryStats, SessionMemoryItem } from "./memoryApi";
export { gtsmApi } from "./gtsmApi";
export type { ComputeNavigationRouteRequest, GtsmFavorite, GtsmGeofence, GtsmMarker, TrackPoint } from "./gtsmApi";
export { voiceApi } from "./voiceApi";
export type { TranscriptionResult } from "./voiceApi";
export { sessionApi } from "./sessionApi";
export { workbenchApi } from "./workbenchApi";
export type { BackendWorkbenchTab } from "./workbenchApi";
