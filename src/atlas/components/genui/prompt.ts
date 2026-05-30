import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";

let cachedOpenUISystemPrompt: string | null = null;

export function buildOpenUISystemPrompt(): string {
  if (cachedOpenUISystemPrompt) return cachedOpenUISystemPrompt;

  const promptOptions = { ...openuiPromptOptions, editMode: true, inlineMode: true };
  cachedOpenUISystemPrompt = openuiLibrary.prompt(promptOptions);
  return cachedOpenUISystemPrompt;
}
