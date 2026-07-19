import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/utils/style";
import { useUIStore } from "@/lib/stores/useUIStore";
import type { PremiumChatInputProps } from "./chat/input/PremiumChatInputTypes";
import type { ThinkingEffortLevel } from "./useChatInputModes";
import { ModelSearchDropdown } from "./chat/input/ModelSearchDropdown";
import { PinnedActionBar } from "./chat/input/PinnedActionBar";
import { PermissionModeMenu } from "./PermissionModeMenu";
import { ContextTrigger } from "./ContextTrigger";

/**
 * `ChatInputFooter` — the bottom toolbar of the chat input composer:
 * the inline model picker (only when not already pinned to the
 * sidebar header), the permission-mode menu, the pinned action bar,
 * the context-badge trigger, the voice-mode mic, and the Send/Stop
 * button. Carved out of `PremiumChatInput.tsx` so the composer stays
 * under the 350-line warning limit.
 *
 * Type notes:
 *   * `reasoningConfigType` is the literal union PinnedActionBar
 *     accepts; the composing input narrows the model's value to that
 *     exact union before passing through.
 *   * `thinkingEffort` / `setThinkingEffort` use the explicit
 *     `ThinkingEffortLevel` alias so contravariant function-arg
 *     compatibility is preserved when forwarding to PinnedActionBar.
 *   * `onSelectModel` is required because `PremiumChatInputProps`
 *     declares it as such.
 */

type ReasoningConfigTypeLiteral = "none" | "effort" | "budget";

export interface ChatInputFooterProps {
  isCompact: boolean;
  isSidebar?: boolean;
  // Inline-model picker (only when !isSidebar)
  selectedModelOpen: boolean;
  setSelectedModelOpen: (open: boolean) => void;
  models: PremiumChatInputProps["models"];
  selectedModelId: string;
  selectedProvider: string;
  onSelectModel: PremiumChatInputProps["onSelectModel"];
  onOpenModelSelector?: () => void;
  // Pinned bar
  pinnedActions: string[];
  togglePin: (id: string) => void;
  supportsReasoning: boolean;
  isThinking: boolean;
  setIsThinking: (v: boolean) => void;
  reasoningConfigType: ReasoningConfigTypeLiteral;
  thinkingEffort: ThinkingEffortLevel;
  setThinkingEffort: (v: ThinkingEffortLevel) => void;
  thinkingBudget: number;
  setThinkingBudget: (v: number) => void;
  isWebSearch: boolean;
  setIsWebSearch: (v: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (v: boolean) => void;
  generativeUI: boolean;
  setGenerativeUI: (v: boolean) => void;
  // Footer actions
  activeChatId?: string;
  onSend: () => void;
  isLoading?: boolean;
  hasContent: boolean;
}

export const ChatInputFooter = (props: ChatInputFooterProps) => {
  const handleMicClick = () => {
    const state = useUIStore.getState();
    if (state.voiceModeOpen) {
      window.dispatchEvent(new Event("request-voice-close"));
    } else {
      state.toggleVoiceMode();
    }
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-transparent gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 overflow-visible flex-wrap">
        {!props.isSidebar && (
          <ModelSearchDropdown
            isOpen={props.selectedModelOpen}
            setIsOpen={props.setSelectedModelOpen}
            models={props.models}
            selectedModelId={props.selectedModelId}
            selectedProvider={props.selectedProvider}
            onSelectModel={props.onSelectModel}
            onOpenModelSelector={props.onOpenModelSelector}
            isCompact={props.isCompact}
          />
        )}
        <PermissionModeMenu />
        <PinnedActionBar
          pinnedActions={props.pinnedActions}
          togglePin={props.togglePin}
          supportsReasoning={props.supportsReasoning}
          isThinking={props.isThinking}
          setIsThinking={props.setIsThinking}
          reasoningConfigType={props.reasoningConfigType}
          thinkingEffort={props.thinkingEffort}
          setThinkingEffort={props.setThinkingEffort}
          thinkingBudget={props.thinkingBudget}
          setThinkingBudget={props.setThinkingBudget}
          isWebSearch={props.isWebSearch}
          setIsWebSearch={props.setIsWebSearch}
          isDeepResearch={props.isDeepResearch}
          setIsDeepResearch={props.setIsDeepResearch}
          generativeUI={props.generativeUI}
          setGenerativeUI={props.setGenerativeUI}
          provider={props.selectedProvider}
          isCompact={props.isCompact}
        />
      </div>

      <div className="flex items-center gap-2">
        <ContextTrigger chatId={props.activeChatId} />
        <button
          onClick={handleMicClick}
          type="button"
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 flex items-center justify-center"
          aria-label="Open Voice Mode"
          title="Open Voice Mode"
        >
          <Mic className="w-4 h-4" />
        </button>
        <button
          onClick={() => void props.onSend()}
          type="button"
          disabled={!props.hasContent && !props.isLoading}
          aria-label={props.isLoading ? "Stop response" : "Send message"}
          className={cn(
            "relative p-1.5 rounded-full transition-all duration-300",
            props.isLoading
              ? "bg-rose-500/90 text-foreground shadow-lg shadow-rose-500/20 hover:bg-rose-500"
              : props.hasContent
                ? "bg-primary text-primary-foreground shadow-sm hover:scale-105 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {props.isLoading && (
            <span className="absolute inset-0 rounded-full animate-ping bg-rose-400/30" />
          )}
          {props.isLoading ? (
            <div className="relative w-4 h-4 bg-current rounded-[2px]" />
          ) : (
            <ArrowUp className="w-4 h-4 stroke-[3px]" />
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatInputFooter;
