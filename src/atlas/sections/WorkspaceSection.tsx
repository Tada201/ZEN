import { useState, useCallback } from "react";
import { useChat } from "@/atlas/hooks/useChat";
import { WorkspaceLayout } from "../layouts/WorkspaceLayout";
import { MessageList } from "../components/chat/MessageList";
import { PremiumChatInput } from "../components/PremiumChatInput";
import { SettingsModal, type TabId } from "../components/SettingsModal";
import { ArtifactData } from "../components/chat/types";
import { ArtifactPanel } from "../components/chat/ArtifactPanel";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { RightPanel } from "@/components/workbench/RightPanel";
import { MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/lib/stores/useUIStore";

export function WorkspaceApp() {
  const {
    sessions, currentSessionId, setCurrentSessionId,
    messages, search, setSearch,
    models, modelsLoading, selectedModelId, setSelectedModelId,
    selectedProvider, setSelectedProvider, isStreaming,
    fetchModels, handleCreateSession, handleDeleteSession,
    handleRenameSession, handleExportSession,
    handleDeleteAll, handleSendMessage, abortStream
  } = useChat();

  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);
  const [generativeUI, setGenerativeUI] = useState(true);

  const { settingsOpen, setSettingsOpen, setActiveSettingsTab, activeSettingsTab } = useUIStore();

  const handleSendMessageInternal = useCallback(async (data: any) => {
    handleSendMessage({
      ...data,
      generativeUI: data.generativeUI ?? generativeUI
    });
  }, [handleSendMessage, generativeUI]);

  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      <WorkspaceLayout
        sidebar={
          <SessionSidebar
            sessions={sessions}
            currentId={currentSessionId}
            onSelect={setCurrentSessionId}
            onCreate={handleCreateSession}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            onExport={handleExportSession}
            onDeleteAll={handleDeleteAll}
            search={search}
            onSearchChange={setSearch}
            setSettingsTab={setActiveSettingsTab}
            setShowSettingsModal={setSettingsOpen}
            onToggleSidebar={() => useUIStore.getState().setSidebarOpen(!useUIStore.getState().sidebarOpen)} 
          />
        }
        main={
          <div className="flex flex-col h-full bg-background relative">
            {/* Chat Header */}
            <div className="h-14 px-6 flex items-center justify-between border-b border-border/40 bg-muted/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-black uppercase tracking-widest text-foreground">
                  ZEN INVESTIGATION
                </span>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 flex justify-center overflow-hidden">
              <div className="w-full max-w-4xl flex flex-col h-full border-x border-border/10 bg-card/5">
                <MessageList
                  messages={messages}
                  onOpenArtifact={setActiveArtifact}
                  onRetry={() => {}} 
                  onOpenSettings={() => setSettingsOpen(true)}
                />
                <div className="p-6 border-t border-border/40 bg-background/80 backdrop-blur-xl">
                  <PremiumChatInput
                    onSend={handleSendMessageInternal}
                    onAbort={abortStream}
                    isLoading={isStreaming}
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

            {/* Artifact Overlay */}
            <AnimatePresence>
              {activeArtifact && (
                <motion.div 
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="absolute inset-y-0 right-0 w-1/2 z-50 bg-background border-l border-border shadow-2xl"
                >
                  <ArtifactPanel
                    artifact={activeArtifact}
                    onClose={() => setActiveArtifact(null)}
                    isStreaming={isStreaming}
                    embedded
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
        rightPanel={<RightPanel />}
        showActivityBar={false}
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
    </div>
  );
}


