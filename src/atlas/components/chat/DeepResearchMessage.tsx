import type { Message } from "./types";
import type { DeepResearchRunMessageProps } from "./deepResearchTypes";
import { ResearchClarificationCard } from "./ResearchClarificationCard";
import { DeepResearchRunMessage } from "./DeepResearchRunMessage";

/**
 * Top-level entry point consumed by `MessageItem`. Routes to the
 * clarification card when the deep-research engine is still collecting
 * scope questions, otherwise hands off to the run view.
 *
 * The actual rendering lives in the two split files; this file stays
 * intentionally thin so future surface changes only touch one of the
 * downstream components.
 */
export function DeepResearchMessage({
    message,
    compact,
    onContinueResearch,
    isChatStreaming,
    messages,
}: DeepResearchRunMessageProps & { message: Message }) {
    if (message.metadata?.researchClarification) {
        return (
            <ResearchClarificationCard
                message={message}
                compact={compact}
                onContinueResearch={onContinueResearch}
            />
        );
    }
    return (
        <DeepResearchRunMessage
            message={message}
            compact={compact}
            isChatStreaming={isChatStreaming}
            messages={messages}
            onContinueResearch={onContinueResearch}
        />
    );
}
