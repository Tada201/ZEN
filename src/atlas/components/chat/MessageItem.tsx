import { useMemo } from "react";
import { Message, ArtifactData, normalizeVercelMessage } from "./types";
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
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onContinueResearch?: (request: string) => void;
  compact?: boolean;
}) {
  const message = useMemo(() => normalizeVercelMessage(rawMessage), [rawMessage]);
  const isAssistant = message.role === "assistant";
  const hasExecutionLedger = message.steps?.some((step) => step.type === "action" || step.type === "tool-call" || step.type === "reasoning");

  if (message.role !== "user" && (isAssistant || hasExecutionLedger)) {
    if (message.kind === "deep_research") {
      return (
        <DeepResearchMessage 
          message={message} 
          compact={compact} 
          onContinueResearch={onContinueResearch}
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
        onRegenerate={onRegenerate}
        compact={compact} 
      />
    );
  }

  return <UserMessage message={message} compact={compact} />;
}
