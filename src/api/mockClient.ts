/**
 * Mock Client for Browser-Only Dummy Dev Mode.
 * Intercepts Tauri IPC calls when not running inside Tauri.
 */

import { SECRET_PRESENT_VALUE } from "./settingsApi";
import { createActionStep } from "@/atlas/hooks/stream/agentActionLedger";

// Local storage keys
const STORAGE_PREFIX = "zen_mock_";
const KEY_CHATS = `${STORAGE_PREFIX}chats`;
const KEY_MESSAGES = `${STORAGE_PREFIX}messages`;
const KEY_FOLDERS = `${STORAGE_PREFIX}folders`;
const KEY_SETTINGS = `${STORAGE_PREFIX}settings`;

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

// Registry of commands
const mockCommands: Record<string, (args: any) => any> = {
  // Settings API
  get_all_settings: () => settings,
  set_setting: ({ key, value }: { key: string; value: string }) => {
    settings[key] = value;
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
  get_messages_page: ({ chatId, limit = 50, offset = 0 }: { chatId: string; limit: number; offset: number }) => {
    const chatMsgs = messages.filter(m => m.chatId === chatId);
    return {
      items: chatMsgs.slice(offset, offset + limit),
      limit,
      offset,
      hasMore: offset + limit < chatMsgs.length,
    };
  },
  create_chat: ({ title, model }: { title: string; model: string | null }) => {
    const newChat = {
      id: `chat-${Date.now()}`,
      title: title || "New Session",
      model: model || "claude-3-5-sonnet",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: 0,
      folderId: null,
      isArchived: 0,
    };
    chats = [newChat, ...chats];
    saveData(KEY_CHATS, chats);
    return newChat;
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
    chats = chats.map(c => c.id === chatId ? { ...c, isArchived: 1, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  unarchive_chat: ({ chatId }: { chatId: string }) => {
    chats = chats.map(c => c.id === chatId ? { ...c, isArchived: 0, updatedAt: Date.now() } : c);
    saveData(KEY_CHATS, chats);
  },
  create_chat_folder: ({ name }: { name: string }) => {
    const newFolder = {
      id: `folder-${Date.now()}`,
      name,
      color: "#6366f1",
      icon: "folder",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    folders = [...folders, newFolder];
    saveData(KEY_FOLDERS, folders);
    return newFolder;
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
  terminal_kill: () => {},
  terminal_resize: () => {},
  terminal_write: () => {},

  // System Metrics — return shape matching BackendSystemMetrics / HardwareInfo
  get_hardware_info: () => ({
    os: "Windows 11 (Dev Mode)",
    cpu: "Intel Core i7-13700H",
    cores: 14,
    threads: 20,
    memory_gb: 32,
    has_cuda: true,
    gpu: "NVIDIA GeForce RTX 4060 Laptop GPU",
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
  browseFolder: ({ path }: { path: string | null }) => ({
    currentPath: path || "D:\\DATA_VOLUME_D\\VScode\\GG_ANTIGRAV\\ZEN",
    entries: [
      { name: "src", isDir: true, sizeBytes: 0 },
      { name: "package.json", isDir: false, sizeBytes: 1540 },
      { name: "vite.config.ts", isDir: false, sizeBytes: 3872 },
    ],
  }),

  // Voice
  speak_text: () => {},
  stop_speech: () => {},
  transcribe_audio: () => ({ text: "" }),

  // MCP
  mcp_get_status: () => ({ isRunning: false, version: "1.0.0" }),
  mcp_list_tools: () => [],
  mcp_get_config: () => ({ servers: {} }),
  mcp_start_server: () => {},
  mcp_stop_server: () => {},
  mcp_save_config: () => {},

  // Graph / Session Map
  get_session_state: () => ({ nodes: [], edges: [] }),
  create_graph_session: () => "graph-session-mock",
  apply_session_action: () => ({}),
  rollback_session: () => ({}),

  // Agents
  list_agents: () => [],
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
  abort_chat: () => {},

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
    mockEmit("chat:status", {
      chat_id: req.chatId,
      message: "Provider ready: mock",
      phase: "provider_ready",
      provider: req.provider || "mock",
      model: req.model || "mock-model",
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
      triggerMockStream(req.chatId, req.content);
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
  console.log(`[Mock IPC] ${command}`, args);
  const handler = mockCommands[command];
  if (handler) {
    return handler(args);
  }
  console.warn(`[Mock IPC] No handler defined for: ${command}`);
  return null;
}

import chatFixtures from "../../test/chat-fixtures.json";

function getFixtureToolName(flow: any[], toolCallId: string): string {
  const lifecycleEvent = flow.find(
    (step: any) =>
      (step.type === "tool:start" || step.type === "tool:authorization_request" || step.type === "tool:complete") &&
      step.tool_call_id === toolCallId &&
      step.tool_name
  );
  return lifecycleEvent?.tool_name || toolCallId;
}

function getFixtureToolStartTimes(flow: any[]) {
  const startTimes = new Map<string, number>();
  let virtualElapsed = 0;
  const baseTime = Date.now();

  for (const step of flow) {
    if (step.type === "tool:start" || step.type === "tool:authorization_request") {
      startTimes.set(step.tool_call_id, baseTime + virtualElapsed);
    }
    virtualElapsed += typeof step.delay_ms === "number" ? step.delay_ms : 0;
  }

  return startTimes;
}

function buildFixtureActionStep(step: any, chatId: string, virtualTime: number) {
  if (step.type === "chat:status") {
    return createActionStep(
      {
        chat_id: chatId,
        timestamp: new Date(virtualTime).toISOString(),
        ...step.payload,
      },
      "chat_status",
    );
  }
  if (step.type === "agent:spawn") {
    return createActionStep(
      {
        chat_id: chatId,
        timestamp: new Date(virtualTime).toISOString(),
        ...step.payload,
      },
      "agent_spawn",
    );
  }
  if (step.type === "agent:complete") {
    return createActionStep(
      {
        chat_id: chatId,
        timestamp: new Date(virtualTime).toISOString(),
        ...step.payload,
      },
      "agent_complete",
    );
  }
  return null;
}

function buildFixtureExecutionSteps(flow: any[], finalContent: string, chatId: string) {
  const toolCompletes = new Map(
    flow
      .filter((step: any) => step.type === "tool:complete")
      .map((step: any) => [step.tool_call_id, step])
  );
  const toolStartTimes = getFixtureToolStartTimes(flow);
  const steps: any[] = [];
  const baseTime = Date.now();
  let virtualElapsed = 0;

  for (const step of flow) {
    const virtualTime = baseTime + virtualElapsed;
    const actionStep = buildFixtureActionStep(step, chatId, virtualTime);
    if (actionStep) {
      steps.push(actionStep);
    }

    if (step.type === "tool:start" || step.type === "tool:authorization_request") {
      const toolComplete = toolCompletes.get(step.tool_call_id) as any;
      steps.push({
        type: "tool-call",
        toolCall: {
          id: step.tool_call_id,
          name: step.tool_name,
          status: toolComplete?.status === "success" ? "completed" : "error",
          input: step.arguments,
          output: toolComplete?.output || "",
          durationMs: toolComplete?.duration_ms,
          agentId: step.agent_id,
          agentName: step.agent_name,
          iteration: step.iteration,
          batchId: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
          startTime: toolStartTimes.get(step.tool_call_id),
          approvalContext: step.context ? {
            riskLevel: step.context.risk_level || step.context.riskLevel,
            description: step.context.description,
            argumentsPreview: step.context.arguments_preview || step.context.argumentsPreview,
            suggestedPatterns: step.context.suggested_patterns || step.context.suggestedPatterns,
          } : undefined,
        },
      });
    }
    virtualElapsed += typeof step.delay_ms === "number" ? step.delay_ms : 0;
  }

  if (finalContent.trim()) {
    steps.push({ type: "text", content: finalContent });
  }

  return steps;
}

// Simulated Stream Response Generator
function triggerMockStream(chatId: string, userContent: string) {
  const normalizedInput = userContent.trim().toLowerCase();
  
  // Find matching test fixture from JSON
  let activeFixtureKey: keyof typeof chatFixtures | null = null;
  if (normalizedInput.includes("markdown") || normalizedInput.includes("test markdown")) {
    activeFixtureKey = "test_markdown";
  } else if (normalizedInput.includes("genui") || normalizedInput.includes("test genui")) {
    activeFixtureKey = "test_genui";
  } else if (normalizedInput.includes("toolcall") || normalizedInput.includes("test toolcall")) {
    activeFixtureKey = "test_toolcall";
  } else if (normalizedInput.includes("agentic") || normalizedInput.includes("codebuff") || normalizedInput.includes("delegation")) {
    activeFixtureKey = "test_agentic";
  }

  if (activeFixtureKey) {
    const fixture = chatFixtures[activeFixtureKey];
    let stepIndex = 0;

    function runNextStep() {
      if (stepIndex >= fixture.flow.length) return;
      const step: any = fixture.flow[stepIndex];
      stepIndex++;

      let delay = 300;

      if (step.type === "chat:status") {
        mockEmit("chat:status", { chat_id: chatId, ...step.payload });
        delay = 200;
      } else if (step.type === "agent:spawn") {
        mockEmit("agent:spawn", { chat_id: chatId, ...step.payload });
        delay = 450;
      } else if (step.type === "agent:complete") {
        mockEmit("agent:complete", { chat_id: chatId, ...step.payload });
        delay = 350;
      } else if (step.type === "research-step") {
        mockEmit("chat:research-step", {
          chat_id: chatId,
          text: step.text,
          status: step.status,
        });
        delay = 600;
      } else if (step.type === "chunk:first") {
        mockEmit("chat:chunk:first", { chat_id: chatId, delta: step.delta || "", type: "text" });
        delay = 100;
      } else if (step.type === "chunk") {
        mockEmit("chat:chunk", { chat_id: chatId, delta: step.delta || "", type: "text" });
        delay = 150;
      } else if (step.type === "artifact:start") {
        mockEmit("artifact:start", {
          chat_id: chatId,
          artifact_type: step.artifact_type,
          title: step.title,
          language: step.language,
        });
        delay = 300;
      } else if (step.type === "artifact:delta") {
        mockEmit("artifact:delta", {
          chat_id: chatId,
          delta: step.delta || "",
        });
        delay = 400;
      } else if (step.type === "artifact:complete") {
        mockEmit("artifact:complete", { chat_id: chatId });
        delay = 200;
      } else if (step.type === "tool:start") {
          mockEmit("tool:start", {
            chat_id: chatId,
            tool_call_id: step.tool_call_id,
            tool_name: step.tool_name,
            arguments: step.arguments,
            agent_id: step.agent_id,
            agent_name: step.agent_name,
            iteration: step.iteration,
            batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
          });
          delay = 1000;
        } else if (step.type === "tool:authorization_request") {
        mockEmit("tool:authorization_request", {
          chat_id: chatId,
            tool_call_id: step.tool_call_id,
            tool_name: step.tool_name,
            arguments: step.arguments,
            context: step.context || {},
            agent_id: step.agent_id,
            agent_name: step.agent_name,
            iteration: step.iteration,
            batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
          });
          delay = 700;
        } else if (step.type === "tool:complete") {
        mockEmit("tool:complete", {
          chat_id: chatId,
          tool_call_id: step.tool_call_id,
            tool_name: step.tool_name || getFixtureToolName(fixture.flow, step.tool_call_id),
            status: step.status,
            output: step.output,
            duration_ms: step.duration_ms,
            agent_id: step.agent_id,
            agent_name: step.agent_name,
            iteration: step.iteration,
            batch_id: step.batch_id || step.batchId || step.tool_batch_id || step.toolBatchId,
          });
          delay = 300;
      } else if (step.type === "done") {
        // Save completed assistant message to mock database
        const assistantMsg: any = {
          id: `msg-${Date.now()}-assistant`,
          chatId,
          role: "assistant",
          content: step.content || "",
          createdAt: Date.now(),
          isComplete: 1,
          kind: "text",
        };

        // For Gen UI attach artifact directly
        if (activeFixtureKey === "test_genui") {
          const genUiArtifactStep = fixture.flow.find((s: any) => s.type === "artifact:start") as any;
          const genUiArtifactDelta = fixture.flow.find((s: any) => s.type === "artifact:delta") as any;
          if (genUiArtifactStep && genUiArtifactDelta) {
            assistantMsg.artifact = {
              type: genUiArtifactStep.artifact_type,
              title: genUiArtifactStep.title,
              language: genUiArtifactStep.language,
              content: genUiArtifactDelta.delta || "",
            };
          }
        }

        // For Tool Call attach all fixture tool calls so the completed workflow stays visible after streaming.
        if (activeFixtureKey === "test_toolcall" || activeFixtureKey === "test_agentic") {
          const toolStarts = fixture.flow.filter((s: any) => s.type === "tool:start" || s.type === "tool:authorization_request") as any[];
          const toolCompletes = new Map(
            fixture.flow
              .filter((s: any) => s.type === "tool:complete")
              .map((s: any) => [s.tool_call_id, s])
          );
          const toolStartTimes = getFixtureToolStartTimes(fixture.flow);
          if (toolStarts.length > 0) {
            assistantMsg.toolCalls = toolStarts.map((toolStart) => {
              const toolComplete = toolCompletes.get(toolStart.tool_call_id) as any;
              return {
                id: toolStart.tool_call_id,
                name: toolStart.tool_name,
                status: toolComplete?.status === "success" ? "completed" : "error",
                input: toolStart.arguments,
                output: toolComplete?.output || "",
                durationMs: toolComplete?.duration_ms,
                agentId: toolStart.agent_id,
                agentName: toolStart.agent_name,
                iteration: toolStart.iteration,
                batchId: toolStart.batch_id || toolStart.batchId || toolStart.tool_batch_id || toolStart.toolBatchId,
                startTime: toolStartTimes.get(toolStart.tool_call_id),
                approvalContext: toolStart.context ? {
                  riskLevel: toolStart.context.risk_level || toolStart.context.riskLevel,
                  description: toolStart.context.description,
                  argumentsPreview: toolStart.context.arguments_preview || toolStart.context.argumentsPreview,
                  suggestedPatterns: toolStart.context.suggested_patterns || toolStart.context.suggestedPatterns,
                } : undefined,
              };
            });
          }
          assistantMsg.steps = buildFixtureExecutionSteps(fixture.flow, step.content || "", chatId);
          assistantMsg.metadata = JSON.stringify({
            executionSteps: assistantMsg.steps,
          });
        }

        messages = [...messages, assistantMsg];
        saveData(KEY_MESSAGES, messages);

        mockEmit("chat:done", { chat_id: chatId, content: step.content || "" });
        return;
      }

      setTimeout(runNextStep, typeof step.delay_ms === "number" ? step.delay_ms : delay);
    }

    setTimeout(runNextStep, 200);
    return;
  }

  // Fallback to standard message simulation
  // 1. Emit chunk:first (zero-serialize TTFT simulation)
  mockEmit("chat:chunk:first", { chat_id: chatId, delta: "", type: "text" });

  // 2. Emit reasoning / research steps to simulate agent loop
  mockEmit("chat:research-step", {
    chat_id: chatId,
    text: "Analyzing project architecture and configuration...",
    status: "running",
  });

  setTimeout(() => {
    mockEmit("chat:research-step", {
      chat_id: chatId,
      text: "Found relevant files: package.json, vite.config.ts",
      status: "completed",
    });
  }, 1000);

  // 3. Simulated response words
  const responseText = `I have received your message: "${userContent}".\n\nThis is a fully-functioning Browser Dummy mode. You can edit files, query settings, and inspect components inside your standard web browser! Outstanding!`;
  const chunks = responseText.split(" ");
  let currentText = "";
  let chunkIdx = 0;

  function emitNextChunk() {
    if (chunkIdx < chunks.length) {
      const delta = chunks[chunkIdx] + " ";
      currentText += delta;
      mockEmit("chat:chunk", { chat_id: chatId, delta });
      chunkIdx++;
      setTimeout(emitNextChunk, 80);
    } else {
      // 4. Save completed assistant message to mock database
      const assistantMsg = {
        id: `msg-${Date.now()}-assistant`,
        chatId,
        role: "assistant",
        content: responseText,
        createdAt: Date.now(),
        isComplete: 1,
        kind: "text",
      };
      messages = [...messages, assistantMsg];
      saveData(KEY_MESSAGES, messages);

      // 5. Emit chat:done
      mockEmit("chat:done", { chat_id: chatId, content: responseText });
    }
  }

  setTimeout(emitNextChunk, 1500);
}
