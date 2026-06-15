/* ═══════════════════════════════════════════════════════════════
   ChatSection — Full AI Chat Interface
   Sessions · Markdown · Code blocks · Tool calls · Artifact panel
   Image attachments · API key management · SQLite persistence
 ═══════════════════════════════════════════════════════════════ */
import { useState, useCallback, useEffect, useTransition, useMemo } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/atlas/hooks/useChat";
import { motion, AnimatePresence } from "framer-motion";

// Modular Components
import { 
  ArtifactData
} from "../components/chat/types";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { AgentActionStep } from "../components/chat/AssistantMessageTrace";
import { MessageList } from "../components/chat/MessageList";
import { PremiumChatInput } from "../components/PremiumChatInput";
import { SettingsModal, type TabId } from "../components/SettingsModal";
import { VoiceModeOverlay } from "../components/voice";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useChatStore } from "@/lib/stores/useChatStore";
import { VOICE_MODE_SYSTEM_PROMPT } from "../components/voice/voiceModePrompt";

export function ChatApp({ fullScreen: _fullScreen }: { fullScreen?: boolean }) {
  const [, startTransition] = useTransition();
  const {
    sessions, archivedSessions, folders, currentSessionId, setCurrentSessionId,
    messages, setMessages, search, setSearch, searchResults,
    models, selectedModelId, setSelectedModelId,
    selectedProvider, isStreaming,
    handleCreateSession, handleDeleteSession,
    handleRenameSession, handlePinSession, handleArchiveSession,
    handleUnarchiveSession, handleExportSession,
    handleDeleteAll, handleCreateFolder, handleMoveToFolder,
    handleSendMessage, abortStream
  } = useChat();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const handleOpenArtifact = useCallback((art: ArtifactData) => {
    const artId = art.id || `art_${Date.now()}`;
    const fullArt = { ...art, id: artId };
    
    // Add to chat store
    useChatStore.getState().addArtifact(fullArt);
    useChatStore.getState().setActiveArtifact(artId);
    
    // Open right panel and set active tab
    useUIStore.getState().setRightPanelOpen(true);
    useUIStore.getState().setActiveRightTab('artifacts');
  }, []);
  
  // Settings UI State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<TabId>("general");

  // Options UI State
  const [webSearch] = useState(false);
  const [generativeUI, setGenerativeUI] = useState(false);
  const voiceModeOpen = useUIStore(s => s.voiceModeOpen);
  const toggleVoiceMode = useUIStore(s => s.toggleVoiceMode);

  const handleSendMessageInternal = useCallback(async (data: {
    message: string;
    model: string;
    provider?: string;
    webSearch?: boolean;
    thinking?: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    deepResearch?: boolean;
    generativeUI?: boolean;
    attachments?: any[];
    files?: any[];
    tools?: string[];
    systemPrompt?: string | null;
    systemPromptMode?: "append" | "replace" | null;
  }) => {
    handleSendMessage({
      ...data,
      generativeUI: data.generativeUI != null ? data.generativeUI : generativeUI,
      tools: data.tools
    });
  }, [handleSendMessage, generativeUI]);

  const handleRetry = useCallback(async (messageId: string) => {
    const failedMsgIndex = messages.findIndex(m => m.id === messageId);
    if (failedMsgIndex === -1) return;

    let lastUserMsg = null;
    for (let i = failedMsgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMsg = messages[i];
        break;
      }
    }

    if (!lastUserMsg) return;

    const preservedMessages = messages.slice(0, failedMsgIndex);
    const failedMsg = messages[failedMsgIndex];
    
    setMessages(preservedMessages);
    handleSendMessage({
      message: lastUserMsg.content,
      model: failedMsg.model || selectedModelId,
      provider: failedMsg.provider || selectedProvider,
      webSearch: failedMsg.webSearch ?? webSearch,
      generativeUI: failedMsg.generativeUI != null ? !!failedMsg.generativeUI : generativeUI,
      // Pass thinking config if available in failed message or from current state
      thinking: failedMsg.thinking || { enabled: false } 
    });
  }, [messages, setMessages, handleSendMessage, selectedModelId, selectedProvider, webSearch, generativeUI]);

  const onOpenSettings = useCallback((tab: TabId) => {
    setSettingsTab(tab);
    setShowSettingsModal(true);
  }, []);

  const onSelectModel = useCallback((id: string, provider: string) => {
    setSelectedModelId(id, provider);
  }, [setSelectedModelId]);

  const onToggleSidebar = useCallback(() => setIsSidebarOpen(false), []);

  const latestStatusStep = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!isStreaming || lastMessage?.role !== "assistant" || !lastMessage.steps) return null;
    
    for (let i = lastMessage.steps.length - 1; i >= 0; i--) {
      const step = lastMessage.steps[i];
      if (step.type === "action" && step.kind === "chat_status") {
        return step;
      }
    }
    return null;
  }, [messages, isStreaming]);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background font-sans selection:bg-primary/20 ui-Zen-bg">
      {/* Session Sidebar */}
      <AnimatePresence initial={false} mode="wait">
        {isSidebarOpen && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-y-0 left-0 z-50 h-full w-64 min-w-[256px] max-w-[256px] flex-shrink-0 overflow-hidden border-r border-border bg-background/95 backdrop-blur-xl lg:relative lg:bg-background/50"
          >
            <SessionSidebar
              sessions={sessions}
              archivedSessions={archivedSessions}
              folders={folders}
              currentId={currentSessionId}
              onSelect={(id) => startTransition(() => setCurrentSessionId(id))}
              onCreate={handleCreateSession}
              onDelete={handleDeleteSession}
              onRename={handleRenameSession}
              onPin={handlePinSession}
              onArchive={handleArchiveSession}
              onUnarchive={handleUnarchiveSession}
              onExport={handleExportSession}
              onDeleteAll={handleDeleteAll}
              onCreateFolder={handleCreateFolder}
              onMoveToFolder={handleMoveToFolder}
              search={search}
              searchResults={searchResults}
              onSearchChange={setSearch}
              setSettingsTab={onOpenSettings}
              setShowSettingsModal={setShowSettingsModal}
              onToggleSidebar={onToggleSidebar}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voiceModeOpen && (
          <VoiceModeOverlay
            isOpen={voiceModeOpen}
            onClose={() => toggleVoiceMode()}
            chatId={currentSessionId ?? undefined}
            messages={messages}
            activeModel={selectedModelId}
            onTranscript={(text) => {
              handleSendMessageInternal({
                message: text,
                model: selectedModelId,
                provider: selectedProvider,
                systemPrompt: VOICE_MODE_SYSTEM_PROMPT,
                systemPromptMode: "replace",
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Resizable Layout Area */}
      <div className="flex-grow h-full w-full relative z-10">
        {/* Main Chat Area */}
        <motion.main 
          layout
          className="relative flex flex-1 flex-col min-w-0 h-full bg-transparent overflow-hidden"
        >
          {!isSidebarOpen && (
            <div className="absolute left-4 top-4 z-20">
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-xl bg-background/50 backdrop-blur-md border border-border shadow-sm hover:bg-muted/80"
                onClick={() => setIsSidebarOpen(true)}
              >
                <PanelLeftOpen className="h-5 w-5" />
              </Button>
            </div>
          )}

          <MessageList
            messages={messages}
            onOpenArtifact={handleOpenArtifact}
            isStreaming={isStreaming}
            onRetry={handleRetry}
            onOpenSettings={onOpenSettings}
          />

          <div className="absolute bottom-0 left-0 right-0 z-30 p-4 pb-8 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none">
            <div className="mx-auto max-w-[700px] w-full pointer-events-auto">
              {latestStatusStep && (
                <div className="mb-2 w-full animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none bg-background/50 backdrop-blur-md rounded-lg shadow-sm border border-border/50">
                  <AgentActionStep step={latestStatusStep} isStreaming={true} />
                </div>
              )}
              <PremiumChatInput
                activeChatId={currentSessionId}
                onSend={handleSendMessageInternal}
                onAbort={abortStream}
                isLoading={isStreaming}
                models={models}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                onSelectModel={onSelectModel}
                generativeUI={generativeUI}
                onGenerativeUIChange={setGenerativeUI}
              />
            </div>
          </div>
        </motion.main>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        open={showSettingsModal} 
        onOpenChange={setShowSettingsModal} 
        initialTab={settingsTab}
      />
    </div>
  );
}


