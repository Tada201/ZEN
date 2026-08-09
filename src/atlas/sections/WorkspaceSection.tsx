import React, { Suspense, useState, useCallback, useEffect, useTransition, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useChat } from "@/atlas/hooks/useChat";
import { WorkspaceLayout } from "../layouts/WorkspaceLayout";
import { MessageList } from "../components/chat/MessageList";
import { PremiumChatInput } from "../components/PremiumChatInput";
import type { TabId } from "../components/SettingsModal";
import type { ArtifactData } from "../components/chat/types";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import type { SearchResult } from "../components/chat/SessionSidebarItem";
import { WorkspaceContextHeader } from "../components/chat/WorkspaceContextHeader";
import { WorkspaceWelcome } from "../components/chat/WorkspaceWelcome";
import { WorkspaceViewTransition, type WorkspaceView } from "../components/chat/WorkspaceViewTransition";
import { Hammer, Loader2, Search, X } from "lucide-react";
import { useUIStore } from "@/lib/stores/useUIStore";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { getVisibleWorkspaceModeFeatures, isWorkspaceModeVisible } from "@/lib/features/frontendFeatures";
import { useShallow } from 'zustand/react/shallow';
import { useRenderLogger } from "@/hooks/useRenderLogger";
import { toast } from "sonner";

import { MainArea } from "@/components/workbench/MainArea";
import { VOICE_MODE_SYSTEM_PROMPT } from "../components/voice/voiceModePrompt";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const loadSettingsModal = () => import("../components/SettingsModal");
const preloadSettingsModal = () => {
  void loadSettingsModal().then((module) => {
    module.preloadSettingsTab("providers");
  });
};
const SettingsModal = React.lazy(() => loadSettingsModal().then(m => ({ default: m.SettingsModal })));
const CommandPalette = React.lazy(() => import("@/atlas/CommandPalette").then(m => ({ default: m.CommandPalette })));
const VoiceModeOverlay = React.lazy(() => import("../components/voice/VoiceModeOverlay").then(m => ({ default: m.VoiceModeOverlay })));
const ArtifactPanel = React.lazy(() => import("../components/chat/ArtifactPanel").then(m => ({ default: m.ArtifactPanel })));
const RightPanel = React.lazy(() => import("../components/RightPanel").then(m => ({ default: m.RightPanel })));

const DeferredOverlayFallback = () => null;

function UniversalSessionSearch({
  query,
  results,
  onQueryChange,
  onClose,
  onSelect,
}: {
  query: string;
  results: SearchResult[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelect: (chatId: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-background/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search sessions"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
            placeholder="Search sessions..."
            aria-label="Search sessions"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close session search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Type at least two characters to search sessions.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matching sessions.</p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.chatId}-${result.messageId}`}
                type="button"
                onClick={() => onSelect(result.chatId)}
                className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted"
              >
                <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">{result.chatTitle}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{result.messageContent}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceApp() {
  const [, startTransition] = useTransition();
  const {
    sessions, sessionsLoading, archivedSessions, folders, currentSessionId, setCurrentSessionId,
    messages, search, setSearch, searchResults, setMessages,
    models, selectedModelId, setSelectedModelId,
    selectedProvider, isStreaming,
    startNewChat,
    handleCreateSession, handleDeleteSession,
    handleRenameSession, handlePinSession, handleArchiveSession,
    handleUnarchiveSession, handleExportSession,
    handleDeleteAll, handleCreateFolder, handleRenameFolder, handleDeleteFolder, handleMoveToFolder,
    handleSendMessage, abortStream
  } = useChat();

  useRenderLogger("WorkspaceApp", { currentSessionId, isStreaming });

  const chatMessages = useMemo(() => {
    return messages.filter(m => m.role !== "tool");
  }, [messages]);

  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);
  const [generativeUI, setGenerativeUI] = useState(false);
  const configuredWorkspacePath = useSettingsStore((state) => state.workspacePath);
  const [pendingWorkspaceRoot, setPendingWorkspaceRoot] = useState<string | null>(
    () => useSettingsStore.getState().workspacePath || null,
  );

  useEffect(() => {
    if (!pendingWorkspaceRoot && configuredWorkspacePath) {
      setPendingWorkspaceRoot(configuredWorkspacePath);
    }
  }, [configuredWorkspacePath, pendingWorkspaceRoot]);

  const {
    settingsOpen,
    setSettingsOpen,
    setActiveSettingsTab,
    activeSettingsTab,
    voiceModeOpen,
    toggleVoiceMode,
    activeTab,
    setActiveTab,
    isCommandPaletteOpen,
    setActiveRightTab,
    setRightPanelOpen,
  } = useUIStore(
    useShallow((s) => ({
      settingsOpen: s.settingsOpen,
      setSettingsOpen: s.setSettingsOpen,
      setActiveSettingsTab: s.setActiveSettingsTab,
      activeSettingsTab: s.activeSettingsTab,
      voiceModeOpen: s.voiceModeOpen,
      toggleVoiceMode: s.toggleVoiceMode,
      activeTab: s.activeTab,
      setActiveTab: s.setActiveTab,
      isCommandPaletteOpen: s.isCommandPaletteOpen,
      setActiveRightTab: s.setActiveRightTab,
      setRightPanelOpen: s.setRightPanelOpen,
    }))
  );
  const isUniversalSearchOpen = useChatStore((state) => state.isSearchOpen);
  const toggleUniversalSearch = useChatStore((state) => state.toggleSearch);
  const visibleWorkspaceModes = getVisibleWorkspaceModeFeatures();
  const currentWorkspaceTab = isWorkspaceModeVisible(activeTab) ? activeTab : "chat";
  const activeSession = [...sessions, ...archivedSessions].find((session) => session.id === currentSessionId) ?? null;
  const isArchivedSession = activeSession?.archived === true || archivedSessions.some((session) => session.id === currentSessionId);

  const handleStartNewChat = useCallback(() => {
    if (currentSessionId && isStreaming) {
      void abortStream();
    }
    setActiveArtifact(null);
    setPendingWorkspaceRoot(configuredWorkspacePath || null);
    startNewChat();
  }, [abortStream, configuredWorkspacePath, currentSessionId, isStreaming, setActiveArtifact, startNewChat]);

  const sessionNavigation = useRef<{ current: string | null; past: string[]; future: string[]; replaying: boolean }>({
    current: null,
    past: [],
    future: [],
    replaying: false,
  });
  const [navigationState, setNavigationState] = useState({ canBack: false, canForward: false });

  useEffect(() => {
    const navigation = sessionNavigation.current;
    if (navigation.current === currentSessionId) return;
    if (!navigation.replaying && navigation.current) {
      navigation.past.push(navigation.current);
      navigation.future = [];
    }
    navigation.current = currentSessionId;
    navigation.replaying = false;
    setNavigationState({ canBack: navigation.past.length > 0, canForward: navigation.future.length > 0 });
  }, [currentSessionId]);

  const navigateSessionBack = useCallback(() => {
    const navigation = sessionNavigation.current;
    const target = navigation.past.pop();
    if (!target) return;
    if (navigation.current) navigation.future.unshift(navigation.current);
    navigation.replaying = true;
    setCurrentSessionId(target);
    setNavigationState({ canBack: navigation.past.length > 0, canForward: navigation.future.length > 0 });
  }, [setCurrentSessionId]);

  const navigateSessionForward = useCallback(() => {
    const navigation = sessionNavigation.current;
    const target = navigation.future.shift();
    if (!target) return;
    if (navigation.current) navigation.past.push(navigation.current);
    navigation.replaying = true;
    setCurrentSessionId(target);
    setNavigationState({ canBack: navigation.past.length > 0, canForward: navigation.future.length > 0 });
  }, [setCurrentSessionId]);

  const openArtifactInRightPanel = useCallback((artifact: ArtifactData) => {
    const artifactId = artifact.id || `art_${Date.now()}`;
    useChatStore.getState().addArtifact({ ...artifact, id: artifactId, chatId: artifact.chatId || currentSessionId || undefined });
    useChatStore.getState().setActiveArtifact(artifactId);
    setActiveArtifact(null);
    useUIStore.getState().setRightPanelOpen(true);
    useUIStore.getState().setActiveRightTab("artifacts");
  }, [currentSessionId]);

  const handleSendMessageInternal = useCallback(async (data: any) => {
    if (isArchivedSession) {
      toast.info("This chat is archived. Unarchive it before sending a new message.");
      return;
    }

    const payload = {
      ...data,
      generativeUI: data.generativeUI ?? generativeUI,
    };

    if (!currentSessionId) {
      let activeRoot = pendingWorkspaceRoot;

      if (!activeRoot) {
        try {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const result = await open({
            directory: true,
            multiple: false,
            title: "Choose a workspace folder",
          });
          const path = Array.isArray(result) ? result[0] : result;
          if (typeof path === "string" && path.trim()) {
            activeRoot = path;
            setPendingWorkspaceRoot(path);
          } else {
            return;
          }
        } catch (error) {
          console.error("[WorkspaceSection] Folder picker failed:", error);
          toast.error("Choose a workspace folder before starting a task.");
          return;
        }
      }

      const targetSessionId = await handleCreateSession({
        title: "New Case",
        workspaceRoot: activeRoot,
      });
      handleSendMessage({ ...payload, targetSessionId });
      return;
    }

    handleSendMessage(payload);
  }, [currentSessionId, generativeUI, handleCreateSession, handleSendMessage, isArchivedSession, pendingWorkspaceRoot]);

  const recentWorkspaces = useMemo(() => {
    const paths = [
      configuredWorkspacePath,
      ...sessions.map((session) => session.workspaceRoot || ""),
    ].filter((path): path is string => Boolean(path?.trim()));
    return Array.from(new Set(paths));
  }, [configuredWorkspacePath, sessions]);

  const workspaceView: WorkspaceView = currentWorkspaceTab === "openui"
    ? "openui"
    : sessionsLoading
      ? "loading"
      : activeSession
        ? "chat"
        : "welcome";

  const handleDismissError = useCallback((messageId: string) => {
    if (!currentSessionId) return;
    useChatStore.getState().setSessionMessages(currentSessionId, (prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              error: undefined,
              status: m.status === "failed" ? "cancelled" as const : m.status === "sending" ? "cancelled" as const : m.status,
            }
          : m
      )
    );
  }, [currentSessionId]);

  const handleRetry = useCallback((messageId: string) => {
    const failedMsgIndex = messages.findIndex((m) => m.id === messageId);
    if (failedMsgIndex === -1) return;

    let lastUserMsg = null;
    for (let i = failedMsgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMsg = messages[i];
        break;
      }
    }
    if (!lastUserMsg?.content) return;

    const failedMsg = messages[failedMsgIndex];
    setMessages(messages.slice(0, failedMsgIndex));
    handleSendMessageInternal({
      message: lastUserMsg.content,
      model: failedMsg.model || selectedModelId,
      provider: failedMsg.provider || selectedProvider,
      generativeUI: failedMsg.generativeUI != null ? !!failedMsg.generativeUI : generativeUI,
      thinking: failedMsg.thinking || { enabled: false },
    });
  }, [messages, setMessages, handleSendMessageInternal, selectedModelId, selectedProvider, generativeUI]);

  const handleRegenerate = useCallback((messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    let lastUserMsg = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMsg = messages[i];
        break;
      }
    }
    if (!lastUserMsg?.content) return;
    setMessages(messages.slice(0, msgIndex));
    handleSendMessageInternal({
      message: lastUserMsg.content,
      model: selectedModelId,
      provider: selectedProvider,
    });
  }, [messages, setMessages, selectedModelId, selectedProvider, handleSendMessageInternal]);

  const handleContinueResearch = useCallback((request: string) => {
    handleSendMessageInternal({
      message: request,
      model: selectedModelId,
      provider: selectedProvider,
      deepResearch: true,
    });
  }, [handleSendMessageInternal, selectedModelId, selectedProvider]);

  // Stable ref for voice transcript callback to prevent cascading re-initialization
  // of audio graph / rAF loop when parent re-renders during streaming.
  const onTranscriptRef = useRef<(text: string) => void>(null);
  onTranscriptRef.current = (text: string) => {
    handleSendMessageInternal({
      message: text,
      model: selectedModelId,
      provider: selectedProvider,
      systemPrompt: VOICE_MODE_SYSTEM_PROMPT,
      systemPromptMode: "replace",
    });
  };
  const stableOnTranscript = useCallback((text: string) => {
    onTranscriptRef.current?.(text);
  }, []);

  // Derive loading state from both isStreaming (backend events flowing)
  // AND last message status (covers the gap between Send press and first event)
  const isLoading = useMemo(() => {
    if (isStreaming) return true;
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant' && last.status === 'sending') return true;
    }
    return false;
  }, [isStreaming, messages]);

  // Global Cmd+K shortcut — reads latest store state directly to avoid re-registering on every toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const { isCommandPaletteOpen: open, setCommandPaletteOpen: setOpen } = useUIStore.getState();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(preloadSettingsModal, { timeout: 2500 });
      } else {
        preloadSettingsModal();
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, []);

  const windowHeader = (
    <WorkspaceContextHeader
      session={activeSession}
      messages={chatMessages}
      isStreaming={isArchivedSession ? false : isStreaming}
      onNewChat={handleStartNewChat}
      onNavigateBack={navigateSessionBack}
      onNavigateForward={navigateSessionForward}
      canNavigateBack={navigationState.canBack}
      canNavigateForward={navigationState.canForward}
      onRenameSession={handleRenameSession}
      onPinSession={handlePinSession}
      onArchiveSession={handleArchiveSession}
      onUnarchiveSession={handleUnarchiveSession}
      onExportSession={handleExportSession}
      onOpenApprovals={() => {
        setActiveRightTab("approvals");
        setRightPanelOpen(true);
      }}
      onOpenAgents={() => {
        setActiveRightTab("agents");
        setRightPanelOpen(true);
      }}
      onOpenCapabilities={() => {
        setActiveSettingsTab("capabilities");
        setSettingsOpen(true);
      }}
      onToggleWorkbench={() => useUIStore.getState().toggleRightPanel()}
    />
  );

  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      {isUniversalSearchOpen && (
        <UniversalSessionSearch
          query={search}
          results={searchResults}
          onQueryChange={setSearch}
          onClose={() => {
            setSearch("");
            toggleUniversalSearch();
          }}
          onSelect={(chatId) => {
            setSearch("");
            toggleUniversalSearch();
            startTransition(() => setCurrentSessionId(chatId));
          }}
        />
      )}
      <WorkspaceLayout
        windowHeader={windowHeader}
        sidebar={
          <SessionSidebar
            sessions={sessions}
            archivedSessions={archivedSessions}
            folders={folders}
            currentId={currentSessionId}
            onSelect={(id) => startTransition(() => setCurrentSessionId(id))}
            onCreate={handleStartNewChat}
            onOpenSearch={toggleUniversalSearch}
            onCreateInWorkspace={(workspaceRoot) => {
              if (currentSessionId && isStreaming) void abortStream();
              setActiveArtifact(null);
              setPendingWorkspaceRoot(workspaceRoot || configuredWorkspacePath || null);
              startNewChat();
            }}
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
            setSettingsTab={setActiveSettingsTab}
            setShowSettingsModal={setSettingsOpen}
            onPreloadSettings={preloadSettingsModal}
            activeTab={currentWorkspaceTab}
            onTabChange={(tab) => startTransition(() => setActiveTab(tab))}
            workspaceModes={visibleWorkspaceModes.map((feature) => ({
              id: feature.workspaceModeId ?? "chat",
              label: feature.label,
            }))}
          />
        }
        main={
          <WorkspaceViewTransition view={workspaceView}>
            {currentWorkspaceTab === "openui" ? (
            <div className="flex-1 h-full flex flex-col items-center justify-center bg-background p-6 text-center select-none font-sans">
              <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center mb-6">
                <Hammer className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Canvas Mode Under Construction
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                This feature is currently undergoing a redesign to bring you an even better visualization and creation experience.
              </p>
            </div>
            ) : sessionsLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <span className="text-xs">Loading workspaces</span>
            </div>
            ) : !activeSession ? (
            <WorkspaceWelcome
              recentWorkspaces={recentWorkspaces}
              selectedWorkspace={pendingWorkspaceRoot}
              onSelectWorkspace={setPendingWorkspaceRoot}
              composer={
                <motion.div
                  layoutId="workspace-composer-shell"
                  layout
                  transition={{ layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } }}
                  className="w-full"
                >
                  <PremiumChatInput
                  variant="welcome"
                  activeChatId={null}
                  onSend={handleSendMessageInternal}
                  onAbort={abortStream}
                  isLoading={false}
                  models={models}
                  selectedModelId={selectedModelId}
                  selectedProvider={selectedProvider}
                  onSelectModel={(id, prov) => setSelectedModelId(id, prov)}
                  generativeUI={generativeUI}
                  onGenerativeUIChange={setGenerativeUI}
                  onOpenModelSelector={() => {
                    setActiveSettingsTab("providers");
                    setSettingsOpen(true);
                  }}
                  onOpenSettings={() => {
                    setActiveSettingsTab("general");
                    setSettingsOpen(true);
                  }}
                  />
                </motion.div>
              }
            />
            ) : (
            <MainArea className="flex flex-col h-full relative">
              {/* The chat context lives in the window title bar. Do not render a
                  second copy of it here. */}

              {/* Chat Content & Split Panel */}
              <div className="flex-1 overflow-hidden relative w-full h-full flex flex-col">
                {!activeArtifact ? (
                  <div className="flex-1 flex flex-col h-full w-full bg-transparent overflow-hidden">
                    <div className="flex min-h-0 flex-1 w-full overflow-hidden">
                      <MessageList
                        messages={chatMessages}
                        onOpenArtifact={openArtifactInRightPanel}
                        onOpenSettings={() => setSettingsOpen(true)}
                        onDismissError={isArchivedSession ? undefined : handleDismissError}
                        onRetry={isArchivedSession ? undefined : handleRetry}
                        onRegenerate={isArchivedSession ? undefined : handleRegenerate}
                        onContinueResearch={isArchivedSession ? undefined : handleContinueResearch}
                        onAbort={isArchivedSession ? undefined : abortStream}
                        isStreaming={isArchivedSession ? false : isStreaming}
                      />
                    </div>
                    <div className="w-full shrink-0">
                      <div className="max-w-3xl mx-auto w-full px-6 py-4">
                        <motion.div
                          layoutId="workspace-composer-shell"
                          layout
                          transition={{ layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } }}
                          className="w-full"
                        >
                          <PremiumChatInput
                            activeChatId={currentSessionId}
                            readOnly={isArchivedSession}
                            onSend={handleSendMessageInternal}
                            onAbort={isArchivedSession ? undefined : abortStream}
                            isLoading={isArchivedSession ? false : isLoading}
                            models={models}
                            selectedModelId={selectedModelId}
                            selectedProvider={selectedProvider}
                            onSelectModel={(id, prov) => {
                              setSelectedModelId(id, prov);
                            }}
                            generativeUI={generativeUI}
                            onGenerativeUIChange={setGenerativeUI}
                            onOpenModelSelector={() => {
                              setActiveSettingsTab("providers");
                              setSettingsOpen(true);
                            }}
                            onOpenSettings={() => {
                              setActiveSettingsTab("general");
                              setSettingsOpen(true);
                            }}
                          />
                        </motion.div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
                    <ResizablePanel defaultSize={60} minSize={30} className="flex flex-col h-full relative">
                      <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
                        <div className="flex min-h-0 flex-1 w-full overflow-hidden">
                          <MessageList
                            messages={chatMessages}
                            onOpenArtifact={openArtifactInRightPanel}
                            onOpenSettings={() => setSettingsOpen(true)}
                            onDismissError={isArchivedSession ? undefined : handleDismissError}
                            onRetry={isArchivedSession ? undefined : handleRetry}
                            onRegenerate={isArchivedSession ? undefined : handleRegenerate}
                            onContinueResearch={isArchivedSession ? undefined : handleContinueResearch}
                            onAbort={isArchivedSession ? undefined : abortStream}
                            isStreaming={isArchivedSession ? false : isStreaming}
                          />
                        </div>
                        <div className="w-full bg-background border-t border-border p-4 shrink-0">
                          <div className="max-w-3xl mx-auto w-full">
                            <motion.div
                              layoutId="workspace-composer-shell"
                              layout
                              transition={{ layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } }}
                              className="w-full"
                            >
                              <PremiumChatInput
                                activeChatId={currentSessionId}
                                readOnly={isArchivedSession}
                                onSend={handleSendMessageInternal}
                                onAbort={isArchivedSession ? undefined : abortStream}
                                isLoading={isArchivedSession ? false : isLoading}
                                models={models}
                                selectedModelId={selectedModelId}
                                selectedProvider={selectedProvider}
                                onSelectModel={(id, prov) => {
                                  setSelectedModelId(id, prov);
                                }}
                                generativeUI={generativeUI}
                                onGenerativeUIChange={setGenerativeUI}
                                onOpenModelSelector={() => {
                                  setActiveSettingsTab("providers");
                                  setSettingsOpen(true);
                                }}
                                onOpenSettings={() => {
                                  setActiveSettingsTab("general");
                                  setSettingsOpen(true);
                                }}
                              />
                            </motion.div>
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={40} minSize={20} collapsible className="h-full bg-background border-l border-border shadow-2xl flex flex-col relative z-40">
                      <Suspense fallback={<DeferredOverlayFallback />}>
                        <ArtifactPanel
                          artifact={activeArtifact}
                          onClose={() => setActiveArtifact(null)}
                          isStreaming={isArchivedSession ? false : isStreaming}
                          embedded
                        />
                      </Suspense>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </div>
            </MainArea>
            )}
          </WorkspaceViewTransition>
        }
        rightPanel={
          <Suspense fallback={<DeferredOverlayFallback />}>
            <RightPanel />
          </Suspense>
        }
        showStatusBar={true}
      />

      {settingsOpen && (
        <Suspense fallback={<DeferredOverlayFallback />}>
          <SettingsModal
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            initialTab={activeSettingsTab as TabId}
          />
        </Suspense>
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={<DeferredOverlayFallback />}>
          <CommandPalette onNewChat={handleStartNewChat} />
        </Suspense>
      )}

      {voiceModeOpen && (
        <Suspense fallback={<DeferredOverlayFallback />}>
          <VoiceModeOverlay
            isOpen={voiceModeOpen}
            onClose={() => toggleVoiceMode()}
            chatId={currentSessionId ?? undefined}
            messages={chatMessages}
            activeModel={selectedModelId}
            onTranscript={stableOnTranscript}
          />
        </Suspense>
      )}
    </div>
  );
}


