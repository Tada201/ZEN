import type { SlashSuggestion } from "./chat/input/useSlashCommand";
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
  variant?: "default" | "welcome";
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
  textareaRef,
  value,
  onChange,
  onSend,
  slashIsPopoverOpen,
  slashSelectedIndex,
  setSlashSelectedIndex,
  slashSuggestions,
  applySlashSuggestion,
  variant = "default",
  readOnly = false,
}: ChatInputTextAreaBlockProps) => {
  const isWelcome = variant === "welcome";

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
      rows={1}
      className={cn(
        "w-full bg-transparent border-none focus:ring-0 focus:outline-none outline-none ring-0 resize-none py-1 text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground shadow-none",
        isWelcome ? "text-[14px]" : "text-[15px]",
        readOnly && "cursor-not-allowed opacity-70",
      )}
      aria-readonly={readOnly || undefined}
    />
  );

  return (
    <div
      className={cn(
        "flex gap-2",
        isWelcome ? "items-center px-2 pt-1.5 pb-1" : "items-start p-3",
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
        />
      )}
      {isWelcome ? (
        <div className="flex min-h-[32px] flex-1 items-center px-1 py-0.5">
          {textarea}
        </div>
      ) : (
        <div className="flex min-h-[38px] flex-1 items-center">{textarea}</div>
      )}
    </div>
  );
};

export default ChatInputTextAreaBlock;
