/**
 * Mock Client for Browser-Only Dummy Dev Mode.
 * Intercepts Tauri IPC calls when not running inside Tauri.
 */

import { SECRET_PRESENT_VALUE } from "./settingsApi";
import { triggerMockStream } from "./mockStreaming";

// Local storage keys
const STORAGE_PREFIX = "zen_mock_";
const KEY_CHATS = `${STORAGE_PREFIX}chats`;
const KEY_MESSAGES = `${STORAGE_PREFIX}messages`;
const KEY_FOLDERS = `${STORAGE_PREFIX}folders`;
const KEY_SETTINGS = `${STORAGE_PREFIX}settings`;
const KEY_AGENTS = `${STORAGE_PREFIX}agents`;

// Simulated state with localStorage persistence
function loadData<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveData<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save mock state to localStorage", e);
  }
}

function redactMockValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") {
    if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(value)) {
      return "[redacted]";
    }
    return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => redactMockValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 48)) {
    output[key] = /(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(key)
      ? "[redacted]"
      : redactMockValue(item, depth + 1);
  }
  return output;
}

// Initial/default states
const defaultSettings: Record<string, string> = {
  theme: "dark",
  active_provider: "anthropic",
  active_model: "claude-3-5-sonnet",
  systemPrompt: "You are Zen, an advanced AI coding assistant.",
  temperature: "0.7",
  maxTokens: "4096",
  anthropic_api_key: SECRET_PRESENT_VALUE,
  openai_api_key: SECRET_PRESENT_VALUE,
  google_api_key: SECRET_PRESENT_VALUE,
};

const defaultChats = [
  {
    id: "chat-1",
    title: "Welcome to Zen!",
    model: "claude-3-5-sonnet",
    createdAt: Date.now() - 3600000 * 2,
    updatedAt: Date.now() - 3600000 * 2,
    pinned: 1,
    folderId: null,
    isArchived: 0,
  },
  {
    id: "chat-2",
    title: "Debugging Vite build error",
    model: "gpt-4o",
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 23,
    pinned: 0,
    folderId: "folder-1",
    isArchived: 0,
  }
];

const defaultMessages = [
  {
    id: "msg-1-1",
    chatId: "chat-1",
    role: "user",
    content: "Hello! Tell me about Zen.",
    createdAt: Date.now() - 3600000 * 2,
    isComplete: 1,
    kind: "text",
  },
  {
    id: "msg-1-2",
    chatId: "chat-1",
    role: "assistant",
    content: "Zen is a premium, powerful agentic AI coding environment and developer workbench. It supports typed state, semantic search, tools, child agents, terminal sessions, and a comprehensive streaming response model.",
    createdAt: Date.now() - 3600000 * 2 + 1000,
    isComplete: 1,
    kind: "text",
  },
  {
    id: "msg-2-1",
    chatId: "chat-2",
    role: "user",
    content: "Why am I getting a chunk size warning in Vite?",
    createdAt: Date.now() - 3600000 * 24,
    isComplete: 1,
    kind: "text",
  },
  {
    id: "msg-2-2",
    chatId: "chat-2",
    role: "assistant",
    content: "Vite warns you when chunks exceed 500 KB because they can impact page load times. You can split them using the `build.rollupOptions.output.manualChunks` configuration in `vite.config.ts`.",
    createdAt: Date.now() - 3600000 * 23,
    isComplete: 1,
    kind: "text",
  }
];

const defaultFolders = [
  {
    id: "folder-1",
    name: "Work",
    color: "#4f46e5",
    icon: "briefcase",
    createdAt: Date.now() - 3600000 * 48,
    updatedAt: Date.now() - 3600000 * 48,
  }
];

// In-memory mock database loaded from localStorage
let chats = loadData(KEY_CHATS, defaultChats);
let messages = loadData(KEY_MESSAGES, defaultMessages);
let folders = loadData(KEY_FOLDERS, defaultFolders);
let settings = loadData(KEY_SETTINGS, defaultSettings);
let agents = loadData<any[]>(KEY_AGENTS, []);

const mockVoiceDisplayAgent = {
  id: "voice_display",
  name: "ZEN-DISPLAY",
  description: "Automatic voice-mode render-only board agent",
  instructions: "",
  tool_ids: ["manage_board"],
  tool_count: 1,
  model_override: null,
  model_provider: null,
  max_iterations: 3,
  context_window: 131072,
  max_messages_in_memory: 20,
  model_tier: "Local",
  color: "blue",
  user_invocable: false,
  model_invocable: true,
  allow_nested_delegation: false,
  allowed_agent_ids: [],
  inject_agents_md: false,
  is_builtin: true,
  user_editable: false,
  config_mode: "model_only",
};

// Registry of commands
const mockCommands: Record<string, (args: any) => any> = {
  // Browser-only mode deliberately has no fabricated OSINT data. Live map data
  // is supplied by the Tauri GTSM commands in the desktop application.
  get_satellites: () => [],
  get_flights: () => [],
  get_earthquakes: () => [],
  get_military_aircraft: () => [],
  get_vessels: () => [],
  get_natural_events: () => [],

  // Settings API
  get_all_settings: () => settings,
  set_setting: ({ key, value }: { key: string; value: string }) => {
    settings[key] = value;
    saveData(KEY_SETTINGS, settings);
  },
  delete_secret: ({ key }: { key: string }) => {
    settings[key] = "";
    saveData(KEY_SETTINGS, settings);
  },
  set_settings: ({ settings: newSettings }: { settings: Record<string, string> }) => {
    settings = { ...settings, ...newSettings };
    saveData(KEY_SETTINGS, settings);
  },

  // Chats API
  get_chats: () => chats,
  get_chats_page: ({ limit = 20, offset = 0 }) => {
    const activeChats = chats.filter(c => !c.isArchived);
    return {
      items: activeChats.slice(offset, offset + limit),
      limit,
      offset,
      hasMore: offset + limit < activeChats.length,
    };
  },
  list_archived_chats: () => chats.filter(c => c.isArchived),
  list_archived_chats_page: ({ limit = 20, offset = 0 }) => {
    const archived = chats.filter(c => c.isArchived);
    return {
      items: archived.slice(offset, offset + limit),
      limit,
      offset,
      hasMore: offset + limit < archived.length,
    };
  },
  list_chat_folders: () => folders,
  get_messages: ({ chatId }: { chatId: string }) => {
    return messages.filter(m => m.chatId === chatId);
  },
  list_execution_traces: () => [],
  get_execution_trace: () => null,
  upsert_execution_trace: () => ({
    traceId: "trace-mock",
    chatId: "chat-1",
    messageId: "msg-mock",
    traceVersion: 2,
    status: "checkpoint",
    updatedAt: new Date().toISOString(),
    eventCount: 0,
    nodes: [],
    steps: [],
  }),
  get_messages_page: ({ chatId, limit = 50, offset = 0 }: { chatId: string; limit: number; offset: number }) => {
    const chatMsgs = messages.filter(m => m.chatId === chatId);
    return {
      items: chatMsgs.slice(offset, offset + limit),
      limit,
      offset,
      hasMore: offset + limit < chatMsgs.length,
    };
  },
  create_chat: ({ title, model, workspaceRoot }: { title: string; model: string | null; workspaceRoot?: string | null }) => {
    const newChat = {
      id: `chat-${Date.now()}`,
      title: title || "New Session",
      model: model || "claude-3-5-sonnet",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: 0,
      folderId: null,
      isArchived: 0,
      workspaceRoot: workspaceRoot ?? null,
    };
    chats = [newChat, ...chats];
    saveData(KEY_CHATS, chats);
    return newChat;
  },
  set_chat_workspace: ({ chatId, workspaceRoot }: { chatId: string; workspaceRoot: string | null }) => {
    chats = chats.map((chat) => chat.id === chatId
      ? { ...chat, workspaceRoot, updatedAt: Date.now() }
      : chat
    );
    saveData(KEY_CHATS, chats);
    return chats.find((chat) => chat.id === chatId) || null;
  },
  delete_chat: ({ chatId }: { chatId: string }) => {
    chats = chats.filter(c => c.id !== chatId);
    messages = messages.filter(m => m.chatId !== chatId);
    saveData(KEY_CHATS, chats);
    saveData(KEY_MESSAGES, messages);
  },
  update_chat_title: ({ chatId, title }: { chatId: string; title: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  toggle_pin_chat: ({ chatId }: { chatId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, pinned: c.pinned ? 0 : 1, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  archive_chat: ({ chatId }: { chatId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, isArchived: 1, archivedAt: new Date().toISOString(), updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  unarchive_chat: ({ chatId }: { chatId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, isArchived: 0, archivedAt: null, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  create_chat_folder: ({ name, color }: { name: string; color?: string | null }) => {
    const newFolder = {
      id: `folder-${Date.now()}`,
      name,
      color: color || "#6b7280",
      icon: "folder",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    folders = [...folders, newFolder];
    saveData(KEY_FOLDERS, folders);
    return newFolder;
  },
  update_chat_folder: ({ folderId, name, color }: { folderId: string; name?: string | null; color?: string | null }) => {
    folders = folders.map((folder) => folder.id === folderId
      ? { ...folder, ...(name ? { name } : {}), ...(color ? { color } : {}), updatedAt: Date.now() }
      : folder
    );
    saveData(KEY_FOLDERS, folders);
  },
  delete_chat_folder: ({ folderId }: { folderId: string }) => {
    folders = folders.filter((folder) => folder.id !== folderId);
    chats = chats.map((chat) => chat.folderId === folderId ? { ...chat, folderId: null } : chat);
    saveData(KEY_FOLDERS, folders);
    saveData(KEY_CHATS, chats);
  },
  move_chat_to_folder: ({ chatId, folderId }: { chatId: string; folderId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, folderId, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  remove_chat_from_folder: ({ chatId }: { chatId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, folderId: null, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },

  // Providers and Models
  get_provider_catalog: () => [
    { id: "ollama", defaultBaseUrl: "http://localhost:11434", baseUrl: "http://localhost:11434", isLocal: true, configured: true, apiKeyPresent: false, enabled: true },
    { id: "openai", defaultBaseUrl: "https://api.openai.com/v1", baseUrl: "https://api.openai.com/v1", isLocal: false, configured: false, apiKeyPresent: false, enabled: true },
    { id: "anthropic", defaultBaseUrl: "https://api.anthropic.com", baseUrl: "https://api.anthropic.com", isLocal: false, configured: false, apiKeyPresent: false, enabled: true },
  ],
  get_all_available_models: () => [
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic" },
    { id: "claude-3-opus", name: "Claude 3 Opus", provider: "anthropic" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "o3-mini", name: "o3-mini", provider: "openai" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  ],
  test_provider_connection: () => true,

  // Tools
  list_tool_metadata: () => [
    { id: "web_search", name: "Web Search", description: "Query the web for real-time information", riskLevel: "low" },
    { id: "bash_exec", name: "Run Command", description: "Execute a command in the terminal workspace", riskLevel: "high" },
    { id: "read_file", name: "Read File", description: "Read a file from disk", riskLevel: "low" },
  ],
  sync_tool_permissions: () => {},

  // Terminal
  terminal_spawn: () => "terminal-mock-session",
  terminal_request_approval: () => ({ approvalId: "terminal-mock-approval", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
  terminal_kill: () => {},
  terminal_resize: () => {},
  terminal_read_output: () => ({ sequence: 0, data: "" }),
  terminal_write: () => {},

  // System Metrics — return shape matching BackendSystemMetrics / HardwareInfo
  get_user_display_name: () => "tuyen",
  get_hardware_info: () => ({
    os: "Windows 11 (Dev Mode)",
    cpu: "Intel Core i7-13700H",
    cores: 14,
    threads: 20,
    memory_gb: 32,
    has_cuda: true,
    gpus: [
      {
        id: "mock-nvidia-0",
        system_index: 0,
        backend_device_index: 0,
        name: "NVIDIA GeForce RTX 4060 Laptop GPU",
        vendor: "NVIDIA",
        vram_mb: 8192,
        driver_version: "mock",
        cuda_capable: true,
      },
    ],
    disks: [
      { name: "System", mount_point: "C:\\", total_space: 512 * 1024 * 1024 * 1024, available_space: 180 * 1024 * 1024 * 1024, is_removable: false },
      { name: "Data", mount_point: "D:\\", total_space: 2048 * 1024 * 1024 * 1024, available_space: 1200 * 1024 * 1024 * 1024, is_removable: false },
    ],
  }),
  get_system_metrics: () => ({
    cpu_load: 12.5 + Math.random() * 5,
    mem_used: Math.round((14 + Math.random() * 2) * 1024 * 1024 * 1024),
    mem_total: 32 * 1024 * 1024 * 1024,
    net_up: Math.round(5000 + Math.random() * 20000),
    net_down: Math.round(15000 + Math.random() * 80000),
  }),

  // Memory RAG
  get_memory_stats: () => ({
    totalEntries: 42,
    lastCompactTime: Date.now() - 3600000,
  }),
  get_conversation_memories: () => [],
  clear_conversation_memories: () => {},
  list_session_memories_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),

  // Workspace
  browse_folder: ({ path }: { path: string | null }) => {
    const current = path || "D:\\DATA_VOLUME_D\\VScode\\GG_ANTIGRAV\\ZEN";
    const entries = [
      { name: "src", type: "dir", path: `${current}\\src` },
      { name: "src-tauri", type: "dir", path: `${current}\\src-tauri` },
      { name: "package.json", type: "file", path: `${current}\\package.json` },
      { name: "vite.config.ts", type: "file", path: `${current}\\vite.config.ts` },
    ];
    return {
      current,
      parent: "D:\\DATA_VOLUME_D\\VScode\\GG_ANTIGRAV",
      directories: entries.filter((entry) => entry.type === "dir"),
      entries,
    };
  },

  // Voice
  speak_text: () => {},
  stop_speech: () => {},
  transcribe_audio: () => ({ text: "" }),

  // MCP
  mcp_get_config: () => ({ servers: {} }),
  mcp_save_config: () => {},
  mcp_list_servers: () => [],
  mcp_get_inventory: () => ({ revision: 0, servers: [] }),

  // Graph / Session Map
  get_session_state: () => ({ nodes: [], edges: [] }),
  create_graph_session: () => "graph-session-mock",
  apply_session_action: () => ({}),
  rollback_session: () => ({}),

  // Agents
  list_agents: () => {
    const selection = settings.voiceDisplayAgentModel || "";
    const [provider, ...modelParts] = selection.split("::");
    const model = modelParts.length > 0 ? modelParts.join("::") : selection;
    return [
      { ...mockVoiceDisplayAgent, model_override: model || null, model_provider: modelParts.length > 0 ? provider : null },
      ...agents.filter((agent) => agent.id !== mockVoiceDisplayAgent.id),
    ];
  },
  create_agent: ({ profile }: { profile: any }) => {
    const agent = {
      ...profile,
      description: profile.description || "",
      model_tier: "Local",
      tool_count: profile.tool_ids?.length || 0,
      is_builtin: false,
      user_editable: true,
      config_mode: "full",
    };
    agents = [...agents, agent];
    saveData(KEY_AGENTS, agents);
    return agent;
  },
  update_agent: ({ profile }: { profile: any }) => {
    const agent = {
      ...profile,
      description: profile.description || "",
      model_tier: "Local",
      tool_count: profile.tool_ids?.length || 0,
      is_builtin: false,
      user_editable: true,
      config_mode: "full",
    };
    agents = agents.map((current) => current.id === agent.id ? agent : current);
    saveData(KEY_AGENTS, agents);
    return agent;
  },
  delete_agent: ({ agentId }: { agentId: string }) => {
    const previousLength = agents.length;
    agents = agents.filter((agent) => agent.id !== agentId);
    saveData(KEY_AGENTS, agents);
    return agents.length !== previousLength;
  },
  set_voice_display_model: ({ model }: { model: string | null }) => {
    settings.voiceDisplayAgentModel = model || "";
    saveData(KEY_SETTINGS, settings);
  },
  get_agent_config: () => ({}),

  // Tags
  list_chat_tags_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),
  list_all_chat_tags_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),
  list_unique_tag_names_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),

  // Chat extras
  search_chats: () => [],
  export_chat: () => ({}),
  import_chat: () => ({}),
  bulk_delete_chats: ({ chatIds }: { chatIds: string[] }) => {
    chats = chats.filter(c => !chatIds.includes(c.id));
    messages = messages.filter(m => !chatIds.includes(m.chatId));
    saveData(KEY_CHATS, chats);
    saveData(KEY_MESSAGES, messages);
  },
  abort_chat: () => true,
  pause_chat: () => true,
  continue_chat: () => true,

  // Tools extras
  run_tool_command: () => ({}),
  resolve_tool_approval: () => {},

  // GTSM / Telemetry
  get_telemetry_history: () => [],
  get_telemetry_history_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),
  get_entity_track_page: () => ({ items: [], limit: 20, offset: 0, hasMore: false }),
  compute_navigation_route: () => ({ points: [] }),

  // Sending a message: will be intercepted by the UI stream trigger
  send_message: (req: any) => {
    mockEmit("chat:status", {
      chat_id: req.chatId,
      message: "Request accepted",
      phase: "accepted",
      iteration: 0,
    });

    // Save user message immediately
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      chatId: req.chatId,
      role: "user",
      content: req.content,
      createdAt: Date.now(),
      isComplete: 1,
      kind: "text",
    };
    messages = [...messages, userMsg];
    saveData(KEY_MESSAGES, messages);
    mockEmit("chat:status", {
      chat_id: req.chatId,
      message: "Message saved",
      phase: "persisted",
      iteration: 0,
    });
    // Trigger mock stream
    setTimeout(() => {
      mockEmit("chat:status", {
        chat_id: req.chatId,
        message: "Invoking model",
        phase: "llm_invoked",
        iteration: 0,
      });
      triggerMockStream(req.chatId, req.content, {
        emit: mockEmit,
        redact: redactMockValue,
        saveAssistantMessage: (message) => {
          messages = [...messages, message as any];
          saveData(KEY_MESSAGES, messages);
        },
      });
    }, 200);
  },
};

// Event Subscriptions
const subscribers: Record<string, Array<(payload: any) => void>> = {};

export function mockListen(eventName: string, handler: (payload: any) => void) {
  if (!subscribers[eventName]) {
    subscribers[eventName] = [];
  }
  subscribers[eventName].push(handler);
  return () => {
    subscribers[eventName] = subscribers[eventName].filter(h => h !== handler);
  };
}

export function mockEmit(eventName: string, payload: any) {
  const handlers = subscribers[eventName] || [];
  handlers.forEach(h => {
    try {
      h({ payload, event: eventName });
    } catch (e) {
      console.error(`Error in mock event handler for ${eventName}`, e);
    }
  });
}

// Intercept Command Execution
export async function executeMockCommand(command: string, args: any): Promise<any> {
  console.log(`[Mock IPC] ${command}`, redactMockValue(args));
  const handler = mockCommands[command];
  if (handler) {
    return handler(args);
  }
  console.warn(`[Mock IPC] No handler defined for: ${command}`);
  return null;
}
