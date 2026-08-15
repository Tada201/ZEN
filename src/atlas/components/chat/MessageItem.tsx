import { Message, ArtifactData } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { DeepResearchMessage } from "./DeepResearchMessage";

export function MessageItem({
  message: rawMessage,
  onOpenArtifact,
  onRetry,
  onOpenSettings,
  onDismissError,
  onRegenerate,
  onContinueResearch,
  isChatStreaming,
  isLast,
  isLastUserTurn,
  messages,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onContinueResearch?: (request: string) => void;
  onAbort?: () => void;
  isChatStreaming?: boolean;
  isLast?: boolean;
  isLastUserTurn?: boolean;
  messages?: Message[];
  compact?: boolean;
}) {
  // Live runtime records are already canonical. Legacy persisted records are
  // normalized at the query boundary before reaching the display tree.
  const message = rawMessage;

  const isAssistant = message.role === "assistant";
  const hasExecutionLedger = message.steps?.some((step) => step.type === "action" || step.type === "tool-call" || step.type === "reasoning");

  if (message.role !== "user" && (isAssistant || hasExecutionLedger)) {
    if (message.kind === "deep_research") {
      return (
        <DeepResearchMessage 
          message={message} 
          compact={compact} 
          onContinueResearch={onContinueResearch}
          isChatStreaming={isChatStreaming}
          messages={messages}
        />
      );
    }

    return (
      <AssistantMessage 
        message={message} 
        onOpenArtifact={onOpenArtifact} 
        onRetry={onRetry} 
        onOpenSettings={onOpenSettings}
        onDismissError={onDismissError}
        isLast={isLast}
        compact={compact} 
      />
    );
  }

  return (
    <UserMessage
      message={message}
      compact={compact}
      // Regenerate lives on the user turn and only the latest one: editing the
      // prompt re-runs the agent for a fresh reply. Suppress it while a run is
      // in flight so a resend can't race the active stream.
      onRegenerate={isLastUserTurn && !isChatStreaming ? onRegenerate : undefined}
    />
  );
}
