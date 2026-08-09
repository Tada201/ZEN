import type { Model } from "../../ModelSelector";
import type { Attachment } from "../types";

export interface PremiumChatInputProps {
  className?: string;
  /** "welcome" selects a compact, attached composer for the workspace
   *  setup surface. Default is "default". */
  variant?: "default" | "welcome";
  onSend: (data: {
    message: string;
    model: string;
    webSearch: boolean;
    thinking: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    deepResearch: boolean;
    generativeUI: boolean;
    imageGen?: boolean;
    files: File[];
    attachments?: Attachment[];
    tools?: string[];
    provider?: string;
  }) => void;
  onAbort?: () => void;
  isLoading?: boolean;
  models: Model[];
  selectedModelId: string;
  selectedProvider: string;
  onSelectModel: (id: string, provider: string) => void;
  onOpenModelSelector?: () => void;
  onOpenSkills?: () => void;
  onOpenSettings?: () => void;
  activeChatId?: string | null;
  /** Archived transcripts stay readable but cannot be edited or resumed. */
  readOnly?: boolean;
  input?: string;
  onInputChange?: (value: string) => void;
  generativeUI?: boolean;
  onGenerativeUIChange?: (value: boolean) => void;
  isSidebar?: boolean;
}

export type ThinkingPayload = PremiumChatInputProps["onSend"] extends (data: infer Data) => void
  ? Data extends { thinking: infer Thinking }
    ? Thinking
    : never
  : never;
