import { FormEvent, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Message } from "./types";

export function ResearchClarificationCard({
    message,
    compact,
    onContinueResearch,
}: {
    message: Message;
    compact?: boolean;
    onContinueResearch?: (request: string) => void;
}) {
    const clarification = message.metadata?.researchClarification;
    const [answers, setAnswers] = useState<string[]>([]);

    useEffect(() => {
        setAnswers(clarification?.questions.map(() => "") || []);
    }, [clarification]);

    const submitClarification = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!clarification || !onContinueResearch) return;
        const responses = clarification.questions
            .map((question, index) => ({ question, answer: answers[index]?.trim() || "Not specified" }));
        onContinueResearch([
            `Original deep-research request: ${clarification.originalQuestion}`,
            "Clarifications supplied by the user:",
            ...responses.map(({ question, answer }) => `- ${question}\n  Answer: ${answer}`),
            "Research the original request using these clarifications as binding scope.",
        ].join("\n"));
    };

    if (!clarification) return null;

    return (
        <div className={cn("flex w-full flex-col px-4", compact ? "py-2" : "py-4")}>
            <form
                onSubmit={submitClarification}
                className="mx-auto w-full max-w-[800px] border border-primary/25 bg-primary/[0.07] p-4 shadow-sm"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center bg-primary/15 text-primary">
                        <Search className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Research scope needed</h3>
                        <p className="text-xs text-muted-foreground">Answer these before research begins.</p>
                    </div>
                </div>
                <div className="space-y-3">
                    {clarification.questions.map((question, index) => (
                        <label
                            key={`${message.id}-${index}`}
                            className="block space-y-1.5 text-xs font-medium text-foreground"
                        >
                            <span>{question}</span>
                            <Input
                                value={answers[index] || ""}
                                onChange={(event) =>
                                    setAnswers((current) =>
                                        current.map((answer, answerIndex) =>
                                            answerIndex === index ? event.target.value : answer,
                                        ),
                                    )
                                }
                                className="h-9 rounded-none border-border/70 bg-background/70 text-sm"
                                autoComplete="off"
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-4 flex justify-end border-t border-border/50 pt-3">
                    <Button type="submit" size="sm" className="h-8 rounded-none text-xs" disabled={!onContinueResearch}>
                        Start research
                    </Button>
                </div>
            </form>
        </div>
    );
}
