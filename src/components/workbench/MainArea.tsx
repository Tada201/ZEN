import { useAgentChat } from '../../lib/hooks/useAgentChat';
import { MessageList } from '../chat/MessageList';
import { PremiumChatInput } from '../chat/PremiumChatInput';
import { useUIStore } from '../../lib/stores/useUIStore';
import { useChatStore } from '../../lib/stores/useChatStore';
import { OperationalMap } from './OperationalMap';
import { SwarmOrchestrator } from './SwarmOrchestrator';
import { IntelligenceVault } from './IntelligenceVault';
import { TerminalPanel } from './TerminalPanel';


export function MainArea() {
  const { activeTab, setRightPanelOpen, setActiveRightTab } = useUIStore();
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAgentChat();
  const { addArtifact, setActiveArtifact } = useChatStore();

  const handleOpenArtifact = (data: any) => {
    const id = `art-${Date.now()}`;
    const artifact = {
      ...data,
      id,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chatId: 'default',
      messageId: 'default'
    };
    addArtifact(artifact);
    setActiveArtifact(id);
    setActiveRightTab('artifacts');
    setRightPanelOpen(true);
  };

  return (
    <div className="relative flex h-full w-full flex-row overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0 bg-slate-900">
        <div className="ui-zen-bg absolute inset-0 opacity-50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <MessageList
              messages={messages as any}
              onOpenArtifact={handleOpenArtifact}
              isStreaming={isLoading}
            />

            <div className="p-4 pb-8 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent">
              <div className="mx-auto max-w-[800px] w-full">
                <PremiumChatInput
                  input={input}
                  onInputChange={(val) => handleInputChange({ target: { value: val } } as any)}
                  onSend={(_data) => handleSubmit({ preventDefault: () => {} } as any)}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <OperationalMap />
          </div>
        )}

        {activeTab === 'swarm' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <SwarmOrchestrator />
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <IntelligenceVault />
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <TerminalPanel />
          </div>
        )}
      </div>
    </div>
  );
}
