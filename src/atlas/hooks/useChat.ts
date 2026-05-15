import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useStreamingChat } from "./useStreamingChat";
import { Session, Message, Attachment } from "../components/chat/types";
import { type Model } from "../components/ModelSettingsContent";

// Helper to bridge backend Chat to frontend Session
const mapChatToSession = (chat: any): Session => ({
  id: chat.id,
  title: chat.title || "No Title",
  model: chat.model || "No Model",
  systemPrompt: "",
  createdAt: new Date(chat.createdAt).getTime(),
  updatedAt: new Date(chat.updatedAt).getTime(),
  pinned: chat.pinned === 1,
});

// Helper to bridge backend Message to frontend Message
const mapDbMessageToMessage = (msg: any): Message => ({
  id: msg.id,
  sessionId: msg.chatId,
  role: msg.role as any,
  content: msg.content,
  attachments: [], // Attachments are handled via metadata or separate query in full impl
  toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : [],
  artifact: null,
  createdAt: new Date(msg.createdAt).getTime(),
  model: msg.model,
  status: msg.isComplete === 1 ? "sent" : "sending",
});

export function useChat() {
  const queryClient = useQueryClient();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  
  const [selectedModelId, setSelectedModelId] = useState<string>("No Model");
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  
  const { isStreaming, abortStream } = useStreamingChat(currentSessionId, setMessages);

  // --- Queries ---

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const chats = await invoke<any[]>("get_chats");
      return chats.map(mapChatToSession);
    },
  });

  const { data: models = [], isFetching: modelsLoading } = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      // Return empty until real discovery is implemented
      return [] as Model[];
    },
  });

  const { data: fetchedMessages } = useQuery({
    queryKey: ["messages", currentSessionId],
    queryFn: async () => {
      const msgs = await invoke<any[]>("get_messages", { chatId: currentSessionId });
      return msgs.map(mapDbMessageToMessage);
    },
    enabled: !!currentSessionId,
  });

  // Sync messages local state with query data
  useEffect(() => {
    if (fetchedMessages) {
      setMessages(fetchedMessages);
    } else if (!currentSessionId) {
      setMessages([]);
    }
  }, [fetchedMessages, currentSessionId]);

  // Auto-select first session if none selected
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  const createSessionMutation = useMutation({
    mutationFn: (title?: string) => invoke<any>("create_chat", { title: title || "No Conversation" }),
    onSuccess: (chat) => {
      const session = mapChatToSession(chat);
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => [session, ...(prev || [])]);
      setCurrentSessionId(session.id);
    },
    onError: () => toast.error("Failed to create session"),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("delete_chat", { chatId: id }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter((s) => s.id !== id));
      if (currentSessionId === id) setCurrentSessionId(null);
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  const handleSendMessage = useCallback(async (data: {
    message: string;
    model: string;
    provider?: string;
    webSearch?: boolean;
    thinking?: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    generativeUI?: boolean;
    attachments?: Attachment[];
    tools?: string[];
  }) => {
    if (!currentSessionId) return;

    try {
      // Invoke the backend send_message command
      // The backend will handle the DB persistence and start the agent runner
      await invoke("send_message", {
        chatId: currentSessionId,
        content: data.message,
        model: data.model,
        provider: data.provider,
        webSearch: data.webSearch,
        thinking: data.thinking,
        generativeUi: data.generativeUI,
        tools: data.tools,
        attachments: data.attachments,
      });

      // The useStreamingChat hook will handle listening for events and updating the message list
    } catch (e: any) {
      toast.error(e.toString() || "Failed to send message");
    }
  }, [currentSessionId]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    messages,
    setMessages,
    search,
    setSearch,
    models,
    modelsLoading,
    selectedModelId,
    setSelectedModelId,
    selectedProvider,
    setSelectedProvider,
    isStreaming,
    fetchModels: () => {}, // Mocked for now
    handleCreateSession: (title?: string) => createSessionMutation.mutate(title),
    handleDeleteSession: (id: string) => deleteSessionMutation.mutate(id),
    handleRenameSession: (_id: string, _title: string) => {}, // Implement rename command if needed
    handlePinSession: (_id: string, _pinned: boolean) => {},
    handleExportSession: (_id: string) => {},
    handleClearTests: () => {},
    handleDeleteAll: () => {},
    handleSendMessage,
    abortStream
  };
}
