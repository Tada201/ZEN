import type { SlashSuggestion } from "./chat/input/useSlashCommand";
import type { ComposerLayoutMode } from "./chat/input/PremiumChatInputTypes";
import { PlusActionMenu } from "./chat/input/PlusActionMenu";
import { cn } from "@/lib/utils/style";

/**
 * `ChatInputTextAreaBlock` — the middle row of the chat input
 * composer: the auto-grow textarea and the keyboard handler that mediates
 * slash-popover navigation + Enter-to-send. The welcome variant moves the
 * add-context menu into the lower toolbar for a denser workbench layout.
 *
 * The `welcome` variant nests the textarea inside an inset input well
 * so the workspace setup surface reads as a single refined composer.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer stays well
 * under the 350-line warning limit. Every visible prop is supplied by
 * the composer; this file owns no state of its own.
 */

export interface ChatInputTextAreaBlockProps {
  // PlusActionMenu state
  isPlusMenuOpen: boolean;
  setIsPlusMenuOpen: (open: boolean) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pinnedActions: string[];
  togglePin: (id: string) => void;
  supportsReasoning: boolean;
  isThinking: boolean;
  setIsThinking: (v: boolean) => void;
  isDeepResearch: boolean;
  setIsDeepResearch: (v: boolean) => void;
  isWebSearch: boolean;
  setIsWebSearch: (v: boolean) => void;
  generativeUI: boolean;
  setGenerativeUI: (v: boolean) => void;
  onOpenSkills?: () => void;
  isImageGenEnabled: boolean;
  setIsImageGenEnabled: (v: boolean) => void;
  supportsImageGen: boolean;
  // Textarea
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  // Slash popover state
  slashIsPopoverOpen: boolean;
  slashSelectedIndex: number;
  slashListboxId: string;
  setSlashSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  slashSuggestions: SlashSuggestion[];
  applySlashSuggestion: (s: SlashSuggestion) => void;
  layoutMode: ComposerLayoutMode;
  readOnly?: boolean;
}

export const ChatInputTextAreaBlock = ({
  isPlusMenuOpen,
  setIsPlusMenuOpen,
  handleFileChange,
  pinnedActions,
  togglePin,
  supportsReasoning,
  isThinking,
  setIsThinking,
  isDeepResearch,
  setIsDeepResearch,
  isWebSearch,
  setIsWebSearch,
  generativeUI,
  setGenerativeUI,
  onOpenSkills,
  isImageGenEnabled,
  setIsImageGenEnabled,
  supportsImageGen,
  textareaRef,
  value,
  onChange,
  onSend,
  slashIsPopoverOpen,
  slashSelectedIndex,
  slashListboxId,
  setSlashSelectedIndex,
  slashSuggestions,
  applySlashSuggestion,
  layoutMode,
  readOnly = false,
}: ChatInputTextAreaBlockProps) => {
  const isWelcome = layoutMode === "welcome";

  const textarea = (
    <textarea
      ref={textareaRef}
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (slashIsPopoverOpen) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSlashSelectedIndex((i) =>
              Math.min(i + 1, slashSuggestions.length - 1),
            );
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSlashSelectedIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (
            e.key === "Tab" ||
            (e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing)
          ) {
            e.preventDefault();
            const pick = slashSuggestions[slashSelectedIndex];
            if (pick) applySlashSuggestion(pick);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            // Strip the slash line back to the prior newline so the
            // popover closes and the user keeps anything typed
            // above the `/` invocation.
            const lastNl = value.lastIndexOf("\n");
            const head = value.slice(0, lastNl + 1);
            onChange(head);
            return;
          }
        }
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          void onSend();
        }
      }}
      placeholder={readOnly ? "Archived transcript — unarchive to continue" : "Ask anything... (type / for commands)"}
      aria-label="Message"
      aria-controls={slashIsPopoverOpen ? slashListboxId : undefined}
      aria-expanded={slashIsPopoverOpen ? true : undefined}
      aria-activedescendant={slashIsPopoverOpen ? `${slashListboxId}-option-${slashSelectedIndex}` : undefined}
      aria-autocomplete={slashIsPopoverOpen ? "list" : undefined}
      rows={1}
      className={cn(
        "composer-editor py-1 shadow-none focus:ring-0",
        isWelcome ? "text-[13px]" : "text-[14px]",
        readOnly && "cursor-not-allowed opacity-70",
      )}
      aria-readonly={readOnly || undefined}
    />
  );

  return (
    <div
      className={cn(
        "composer-editor-row",
        isWelcome && "composer-editor-row--welcome",
      )}
    >
      {!isWelcome && !readOnly && (
        <PlusActionMenu
          isOpen={isPlusMenuOpen}
          setIsOpen={setIsPlusMenuOpen}
          onFileSelect={handleFileChange}
          pinnedActions={pinnedActions}
          togglePin={togglePin}
          supportsReasoning={supportsReasoning}
          isThinking={isThinking}
          setIsThinking={setIsThinking}
          isDeepResearch={isDeepResearch}
          setIsDeepResearch={setIsDeepResearch}
          isWebSearch={isWebSearch}
          setIsWebSearch={setIsWebSearch}
          generativeUI={generativeUI}
          setGenerativeUI={setGenerativeUI}
          onOpenSkills={onOpenSkills}
          isImageGenEnabled={isImageGenEnabled}
          setIsImageGenEnabled={setIsImageGenEnabled}
          supportsImageGen={supportsImageGen}
        />
      )}
      {isWelcome ? (
        <div className="flex min-h-[30px] min-w-0 flex-1 items-center px-1 py-0.5">
          {textarea}
        </div>
      ) : (
        <div className="flex min-h-[34px] min-w-0 flex-1 items-center">{textarea}</div>
      )}
    </div>
  );
};

export default ChatInputTextAreaBlock;
