import { useMemo } from "react";
import { Message, ArtifactData, normalizeVercelMessage } from "./types";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { DeepResearchMessage } from "./DeepResearchMessage";

export function MessageItem({
  message: rawMessage,
  onOpenArtifact,
  onRetry,
  onOpenSettings,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: any, provider?: string) => void;
  compact?: boolean;
}) {
  const message = useMemo(() => normalizeVercelMessage(rawMessage), [rawMessage]);
  const isAssistant = message.role === "assistant";

  if (isAssistant) {
    if (message.kind === "deep_research") {
      return (
        <DeepResearchMessage 
          message={message} 
          compact={compact} 
        />
      );
    }

    return (
      <AssistantMessage 
        message={message} 
        onOpenArtifact={onOpenArtifact} 
        onRetry={onRetry} 
        onOpenSettings={onOpenSettings} 
        compact={compact} 
      />
    );
  }

  return <UserMessage message={message} compact={compact} />;
}
