import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useStreamingChat } from "./useStreamingChat";
import { useChatQueries } from "./chat/useChatQueries";
import { useChatMutations } from "./chat/useChatMutations";
import { useSendMessage } from "./chat/useSendMessage";
import { useChatTurnAdvance } from "./chat/useChatTurnAdvance";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useGoalStore } from "@/lib/stores/goalStore";
import { chatApi } from "@/api";

export function useChat() {
  const queryClient = useQueryClient();

  const {
    sessions,
    sessionsLoading,
    archivedSessions,
    folders,
    currentSessionId,
    setCurrentSessionId,
    startNewChat,
    messages,
    setMessages,
    search,
    setSearch,
    searchResults,
    models,
    modelsLoading,
    refetchModels,
  } = useChatQueries();

  const storeActiveProvider = useSettingsStore(s => s.activeProvider);
  const storeActiveModel = useSettingsStore(s => s.activeModel);
  const switchModel = useSettingsStore(s => s.switchModel);

  const setSelectedModelId = (id: string, provider = storeActiveProvider) => switchModel(provider, id);
  const setSelectedProvider = (provider: string) => switchModel(provider);

  const selectedModelId = storeActiveModel || "No Model";
  const selectedProvider = storeActiveProvider || "ollama";

  const { isStreaming, abortStream, pauseStream, resumeStream } = useStreamingChat(currentSessionId);

  const mutations = useChatMutations({
    currentSessionId,
    setCurrentSessionId,
    sessions,
    archivedSessions,
    selectedModelId,
  });

  const { handleSendMessage } = useSendMessage(currentSessionId, () => mutations.handleCreateSession("New Case"));

  // After each finished turn: replay queued prompts, then consider goal
  // continuation. Mounted here (not in a section) so it tracks whichever
  // send pipeline the live workspace uses.
  useChatTurnAdvance(handleSendMessage);

  // Refresh the thread goal mirror when the active session changes so the
  // goal banner reflects the DB on first visit / after external changes.
  useEffect(() => {
    if (currentSessionId) {
      void useGoalStore.getState().loadGoal(currentSessionId);
    }
  }, [currentSessionId]);

  const handleExportSession = async (id: string) => {
    try {
      const data = await chatApi.exportChat(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zen-chat-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Chat exported");
    } catch (e) {
      toast.error("Failed to export chat");
    }
  };

  const handleImportSession = async (path: string) => {
    try {
      const chat = await chatApi.importChat(path) as { id: string };
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setCurrentSessionId(chat.id);
      toast.success("Chat imported");
    } catch (e) {
      toast.error("Failed to import chat");
    }
  };

  const fetchModels = () => {
    void refetchModels();
  };

  return {
    sessions,
    sessionsLoading,
    archivedSessions,
    folders,
    currentSessionId,
    setCurrentSessionId,
    startNewChat,
    messages,
    setMessages,
    search,
    setSearch,
    searchResults,
    models,
    modelsLoading,
    selectedModelId,
    setSelectedModelId,
    selectedProvider,
    setSelectedProvider,
    isStreaming,
    fetchModels,
    handleExportSession,
    handleImportSession,
    handleSendMessage,
    abortStream,
    pauseStream,
    resumeStream,
    ...mutations,
  };
}
