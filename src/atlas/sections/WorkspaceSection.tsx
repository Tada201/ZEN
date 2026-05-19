import { useState, useCallback, useEffect, useTransition, useMemo } from "react";
import { useChat } from "@/atlas/hooks/useChat";
import { WorkspaceLayout } from "../layouts/WorkspaceLayout";
import { MessageList } from "../components/chat/MessageList";
import { PremiumChatInput } from "../components/PremiumChatInput";
import { SettingsModal, type TabId } from "../components/SettingsModal";
import { ArtifactData } from "../components/chat/types";
import { ArtifactPanel } from "../components/chat/ArtifactPanel";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { MessageSquare, Settings } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useUIStore } from "@/lib/stores/useUIStore";
import { VoiceModeOverlay } from "../components/voice/VoiceModeOverlay";

import { RightPanel } from "../components/RightPanel";
import { CommandPalette } from "@/atlas/CommandPalette";
import { OpenUICanvas } from "../components/OpenUICanvas";
import { MainArea } from "@/components/workbench/MainArea";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export function WorkspaceApp() {
  const [, startTransition] = useTransition();
  const {
    sessions, archivedSessions, folders, currentSessionId, setCurrentSessionId,
    messages, search, setSearch, searchResults,
    models, modelsLoading, selectedModelId, setSelectedModelId,
    selectedProvider, setSelectedProvider, isStreaming,
    fetchModels, handleCreateSession, handleDeleteSession,
    handleRenameSession, handlePinSession, handleArchiveSession,
    handleUnarchiveSession, handleExportSession,
    handleDeleteAll, handleCreateFolder, handleMoveToFolder,
    handleSendMessage, abortStream
  } = useChat();

  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);
  const [generativeUI, setGenerativeUI] = useState(true);

  const { settingsOpen, setSettingsOpen, setActiveSettingsTab, activeSettingsTab, voiceModeOpen, toggleVoiceMode, activeTab, setActiveTab } = useUIStore();

  const handleSendMessageInternal = useCallback(async (data: any) => {
    handleSendMessage({
      ...data,
      generativeUI: data.generativeUI ?? generativeUI
    });
  }, [handleSendMessage, generativeUI]);

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

  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      <WorkspaceLayout
        sidebar={
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
            setSettingsTab={setActiveSettingsTab}
            setShowSettingsModal={setSettingsOpen}
            onToggleSidebar={() => useUIStore.getState().setSidebarOpen(!useUIStore.getState().sidebarOpen)} 
            activeTab={activeTab}
            onTabChange={(tab) => startTransition(() => setActiveTab(tab))}
          />
        }
        main={
          activeTab === "openui" ? (
            <div className="flex-1 h-full overflow-hidden bg-background relative">
              <OpenUICanvas
                selectedModelId={selectedModelId}
                selectedProvider={selectedProvider}
              />
            </div>
          ) : (
            <MainArea className="flex flex-col h-full relative">
              {/* Chat Header */}
              <div className="h-14 px-6 flex items-center justify-between border-b border-border/10 bg-[#09090b]/80">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-foreground">
                    ZEN INVESTIGATION
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveSettingsTab("models");
                      setSettingsOpen(true);
                    }}
                    className="h-8 w-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Chat Content & Split Panel */}
              <div className="flex-1 overflow-hidden relative w-full h-full">
                {!activeArtifact ? (
                  <div className="flex-1 flex flex-col items-center justify-between overflow-hidden h-full w-full bg-transparent">
                    <div className="w-full max-w-3xl flex flex-col flex-1 overflow-hidden border-x border-border/5 bg-transparent">
                      <MessageList
                        messages={messages}
                        onOpenArtifact={setActiveArtifact}
                        onRetry={() => {}} 
                        onOpenSettings={() => setSettingsOpen(true)}
                      />
                      <div className="p-6 border-t border-border/15 bg-[#09090b]/85 rounded-t-2xl shrink-0">
                        <PremiumChatInput
                          onSend={handleSendMessageInternal}
                          onAbort={abortStream}
                          isLoading={isLoading}
                          models={models}
                          selectedModelId={selectedModelId}
                          selectedProvider={selectedProvider}
                          onSelectModel={(id, prov) => {
                            setSelectedModelId(id);
                            setSelectedProvider(prov);
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
                      </div>
                    </div>
                  </div>
                ) : (
                  <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
                    <ResizablePanel defaultSize={60} minSize={30} className="flex flex-col h-full relative">
                      <div className="flex-1 flex flex-col items-center justify-between overflow-hidden h-full w-full">
                        <div className="w-full max-w-3xl flex flex-col flex-1 overflow-hidden border-x border-border/5 bg-transparent">
                          <MessageList
                            messages={messages}
                            onOpenArtifact={setActiveArtifact}
                            onRetry={() => {}} 
                            onOpenSettings={() => setSettingsOpen(true)}
                          />
                          <div className="p-6 border-t border-border/15 bg-[#09090b]/85 rounded-t-2xl shrink-0">
                            <PremiumChatInput
                              onSend={handleSendMessageInternal}
                              onAbort={abortStream}
                              isLoading={isLoading}
                              models={models}
                              selectedModelId={selectedModelId}
                              selectedProvider={selectedProvider}
                              onSelectModel={(id, prov) => {
                                setSelectedModelId(id);
                                setSelectedProvider(prov);
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
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={40} minSize={20} collapsible className="h-full bg-background border-l border-border shadow-2xl flex flex-col relative z-40">
                      <ArtifactPanel
                        artifact={activeArtifact}
                        onClose={() => setActiveArtifact(null)}
                        isStreaming={isStreaming}
                        embedded
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </div>
            </MainArea>
          )
        }
        rightPanel={<RightPanel />}
        showStatusBar={true}
      />

      <SettingsModal 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen} 
        initialTab={activeSettingsTab as TabId}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={(id: string, provider: string) => {
          setSelectedModelId(id);
          setSelectedProvider(provider);
        }}
        fetchModels={fetchModels}
        modelsLoading={modelsLoading}
      />

      <CommandPalette />

      {/* Voice Mode Overlay */}
      <AnimatePresence>
        {voiceModeOpen && (
          <VoiceModeOverlay
            isOpen={voiceModeOpen}
            onClose={() => toggleVoiceMode()}
            messages={messages}
            activeModel={selectedModelId}
            onTranscript={(text: string) => {
              handleSendMessageInternal({
                message: text,
                model: selectedModelId,
                provider: selectedProvider,
              });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}


