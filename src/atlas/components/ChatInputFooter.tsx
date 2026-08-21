import { ArrowUp, Bookmark, BookmarkCheck, Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils/style";
import { useUIStore } from "@/lib/stores/useUIStore";
import type { ComposerLayoutMode, PremiumChatInputProps } from "./chat/input/PremiumChatInputTypes";
import type { ThinkingEffortLevel } from "./useChatInputModes";
import type { ReasoningCapability } from "@/lib/types/provider";
import { ModelSearchDropdown } from "./chat/input/ModelSearchDropdown";
import { PinnedActionBar } from "./chat/input/PinnedActionBar";
import { PermissionModeMenu } from "./PermissionModeMenu";
import { ContextTrigger } from "./ContextTrigger";
import { PlusActionMenu } from "./chat/input/PlusActionMenu";
import { ComposerSubmitLoader } from "./chat/input/ComposerSubmitLoader";

/**
 * `ChatInputFooter` — the bottom toolbar of the chat input composer:
 * the inline model picker (only when not already pinned to the
 * sidebar header), the permission-mode menu, the pinned action bar,
 * the context-badge trigger, the voice-mode mic, the transport controls
 * (Pause / Resume while a run is active), and the submit button. The
 * submit button is one element across all states: it sends when idle,
 * morphs into a pulsing 3×3 matrix that doubles as Stop while a run is
 * active with an empty input, and returns to a queue-send arrow the moment
 * the user types a follow-up mid-run. Carved out of
 * `PremiumChatInput.tsx` so the composer stays
 * under the 350-line warning limit.
 *
 * Type notes:
 *   * `reasoningCapability` is the backend-resolved capability object; the
 *     pinned bar / add-menu render their reasoning affordance from it.
 *   * `thinkingEffort` / `setThinkingEffort` use the explicit
 *     `ThinkingEffortLevel` alias so contravariant function-arg
 *     compatibility is preserved when forwarding to PinnedActionBar.
 *   * `onSelectModel` is required because `PremiumChatInputProps`
 *     declares it as such.
 */

export interface ChatInputFooterProps {
  layoutMode: ComposerLayoutMode;
  // Welcome-only add-context menu wiring
  isPlusMenuOpen?: boolean;
  setIsPlusMenuOpen?: (open: boolean) => void;
  handleFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSkills?: () => void;
  isImageGenEnabled?: boolean;
  setIsImageGenEnabled?: (value: boolean) => void;
  supportsImageGen?: boolean;
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
  reasoningCapability: ReasoningCapability;
  isThinking: boolean;
  setIsThinking: (v: boolean) => void;
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
  readOnly?: boolean;
  onSend: () => void;
  onAbort?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
  isLoading?: boolean;
  hasContent: boolean;
  // Prompt stash: save the current draft (text + images) to restore later in
  // any thread. `hasStash` switches the button between save and restore.
  onStash?: () => void;
  onRestore?: () => void;
  hasStash?: boolean;
}

export const ChatInputFooter = (props: ChatInputFooterProps) => {
  const isWelcome = props.layoutMode === "welcome";
  const isCompact = props.layoutMode === "sidebar" || props.layoutMode === "narrow";
  const isSidebar = props.layoutMode === "sidebar";
  const showReasoning =
    props.reasoningCapability.support === "always_on" ||
    props.reasoningCapability.support === "toggleable" ||
    props.reasoningCapability.support === "tunable";
  const handleMicClick = () => {
    const state = useUIStore.getState();
    if (state.voiceModeOpen) {
      window.dispatchEvent(new Event("request-voice-close"));
    } else {
      state.toggleVoiceMode();
    }
  };

  if (props.readOnly) {
    return (
      <div className={cn(
        "composer-toolbar flex items-center border-t px-2 py-1.5 text-[11px]",
        isWelcome && "px-2 py-1",
      )}>
        <span>Archived transcript · read-only</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "composer-toolbar grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 bg-transparent",
        isWelcome ? "border-t border-border px-2 py-1" : "px-2 py-1.5",
      )}
    >
      <div className="composer-action-rail flex min-w-0 items-center gap-0.5 overflow-visible">
        {props.setIsPlusMenuOpen && props.handleFileChange && (
          <PlusActionMenu
            isOpen={props.isPlusMenuOpen ?? false}
            setIsOpen={props.setIsPlusMenuOpen}
            onFileSelect={props.handleFileChange}
            pinnedActions={props.pinnedActions}
            togglePin={props.togglePin}
            showReasoning={showReasoning}
            isThinking={props.isThinking}
            setIsThinking={props.setIsThinking}
            isDeepResearch={props.isDeepResearch}
            setIsDeepResearch={props.setIsDeepResearch}
            isWebSearch={props.isWebSearch}
            setIsWebSearch={props.setIsWebSearch}
            generativeUI={props.generativeUI}
            setGenerativeUI={props.setGenerativeUI}
            onOpenSkills={props.onOpenSkills}
            isImageGenEnabled={props.isImageGenEnabled}
            setIsImageGenEnabled={props.setIsImageGenEnabled}
            supportsImageGen={props.supportsImageGen}
            compact
          />
        )}
        {!isSidebar && (
          <ModelSearchDropdown
            isOpen={props.selectedModelOpen}
            setIsOpen={props.setSelectedModelOpen}
            models={props.models}
            selectedModelId={props.selectedModelId}
            selectedProvider={props.selectedProvider}
            onSelectModel={props.onSelectModel}
            onOpenModelSelector={props.onOpenModelSelector}
            isCompact={isCompact}
          />
        )}
        <PermissionModeMenu />
        <PinnedActionBar
          pinnedActions={props.pinnedActions}
          togglePin={props.togglePin}
          reasoningCapability={props.reasoningCapability}
          isThinking={props.isThinking}
          setIsThinking={props.setIsThinking}
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
          isCompact={isCompact}
        />
      </div>

      <div className="composer-fixed-actions flex shrink-0 items-center gap-1.5">
        {props.onStash && props.onRestore && (
          <button
            onClick={() => {
              if (props.hasStash) props.onRestore?.();
              else props.onStash?.();
            }}
            type="button"
            disabled={!props.hasStash && !props.hasContent}
            className={cn(
              "composer-control composer-control--icon p-1.5",
              isWelcome ? "rounded-md" : "rounded-full",
              props.hasStash && "text-primary",
            )}
            aria-label={props.hasStash ? "Restore stashed draft" : "Stash current draft"}
            title={props.hasStash ? "Restore stashed draft in this chat" : "Save current draft to restore later in any chat"}
          >
            {props.hasStash ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
        )}
        <ContextTrigger chatId={props.activeChatId} />
        <button
          onClick={handleMicClick}
          type="button"
          className={cn(
            "composer-control composer-control--icon p-1.5",
            isWelcome ? "rounded-md" : "rounded-full",
          )}
          aria-label="Open Voice Mode"
          title="Open Voice Mode"
        >
          <Mic className="w-4 h-4" />
        </button>
        {props.isLoading && !props.isPaused && props.onPause && (
          <button
            onClick={props.onPause}
            type="button"
            className="flex items-center justify-center gap-1 rounded-md border border-warning px-1.5 py-1 text-[11px] font-medium text-warning hover:bg-warning/10"
            aria-label="Pause response at the next safe boundary"
            title="Pause at the next safe execution boundary"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="composer-footer-action-label">Pause</span>
          </button>
        )}
        {props.isLoading && props.isPaused && props.onResume && (
          <button
            onClick={props.onResume}
            type="button"
            className="flex items-center justify-center gap-1 rounded-md border border-primary px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
            aria-label="Resume paused response"
            title="Resume the paused response"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="composer-footer-action-label">Resume</span>
          </button>
        )}
        {(() => {
          // One button, three meanings:
          //  • idle → Send (needs content)
          //  • running + empty input → Stop (the matrix IS the stop target)
          //  • running + typed follow-up → Queue send
          const running = !!props.isLoading;
          const stopMode = running && !props.hasContent && !!props.onAbort;
          const label = stopMode
            ? "Stop response"
            : running
              ? "Queue message"
              : "Send message";
          const title = stopMode
            ? "Stop this response and keep the partial work"
            : running
              ? "Queue this message — it sends when the current turn finishes"
              : "Send message";
          return (
            <button
              onClick={() => {
                if (stopMode) props.onAbort?.();
                else void props.onSend();
              }}
              type="button"
              disabled={!stopMode && !props.hasContent}
              data-running={stopMode || undefined}
              aria-label={label}
              title={title}
              className={cn(
                "composer-submit relative p-1",
                isWelcome ? "rounded-md" : "rounded-full",
                stopMode
                  ? ""
                  : props.hasContent
                    ? isWelcome
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {stopMode ? (
                <ComposerSubmitLoader />
              ) : (
                <ArrowUp className="h-4 w-4 stroke-[3px]" />
              )}
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export default ChatInputFooter;
