/* ═══════════════════════════════════════════════════════════════
   ChatSection — Full AI Chat Interface
   Sessions · Markdown · Code blocks · Tool calls · Artifact panel
   Image attachments · API key management · SQLite persistence
 ═══════════════════════════════════════════════════════════════ */
import { useState, useCallback, useEffect, useTransition } from "react";
import { useChat } from "@/atlas/hooks/useChat";
import { motion, AnimatePresence } from "framer-motion";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

// Modular Components
import {
  ArtifactData
} from "../components/chat/types";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { MessageList } from "../components/chat/MessageList";
import { PremiumChatInput } from "../components/PremiumChatInput";
import { SettingsModal, type TabId } from "../components/SettingsModal";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useChatStore } from "@/lib/stores/useChatStore";

export function ChatApp({ fullScreen: _fullScreen }: { fullScreen?: boolean }) {
  const reducedMotion = useReducedMotion();
  const [, startTransition] = useTransition();
  const {
    sessions, archivedSessions, folders, currentSessionId, setCurrentSessionId,
    messages, setMessages, search, searchResults,
    models, selectedModelId, setSelectedModelId,
    selectedProvider, isStreaming,
    handleCreateSession, handleDeleteSession,
    handleRenameSession, handlePinSession, handleArchiveSession,
    handleUnarchiveSession, handleExportSession,
    handleDeleteAll, handleCreateFolder, handleRenameFolder, handleDeleteFolder, handleMoveToFolder,
    handleSendMessage, abortStream, pauseStream, resumeStream
  } = useChat();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const activeSession = [...sessions, ...archivedSessions].find((session) => session.id === currentSessionId) ?? null;
  const isArchivedSession = activeSession?.archived === true || archivedSessions.some((session) => session.id === currentSessionId);
  const isChatPaused = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant") return message.status === "paused";
    }
    return false;
  })();

  const handleOpenArtifact = useCallback((art: ArtifactData) => {
    const artId = art.id || `art_${Date.now()}`;
    const fullArt = { ...art, id: artId, chatId: art.chatId || currentSessionId || undefined };

    // Add to chat store
    useChatStore.getState().addArtifact(fullArt);
    useChatStore.getState().setActiveArtifact(artId);

    // Open right panel and set active tab
    useUIStore.getState().setRightPanelOpen(true);
    useUIStore.getState().setActiveRightTab('artifacts');
  }, [currentSessionId]);

  // Settings UI State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<TabId>("general");

  // Options UI State
  const [webSearch] = useState(false);
  const [generativeUI, setGenerativeUI] = useState(false);

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
    if (isArchivedSession) return;
    handleSendMessage({
      ...data,
      generativeUI: data.generativeUI != null ? data.generativeUI : generativeUI,
      tools: data.tools
    });
  }, [handleSendMessage, generativeUI, isArchivedSession]);

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
      thinking: failedMsg.thinking || { enabled: false },
      // Route retry to the original session, not the potentially-stale currentSessionId
      targetSessionId: lastUserMsg.sessionId || undefined,
    });
  }, [messages, setMessages, handleSendMessage, selectedModelId, selectedProvider, webSearch, generativeUI]);

  const handleContinueResearch = useCallback((request: string) => {
    handleSendMessageInternal({
      message: request,
      model: selectedModelId,
      provider: selectedProvider,
      deepResearch: true,
    });
  }, [handleSendMessageInternal, selectedModelId, selectedProvider]);

  const onOpenSettings = useCallback((tab: TabId) => {
    setSettingsTab(tab);
    setShowSettingsModal(true);
  }, []);

  const onSelectModel = useCallback((id: string, provider: string) => {
    setSelectedModelId(id, provider);
  }, [setSelectedModelId]);

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
            transition={reducedMotion ? { duration: 0 } : {
              duration: motionDurations.surface,
              ease: motionEasings.standard,
            }}
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
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveToFolder={handleMoveToFolder}
              search={search}
              searchResults={searchResults}
              setSettingsTab={onOpenSettings}
              setShowSettingsModal={setShowSettingsModal}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.standard }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* VoiceModeOverlay intentionally not mounted here. WorkspaceSection.tsx
          owns the single VoiceModeOverlay mount (line ~438). Adding a second
          mount site would double-subscribe to every Tauri voice event, double-
          create AudioContexts, and double-write the stage board. If this
          section is ever wired into a route that coexists with the workspace,
          keep the overlay mount in exactly one place. */}

      {/* Resizable Layout Area */}
      <div className="flex-grow h-full w-full relative z-10">
        {/* Main Chat Area */}
        <main
          className="relative flex flex-1 min-w-0 h-full flex-col overflow-hidden bg-transparent"
        >
          <MessageList
            messages={messages}
            onOpenArtifact={handleOpenArtifact}
            isStreaming={isArchivedSession ? false : isStreaming}
            onRetry={isArchivedSession ? undefined : handleRetry}
            onOpenSettings={onOpenSettings}
            onContinueResearch={isArchivedSession ? undefined : handleContinueResearch}
          />

          <div className="relative z-30 shrink-0 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-background via-background/80 to-transparent"
            />
            <div className="relative mx-auto w-full max-w-[700px]">
              <PremiumChatInput
                activeChatId={currentSessionId}
                readOnly={isArchivedSession}
                onSend={handleSendMessageInternal}
                onAbort={isArchivedSession ? undefined : abortStream}
                onPause={isArchivedSession ? undefined : pauseStream}
                onResume={isArchivedSession ? undefined : resumeStream}
                isPaused={isArchivedSession ? false : isChatPaused}
                isLoading={isArchivedSession ? false : isStreaming}
                models={models}
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
                onSelectModel={onSelectModel}
                generativeUI={generativeUI}
                onGenerativeUIChange={setGenerativeUI}
              />
            </div>
          </div>
        </main>
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


