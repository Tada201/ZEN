import { useEffect, useMemo, useState } from "react";
import { skillsApi, SlashSuggestionDto } from "@/api/skillsApi";

export interface SlashSuggestion {
  kind: "skill" | "builtin";
  name: string;
  description: string;
  invocationSyntax: string;
}

export interface SlashCommandState {
  isActive: boolean;
  query: string;
  suggestions: SlashSuggestion[];
}

const EMPTY: SlashCommandState = {
  isActive: false,
  query: "",
  suggestions: [],
};

function isSlashContext(text: string): boolean {
  // Only slash when the cursor is on a line whose first non-whitespace char is `/`.
  // Cheap heuristic: look at the text up to the last newline, trim, check prefix.
  const lastNewline = text.lastIndexOf("\n");
  const currentLine = text.slice(lastNewline + 1);
  return currentLine.trimStart().startsWith("/");
}

function extractQuery(text: string): string {
  const lastNewline = text.lastIndexOf("\n");
  const currentLine = text.slice(lastNewline + 1);
  const trimmed = currentLine.trimStart();
  return trimmed.startsWith("/") ? trimmed.slice(1) : "";
}

/**
 * Hook that exposes slash-command popover state for the chat input.
 *
 * Calls `skillsApi.suggestSlash` (debounced via state) when the user is in a
 * slash context, otherwise returns an inactive state. Pure React + React Query
 * would be heavier; raw `useState` + `useEffect` keeps it cheap.
 */
export function useSlashCommand(message: string): SlashCommandState {
  const isActive = useMemo(() => isSlashContext(message), [message]);
  const query = useMemo(() => (isActive ? extractQuery(message) : ""), [message, isActive]);
  const [suggestions, setSuggestions] = useState<SlashSuggestion[]>([]);

  useEffect(() => {
    if (!isActive) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void skillsApi.suggestSlash(query).then((res) => {
        if (cancelled) return;
        setSuggestions(toSuggestions(res));
      });
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, isActive]);

  if (!isActive) return EMPTY;
  return { isActive: true, query, suggestions };
}

function toSuggestions(dtos: SlashSuggestionDto[]): SlashSuggestion[] {
  return dtos.map((d) => ({
    kind: d.kind,
    name: d.name,
    description: d.description,
    invocationSyntax: d.invocation_syntax,
  }));
}
