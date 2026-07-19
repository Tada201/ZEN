import type { SlashSuggestion } from "./chat/input/useSlashCommand";
import { PlusActionMenu } from "./chat/input/PlusActionMenu";

/**
 * `ChatInputTextAreaBlock` — the middle row of the chat input
 * composer: the `+` action menu (PlusActionMenu) on the left, the
 * auto-grow textarea on the right, and the keyboard handler that
 * mediates slash-popover navigation + Enter-to-send.
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
  // Textarea
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  // Slash popover state
  slashIsPopoverOpen: boolean;
  slashSelectedIndex: number;
  setSlashSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  slashSuggestions: SlashSuggestion[];
  applySlashSuggestion: (s: SlashSuggestion) => void;
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
  textareaRef,
  value,
  onChange,
  onSend,
  slashIsPopoverOpen,
  slashSelectedIndex,
  setSlashSelectedIndex,
  slashSuggestions,
  applySlashSuggestion,
}: ChatInputTextAreaBlockProps) => {
  return (
    <div className="flex items-start p-3 gap-2">
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
      />

      <div className="flex-1 min-h-[38px] flex items-center">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
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
          placeholder="Ask anything... (type / for commands)"
          aria-label="Message"
          rows={1}
          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none outline-none ring-0 resize-none text-[15px] py-1 text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground shadow-none"
        />
      </div>
    </div>
  );
};

export default ChatInputTextAreaBlock;
